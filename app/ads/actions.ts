"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getStoragePathFromPublicUrl } from "@/lib/supabase/storage";
import { submitImageGeneration } from "@/lib/fal";
import { submitVideoGeneration } from "@/lib/higgsfield";
import type { AdStatus, AdType } from "@/types";

export type ActionState = { error: string } | null;

const TYPES: AdType[] = ["image", "video"];
const STATUSES: AdStatus[] = ["draft", "approved", "rejected"];

function textOrNull(formData: FormData, key: string) {
  const value = formData.get(key)?.toString().trim();
  return value ? value : null;
}

function typeOrDefault(formData: FormData): AdType {
  const value = formData.get("type")?.toString();
  return (TYPES as string[]).includes(value ?? "") ? (value as AdType) : "image";
}

function statusOrDefault(formData: FormData): AdStatus {
  const value = formData.get("status")?.toString();
  return (STATUSES as string[]).includes(value ?? "") ? (value as AdStatus) : "draft";
}

async function uploadAsset(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  adSetId: string,
  file: File
) {
  const path = `${adSetId}/${Date.now()}-${file.name}`;
  const { error } = await supabase.storage
    .from("creative-assets")
    .upload(path, file, { contentType: file.type });

  if (error) {
    throw new Error(error.message);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("creative-assets").getPublicUrl(path);

  return publicUrl;
}

// Enqueues a fal.ai generation job and returns immediately -- it does NOT
// wait for the image. GET /api/generation-jobs/[id] is polled by the client
// to check progress and finalize the Ad once fal.ai is done.
export async function startImageGeneration(
  adSetId: string
): Promise<{ error: string } | { jobId: string }> {
  const supabase = getSupabaseServerClient();

  const { data: adSet } = await supabase
    .from("ad_sets")
    .select("generated_prompt, aspect_ratio")
    .eq("id", adSetId)
    .single();

  if (!adSet?.generated_prompt) {
    return { error: "This ad set has no generated prompt yet. Save the ad set first." };
  }

  let requestId: string;
  try {
    requestId = await submitImageGeneration(adSet.generated_prompt, adSet.aspect_ratio);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to start image generation." };
  }

  const { data: job, error } = await supabase
    .from("generation_jobs")
    .insert({
      ad_set_id: adSetId,
      provider: "fal-ai",
      external_request_id: requestId,
      status: "processing",
      prompt: adSet.generated_prompt,
    })
    .select("id")
    .single();

  if (error || !job) {
    return { error: error?.message ?? "Failed to record the generation job." };
  }

  return { jobId: job.id };
}

// Enqueues a Higgsfield image-to-video job from an existing image Ad. Only
// valid when that image's Ad Set is set to format "video" -- the Ad Set's
// generated_prompt already phrases itself as a video brief in that case
// ("short vertical ad video, aspect ratio ..."), which is what gets sent to
// Higgsfield as the motion prompt.
export async function startVideoGeneration(
  sourceAdId: string
): Promise<{ error: string } | { jobId: string }> {
  const supabase = getSupabaseServerClient();

  const { data: sourceAd } = await supabase
    .from("ads")
    .select("ad_set_id, type, asset_url")
    .eq("id", sourceAdId)
    .single();

  if (!sourceAd || sourceAd.type !== "image" || !sourceAd.asset_url) {
    return { error: "A generated or uploaded image is required as the source." };
  }

  const { data: adSet } = await supabase
    .from("ad_sets")
    .select("generated_prompt, format")
    .eq("id", sourceAd.ad_set_id)
    .single();

  if (!adSet?.generated_prompt) {
    return { error: "This ad set has no generated prompt yet." };
  }

  if (adSet.format !== "video") {
    return {
      error: "Set this ad set's format to Video before generating a video from its images.",
    };
  }

  let requestId: string;
  try {
    requestId = await submitVideoGeneration(sourceAd.asset_url, adSet.generated_prompt);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to start video generation." };
  }

  const { data: job, error } = await supabase
    .from("generation_jobs")
    .insert({
      ad_set_id: sourceAd.ad_set_id,
      provider: "higgsfield",
      external_request_id: requestId,
      status: "processing",
      prompt: adSet.generated_prompt,
      source_ad_id: sourceAdId,
    })
    .select("id")
    .single();

  if (error || !job) {
    return { error: error?.message ?? "Failed to record the generation job." };
  }

  return { jobId: job.id };
}

export async function createAd(
  adSetId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = getSupabaseServerClient();

  let assetUrl: string | null = null;
  const asset = formData.get("asset");
  if (asset instanceof File && asset.size > 0) {
    try {
      assetUrl = await uploadAsset(supabase, adSetId, asset);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to upload asset." };
    }
  }

  const { data: ad, error } = await supabase
    .from("ads")
    .insert({
      ad_set_id: adSetId,
      label: textOrNull(formData, "label"),
      type: typeOrDefault(formData),
      source: "manual_upload",
      asset_url: assetUrl,
      status: statusOrDefault(formData),
      notes: textOrNull(formData, "notes"),
      headline: textOrNull(formData, "headline"),
      caption: textOrNull(formData, "caption"),
    })
    .select()
    .single();

  if (error || !ad) {
    return { error: error?.message ?? "Failed to create ad." };
  }

  revalidatePath(`/ad-sets/${adSetId}`);
  redirect(`/ads/${ad.id}`);
}

export async function updateAd(
  adId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = getSupabaseServerClient();

  const { data: existing } = await supabase
    .from("ads")
    .select("ad_set_id, asset_url")
    .eq("id", adId)
    .single();

  if (!existing) {
    return { error: "Ad not found." };
  }

  const updates: Record<string, string | null> = {
    label: textOrNull(formData, "label"),
    type: typeOrDefault(formData),
    status: statusOrDefault(formData),
    notes: textOrNull(formData, "notes"),
    headline: textOrNull(formData, "headline"),
    caption: textOrNull(formData, "caption"),
  };

  const asset = formData.get("asset");
  if (asset instanceof File && asset.size > 0) {
    try {
      updates.asset_url = await uploadAsset(supabase, existing.ad_set_id, asset);
      if (existing.asset_url) {
        const oldPath = getStoragePathFromPublicUrl(existing.asset_url, "creative-assets");
        if (oldPath) {
          await supabase.storage.from("creative-assets").remove([oldPath]);
        }
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to upload asset." };
    }
  }

  const { error } = await supabase.from("ads").update(updates).eq("id", adId);
  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/ads/${adId}`);
  revalidatePath(`/ad-sets/${existing.ad_set_id}`);
  redirect(`/ads/${adId}`);
}

export async function deleteAd(adId: string) {
  const supabase = getSupabaseServerClient();

  const { data: ad } = await supabase
    .from("ads")
    .select("ad_set_id, asset_url")
    .eq("id", adId)
    .single();

  if (ad?.asset_url) {
    const path = getStoragePathFromPublicUrl(ad.asset_url, "creative-assets");
    if (path) {
      await supabase.storage.from("creative-assets").remove([path]);
    }
  }

  await supabase.from("ads").delete().eq("id", adId);

  if (ad?.ad_set_id) {
    revalidatePath(`/ad-sets/${ad.ad_set_id}`);
    redirect(`/ad-sets/${ad.ad_set_id}`);
  } else {
    redirect("/campaigns");
  }
}

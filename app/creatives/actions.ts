"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getStoragePathFromPublicUrl } from "@/lib/supabase/storage";
import { submitImageGeneration } from "@/lib/fal";
import { submitVideoGeneration } from "@/lib/higgsfield";
import type { CreativeStatus, CreativeType } from "@/types";

export type ActionState = { error: string } | null;

const TYPES: CreativeType[] = ["image", "video"];
const STATUSES: CreativeStatus[] = ["draft", "approved", "rejected"];

function textOrNull(formData: FormData, key: string) {
  const value = formData.get(key)?.toString().trim();
  return value ? value : null;
}

function typeOrDefault(formData: FormData): CreativeType {
  const value = formData.get("type")?.toString();
  return (TYPES as string[]).includes(value ?? "") ? (value as CreativeType) : "image";
}

function statusOrDefault(formData: FormData): CreativeStatus {
  const value = formData.get("status")?.toString();
  return (STATUSES as string[]).includes(value ?? "") ? (value as CreativeStatus) : "draft";
}

async function uploadAsset(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  conceptId: string,
  file: File
) {
  const path = `${conceptId}/${Date.now()}-${file.name}`;
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
// to check progress and finalize the Creative once fal.ai is done.
export async function startImageGeneration(
  conceptId: string
): Promise<{ error: string } | { jobId: string }> {
  const supabase = getSupabaseServerClient();

  const { data: concept } = await supabase
    .from("concepts")
    .select("generated_prompt, aspect_ratio")
    .eq("id", conceptId)
    .single();

  if (!concept?.generated_prompt) {
    return { error: "This concept has no generated prompt yet. Save the concept first." };
  }

  let requestId: string;
  try {
    requestId = await submitImageGeneration(concept.generated_prompt, concept.aspect_ratio);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to start image generation." };
  }

  const { data: job, error } = await supabase
    .from("generation_jobs")
    .insert({
      concept_id: conceptId,
      provider: "fal-ai",
      external_request_id: requestId,
      status: "processing",
      prompt: concept.generated_prompt,
    })
    .select("id")
    .single();

  if (error || !job) {
    return { error: error?.message ?? "Failed to record the generation job." };
  }

  return { jobId: job.id };
}

// Enqueues a Higgsfield image-to-video job from an existing image Creative.
// Only valid when that image's Concept is set to format "video" -- the
// Concept's generated_prompt already phrases itself as a video brief in that
// case ("short vertical ad video, aspect ratio ..."), which is what gets sent
// to Higgsfield as the motion prompt.
export async function startVideoGeneration(
  sourceCreativeId: string
): Promise<{ error: string } | { jobId: string }> {
  const supabase = getSupabaseServerClient();

  const { data: sourceCreative } = await supabase
    .from("creatives")
    .select("concept_id, type, asset_url")
    .eq("id", sourceCreativeId)
    .single();

  if (!sourceCreative || sourceCreative.type !== "image" || !sourceCreative.asset_url) {
    return { error: "A generated or uploaded image is required as the source." };
  }

  const { data: concept } = await supabase
    .from("concepts")
    .select("generated_prompt, format")
    .eq("id", sourceCreative.concept_id)
    .single();

  if (!concept?.generated_prompt) {
    return { error: "This concept has no generated prompt yet." };
  }

  if (concept.format !== "video") {
    return {
      error: "Set this concept's format to Video before generating a video from its images.",
    };
  }

  let requestId: string;
  try {
    requestId = await submitVideoGeneration(sourceCreative.asset_url, concept.generated_prompt);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to start video generation." };
  }

  const { data: job, error } = await supabase
    .from("generation_jobs")
    .insert({
      concept_id: sourceCreative.concept_id,
      provider: "higgsfield",
      external_request_id: requestId,
      status: "processing",
      prompt: concept.generated_prompt,
      source_creative_id: sourceCreativeId,
    })
    .select("id")
    .single();

  if (error || !job) {
    return { error: error?.message ?? "Failed to record the generation job." };
  }

  return { jobId: job.id };
}

export async function createCreative(
  conceptId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = getSupabaseServerClient();

  let assetUrl: string | null = null;
  const asset = formData.get("asset");
  if (asset instanceof File && asset.size > 0) {
    try {
      assetUrl = await uploadAsset(supabase, conceptId, asset);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to upload asset." };
    }
  }

  const { data: creative, error } = await supabase
    .from("creatives")
    .insert({
      concept_id: conceptId,
      label: textOrNull(formData, "label"),
      type: typeOrDefault(formData),
      source: "manual_upload",
      asset_url: assetUrl,
      status: statusOrDefault(formData),
      notes: textOrNull(formData, "notes"),
    })
    .select()
    .single();

  if (error || !creative) {
    return { error: error?.message ?? "Failed to create creative." };
  }

  revalidatePath(`/concepts/${conceptId}`);
  redirect(`/creatives/${creative.id}`);
}

export async function updateCreative(
  creativeId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = getSupabaseServerClient();

  const { data: existing } = await supabase
    .from("creatives")
    .select("concept_id, asset_url")
    .eq("id", creativeId)
    .single();

  if (!existing) {
    return { error: "Creative not found." };
  }

  const updates: Record<string, string | null> = {
    label: textOrNull(formData, "label"),
    type: typeOrDefault(formData),
    status: statusOrDefault(formData),
    notes: textOrNull(formData, "notes"),
  };

  const asset = formData.get("asset");
  if (asset instanceof File && asset.size > 0) {
    try {
      updates.asset_url = await uploadAsset(supabase, existing.concept_id, asset);
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

  const { error } = await supabase.from("creatives").update(updates).eq("id", creativeId);
  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/creatives/${creativeId}`);
  revalidatePath(`/concepts/${existing.concept_id}`);
  redirect(`/creatives/${creativeId}`);
}

export async function deleteCreative(creativeId: string) {
  const supabase = getSupabaseServerClient();

  const { data: creative } = await supabase
    .from("creatives")
    .select("concept_id, asset_url")
    .eq("id", creativeId)
    .single();

  if (creative?.asset_url) {
    const path = getStoragePathFromPublicUrl(creative.asset_url, "creative-assets");
    if (path) {
      await supabase.storage.from("creative-assets").remove([path]);
    }
  }

  await supabase.from("creatives").delete().eq("id", creativeId);

  if (creative?.concept_id) {
    revalidatePath(`/concepts/${creative.concept_id}`);
    redirect(`/concepts/${creative.concept_id}`);
  } else {
    redirect("/dashboard");
  }
}

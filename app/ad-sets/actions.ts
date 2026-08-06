"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getStoragePathFromPublicUrl } from "@/lib/supabase/storage";
import { buildAdSetPrompt } from "@/lib/promptTemplate";
import { submitImageGeneration } from "@/lib/fal";
import { submitVideoGeneration } from "@/lib/higgsfield";
import { submitStitch } from "@/lib/shotstack";
import { generateClipScript } from "@/lib/anthropic";
import type { AdSetFormat } from "@/types";
import type { AdSetSuggestion } from "@/lib/anthropic";

export type ActionState = { error: string } | null;

const FORMATS: AdSetFormat[] = ["static_image", "video"];

function textOrNull(formData: FormData, key: string) {
  const value = formData.get(key)?.toString().trim();
  return value ? value : null;
}

function formatOrDefault(formData: FormData): AdSetFormat {
  const value = formData.get("format")?.toString();
  return (FORMATS as string[]).includes(value ?? "") ? (value as AdSetFormat) : "static_image";
}

function fieldsFromForm(formData: FormData) {
  return {
    name: textOrNull(formData, "name"),
    messaging_angle: textOrNull(formData, "messaging_angle"),
    target_emotion: textOrNull(formData, "target_emotion"),
    visual_style_override: textOrNull(formData, "visual_style_override"),
    tone_override: textOrNull(formData, "tone_override"),
    setting_scene: textOrNull(formData, "setting_scene"),
    key_message: textOrNull(formData, "key_message"),
    call_to_action: textOrNull(formData, "call_to_action"),
    format: formatOrDefault(formData),
    aspect_ratio: textOrNull(formData, "aspect_ratio") ?? "1:1",
  };
}

// Fetches the parent Campaign fields the deterministic prompt template (and
// the AI copy/script generators) need.
async function getPromptContext(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  campaignId: string
) {
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("name, description, brand_voice, visual_style, audience, benefits, offer, objective")
    .eq("id", campaignId)
    .single();

  if (!campaign) return null;

  return campaign;
}

export async function createAdSet(
  campaignId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const fields = fieldsFromForm(formData);
  if (!fields.name) {
    return { error: "Ad set name is required." };
  }

  const supabase = getSupabaseServerClient();
  const context = await getPromptContext(supabase, campaignId);
  if (!context) {
    return { error: "Could not find the parent campaign." };
  }

  const generatedPrompt = buildAdSetPrompt(context, fields);

  const { data: adSet, error } = await supabase
    .from("ad_sets")
    .insert({
      campaign_id: campaignId,
      ...fields,
      generated_prompt: generatedPrompt,
    })
    .select()
    .single();

  if (error || !adSet) {
    return { error: error?.message ?? "Failed to create ad set." };
  }

  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/ad-sets/${adSet.id}`);
}

export async function updateAdSet(
  adSetId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const fields = fieldsFromForm(formData);
  if (!fields.name) {
    return { error: "Ad set name is required." };
  }

  const supabase = getSupabaseServerClient();

  const { data: existing } = await supabase
    .from("ad_sets")
    .select("campaign_id")
    .eq("id", adSetId)
    .single();

  if (!existing) {
    return { error: "Ad set not found." };
  }

  const context = await getPromptContext(supabase, existing.campaign_id);
  if (!context) {
    return { error: "Could not find the parent campaign." };
  }

  const generatedPrompt = buildAdSetPrompt(context, fields);

  const { error } = await supabase
    .from("ad_sets")
    .update({ ...fields, generated_prompt: generatedPrompt })
    .eq("id", adSetId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/ad-sets/${adSetId}`);
  revalidatePath(`/campaigns/${existing.campaign_id}`);
  redirect(`/ad-sets/${adSetId}`);
}

// Starts the video pipeline for a video-format Ad Set: a reference image
// (fal.ai, same path a static_image Ad Set uses) plus a 5-clip UGC script
// (Claude), written immediately since the script is text-only and doesn't
// need the reference image to finish first. Clips are NOT generated yet --
// that only happens once the script is reviewed (see generateAllClips).
export async function startVideoAdSetGeneration(
  adSetId: string
): Promise<{ error: string } | { referenceJobId: string; clipsCreated: number }> {
  const supabase = getSupabaseServerClient();

  const { data: adSet } = await supabase
    .from("ad_sets")
    .select(
      "campaign_id, format, generated_prompt, aspect_ratio, messaging_angle, target_emotion, tone_override, visual_style_override, setting_scene, key_message, call_to_action"
    )
    .eq("id", adSetId)
    .single();

  if (!adSet) return { error: "Ad set not found." };
  if (adSet.format !== "video") return { error: "This ad set's format is not Video." };
  if (!adSet.generated_prompt) return { error: "This ad set has no generated prompt yet." };

  const { data: existingClips } = await supabase
    .from("ad_clips")
    .select("id")
    .eq("ad_set_id", adSetId)
    .limit(1);

  if (existingClips && existingClips.length > 0) {
    return { error: "This ad set already has a clip script." };
  }

  const campaign = await getPromptContext(supabase, adSet.campaign_id);
  if (!campaign) return { error: "Could not find the parent campaign." };

  let referenceJobId: string;
  try {
    const requestId = await submitImageGeneration(adSet.generated_prompt, adSet.aspect_ratio);
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
      return { error: error?.message ?? "Failed to record the reference image job." };
    }
    referenceJobId = job.id;
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to start the reference image generation.",
    };
  }

  let script;
  try {
    script = await generateClipScript({ campaign, adSet });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to write the clip script." };
  }

  const clipRows = script.clips.map((clip, index) => ({
    ad_set_id: adSetId,
    clip_number: index + 1,
    script: clip.description,
    status: "draft",
  }));

  const { error: clipsError } = await supabase.from("ad_clips").insert(clipRows);
  if (clipsError) {
    return { error: clipsError.message };
  }

  revalidatePath(`/ad-sets/${adSetId}`);
  return { referenceJobId, clipsCreated: clipRows.length };
}

export async function updateAdClipScript(clipId: string, script: string): Promise<ActionState> {
  const supabase = getSupabaseServerClient();

  const { data: clip, error } = await supabase
    .from("ad_clips")
    .update({ script })
    .eq("id", clipId)
    .select("ad_set_id")
    .single();

  if (error || !clip) {
    return { error: error?.message ?? "Failed to update the clip script." };
  }

  revalidatePath(`/ad-sets/${clip.ad_set_id}`);
  return null;
}

// Generates (or retries) every draft/failed clip for a video Ad Set, once
// the script has been reviewed. Requires the reference image to have
// finished first, since every clip is generated from it.
export async function generateAllClips(
  adSetId: string
): Promise<{ error: string } | { jobIds: string[] }> {
  const supabase = getSupabaseServerClient();

  const { data: referenceAd } = await supabase
    .from("ads")
    .select("asset_url")
    .eq("ad_set_id", adSetId)
    .eq("label", "Reference Image")
    .not("asset_url", "is", null)
    .maybeSingle();

  if (!referenceAd?.asset_url) {
    return { error: "The reference image hasn't finished generating yet." };
  }

  const { data: clips } = await supabase
    .from("ad_clips")
    .select("id, script, status")
    .eq("ad_set_id", adSetId)
    .order("clip_number", { ascending: true });

  const pendingClips = (clips ?? []).filter(
    (clip) => clip.status === "draft" || clip.status === "failed"
  );

  if (pendingClips.length === 0) {
    return { error: "No clips left to generate." };
  }

  const jobIds: string[] = [];
  for (const clip of pendingClips) {
    try {
      const requestId = await submitVideoGeneration(referenceAd.asset_url, clip.script);
      const { data: job, error } = await supabase
        .from("generation_jobs")
        .insert({
          ad_set_id: adSetId,
          clip_id: clip.id,
          provider: "higgsfield",
          external_request_id: requestId,
          status: "processing",
          prompt: clip.script,
        })
        .select("id")
        .single();

      if (error || !job) continue;
      await supabase.from("ad_clips").update({ status: "processing" }).eq("id", clip.id);
      jobIds.push(job.id);
    } catch {
      // Leave this clip in draft/failed -- it can be retried individually later.
    }
  }

  if (jobIds.length === 0) {
    return { error: "Failed to start generation for any clip." };
  }

  revalidatePath(`/ad-sets/${adSetId}`);
  return { jobIds };
}

// Stitches the 5 completed clips into one final video Ad via Shotstack.
export async function stitchAdClips(
  adSetId: string
): Promise<{ error: string } | { jobId: string }> {
  const supabase = getSupabaseServerClient();

  const { data: clips } = await supabase
    .from("ad_clips")
    .select("clip_number, status, asset_url")
    .eq("ad_set_id", adSetId)
    .order("clip_number", { ascending: true });

  if (!clips || clips.length === 0) {
    return { error: "No clips found for this ad set." };
  }

  const incomplete = clips.some((clip) => clip.status !== "completed" || !clip.asset_url);
  if (incomplete) {
    return { error: "All clips must finish generating before stitching." };
  }

  const clipUrls = clips.map((clip) => clip.asset_url!);

  let renderId: string;
  try {
    renderId = await submitStitch(clipUrls);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to start stitching." };
  }

  const { data: job, error } = await supabase
    .from("generation_jobs")
    .insert({
      ad_set_id: adSetId,
      provider: "shotstack",
      external_request_id: renderId,
      status: "processing",
    })
    .select("id")
    .single();

  if (error || !job) {
    return { error: error?.message ?? "Failed to record the stitch job." };
  }

  revalidatePath(`/ad-sets/${adSetId}`);
  return { jobId: job.id };
}

// Persists the AI-suggested ad sets the user chose to keep in the preview
// UI, and immediately starts producing the finished ad for each one: an
// image generation for static_image picks, or a reference image + 5-clip
// script for video picks. Nothing from suggestAdSetsForCampaign() is ever
// written to the database until this runs.
export async function saveSuggestedAdSets(
  campaignId: string,
  suggestions: AdSetSuggestion[]
): Promise<{ error: string } | { adSetsCreated: number; generationsStarted: number }> {
  if (suggestions.length === 0) {
    return { error: "No ad sets selected." };
  }

  const supabase = getSupabaseServerClient();
  const context = await getPromptContext(supabase, campaignId);
  if (!context) {
    return { error: "Could not find the parent campaign." };
  }

  const rows = suggestions.map((suggestion) => {
    // AI suggestions inherit the campaign's voice/style rather than
    // overriding them, so these are always null here (same as leaving the
    // fields blank in the manual Ad Set form).
    const fields = { ...suggestion, visual_style_override: null, tone_override: null };
    return {
      campaign_id: campaignId,
      ...fields,
      generated_prompt: buildAdSetPrompt(context, fields),
    };
  });

  const { data: savedAdSets, error } = await supabase
    .from("ad_sets")
    .insert(rows)
    .select("id, format");

  if (error || !savedAdSets) {
    return { error: error?.message ?? "Failed to save ad sets." };
  }

  let generationsStarted = 0;

  for (let i = 0; i < savedAdSets.length; i++) {
    const adSet = savedAdSets[i];

    if (adSet.format === "video") {
      const result = await startVideoAdSetGeneration(adSet.id);
      if (!("error" in result)) generationsStarted += 1;
      continue;
    }

    const { generated_prompt: generatedPrompt, aspect_ratio: aspectRatio } = rows[i];
    if (!generatedPrompt) continue;

    try {
      const requestId = await submitImageGeneration(generatedPrompt, aspectRatio);
      await supabase.from("generation_jobs").insert({
        ad_set_id: adSet.id,
        provider: "fal-ai",
        external_request_id: requestId,
        status: "processing",
        prompt: generatedPrompt,
      });
      generationsStarted += 1;
    } catch {
      // Leave this ad set without a generation started -- it can still be
      // generated manually later from its own page.
    }
  }

  revalidatePath(`/campaigns/${campaignId}`);
  return { adSetsCreated: savedAdSets.length, generationsStarted };
}

export async function deleteAdSet(adSetId: string) {
  const supabase = getSupabaseServerClient();

  const { data: adSet } = await supabase
    .from("ad_sets")
    .select("campaign_id")
    .eq("id", adSetId)
    .single();

  const { data: ads } = await supabase
    .from("ads")
    .select("asset_url")
    .eq("ad_set_id", adSetId);

  const paths = (ads ?? [])
    .map((ad) => (ad.asset_url ? getStoragePathFromPublicUrl(ad.asset_url, "creative-assets") : null))
    .filter((path): path is string => Boolean(path));

  if (paths.length > 0) {
    await supabase.storage.from("creative-assets").remove(paths);
  }

  // ads and ad_clips rows cascade-delete via FK constraints.
  await supabase.from("ad_sets").delete().eq("id", adSetId);

  if (adSet?.campaign_id) {
    revalidatePath(`/campaigns/${adSet.campaign_id}`);
    redirect(`/campaigns/${adSet.campaign_id}`);
  } else {
    redirect("/campaigns");
  }
}

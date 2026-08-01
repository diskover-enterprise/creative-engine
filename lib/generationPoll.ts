import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getStoragePathFromPublicUrl } from "@/lib/supabase/storage";
import { getImageGenerationStatus, getImageGenerationResult } from "@/lib/fal";
import { getVideoGenerationStatus } from "@/lib/higgsfield";
import type { GenerationJob } from "@/types";

export type Supabase = ReturnType<typeof getSupabaseServerClient>;
export type PollResult =
  | { status: "processing" }
  | { status: "completed"; creativeId: string }
  | { status: "failed"; error: string };

async function markFailed(supabase: Supabase, jobId: string, message: string): Promise<PollResult> {
  await supabase.from("generation_jobs").update({ status: "failed", error: message }).eq("id", jobId);
  return { status: "failed", error: message };
}

async function pollFalJob(supabase: Supabase, job: GenerationJob): Promise<PollResult> {
  let falStatus: string;
  try {
    falStatus = await getImageGenerationStatus(job.external_request_id);
  } catch (err) {
    return markFailed(
      supabase,
      job.id,
      err instanceof Error ? err.message : "Failed to check generation status."
    );
  }

  if (falStatus !== "COMPLETED") {
    return { status: "processing" };
  }

  try {
    const generated = await getImageGenerationResult(job.external_request_id);

    const imageResponse = await fetch(generated.url);
    if (!imageResponse.ok) {
      throw new Error("Failed to download the generated image from fal.ai.");
    }
    const imageBytes = new Uint8Array(await imageResponse.arrayBuffer());

    const extension = generated.contentType === "image/png" ? "png" : "jpg";
    const path = `${job.concept_id}/${Date.now()}-fal-generated.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("creative-assets")
      .upload(path, imageBytes, { contentType: generated.contentType });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("creative-assets").getPublicUrl(path);

    const { data: creative, error: insertError } = await supabase
      .from("creatives")
      .insert({
        concept_id: job.concept_id,
        type: "image",
        source: "ai_generated",
        provider: "fal-ai",
        generation_prompt: job.prompt,
        asset_url: publicUrl,
        status: "draft",
      })
      .select("id")
      .single();

    if (insertError || !creative) {
      const storagePath = getStoragePathFromPublicUrl(publicUrl, "creative-assets");
      if (storagePath) {
        await supabase.storage.from("creative-assets").remove([storagePath]);
      }
      throw new Error(insertError?.message ?? "Failed to save the generated creative.");
    }

    await supabase
      .from("generation_jobs")
      .update({ status: "completed", creative_id: creative.id })
      .eq("id", job.id);

    return { status: "completed", creativeId: creative.id };
  } catch (err) {
    return markFailed(
      supabase,
      job.id,
      err instanceof Error ? err.message : "Failed to finalize the generated creative."
    );
  }
}

async function pollHiggsfieldJob(supabase: Supabase, job: GenerationJob): Promise<PollResult> {
  let statusResponse: Awaited<ReturnType<typeof getVideoGenerationStatus>>;
  try {
    statusResponse = await getVideoGenerationStatus(job.external_request_id);
  } catch (err) {
    return markFailed(
      supabase,
      job.id,
      err instanceof Error ? err.message : "Failed to check generation status."
    );
  }

  if (statusResponse.status === "failed" || statusResponse.status === "nsfw") {
    return markFailed(
      supabase,
      job.id,
      statusResponse.status === "nsfw"
        ? "Higgsfield flagged this generation as NSFW."
        : "Higgsfield generation failed."
    );
  }

  if (statusResponse.status !== "completed" || !statusResponse.video?.url) {
    return { status: "processing" };
  }

  try {
    const videoResponse = await fetch(statusResponse.video.url);
    if (!videoResponse.ok) {
      throw new Error("Failed to download the generated video from Higgsfield.");
    }
    const videoBytes = new Uint8Array(await videoResponse.arrayBuffer());
    const path = `${job.concept_id}/${Date.now()}-higgsfield-generated.mp4`;

    const { error: uploadError } = await supabase.storage
      .from("creative-assets")
      .upload(path, videoBytes, { contentType: "video/mp4" });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("creative-assets").getPublicUrl(path);

    const { data: creative, error: insertError } = await supabase
      .from("creatives")
      .insert({
        concept_id: job.concept_id,
        type: "video",
        source: "ai_generated",
        provider: "higgsfield",
        generation_prompt: job.prompt,
        asset_url: publicUrl,
        status: "draft",
        source_creative_id: job.source_creative_id,
      })
      .select("id")
      .single();

    if (insertError || !creative) {
      const storagePath = getStoragePathFromPublicUrl(publicUrl, "creative-assets");
      if (storagePath) {
        await supabase.storage.from("creative-assets").remove([storagePath]);
      }
      throw new Error(insertError?.message ?? "Failed to save the generated creative.");
    }

    await supabase
      .from("generation_jobs")
      .update({ status: "completed", creative_id: creative.id })
      .eq("id", job.id);

    return { status: "completed", creativeId: creative.id };
  } catch (err) {
    return markFailed(
      supabase,
      job.id,
      err instanceof Error ? err.message : "Failed to finalize the generated creative."
    );
  }
}

// Shared by the per-job poll route (app/api/generation-jobs/[id]/route.ts,
// called by the browser while a user watches) and the cron finalizer
// (app/api/cron/finalize-generations/route.ts, called on a schedule so jobs
// still finish even if nobody's watching -- which automated runs need, since
// nothing keeps a browser tab open for those).
export async function pollGenerationJob(supabase: Supabase, job: GenerationJob): Promise<PollResult> {
  if (job.status === "completed" || job.status === "failed") {
    return job.status === "completed"
      ? { status: "completed", creativeId: job.creative_id! }
      : { status: "failed", error: job.error ?? "Unknown error." };
  }

  return job.provider === "higgsfield"
    ? pollHiggsfieldJob(supabase, job)
    : pollFalJob(supabase, job);
}

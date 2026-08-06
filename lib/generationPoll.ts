import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getStoragePathFromPublicUrl } from "@/lib/supabase/storage";
import { getImageGenerationStatus, getImageGenerationResult } from "@/lib/fal";
import { getVideoGenerationStatus } from "@/lib/higgsfield";
import { getStitchStatus } from "@/lib/shotstack";
import { generateAdCopy } from "@/lib/anthropic";
import type { GenerationJob } from "@/types";

export type Supabase = ReturnType<typeof getSupabaseServerClient>;
export type PollResult =
  | { status: "processing" }
  | { status: "completed"; adId?: string; clipId?: string }
  | { status: "failed"; error: string };

async function markFailed(supabase: Supabase, job: GenerationJob, message: string): Promise<PollResult> {
  await supabase.from("generation_jobs").update({ status: "failed", error: message }).eq("id", job.id);
  if (job.clip_id) {
    await supabase.from("ad_clips").update({ status: "failed", error: message }).eq("id", job.clip_id);
  }
  return { status: "failed", error: message };
}

// Writes the headline/caption for a completed image Ad -- but only for a
// static_image Ad Set. A video Ad Set's reference image goes through this
// same fal.ai path and must NOT get ad copy, since it's never shown as a
// finished ad on its own. Copy generation failing shouldn't fail the image
// job itself, so errors are swallowed here.
async function attachAdCopy(supabase: Supabase, adId: string, adSetId: string) {
  const { data: adSet } = await supabase
    .from("ad_sets")
    .select(
      "campaign_id, format, messaging_angle, target_emotion, tone_override, visual_style_override, setting_scene, key_message, call_to_action"
    )
    .eq("id", adSetId)
    .single();

  if (!adSet || adSet.format !== "static_image") return;

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("name, description, brand_voice, visual_style, audience, benefits, offer, objective")
    .eq("id", adSet.campaign_id)
    .single();

  if (!campaign) return;

  try {
    const copy = await generateAdCopy({ campaign, adSet });
    await supabase.from("ads").update({ headline: copy.headline, caption: copy.caption }).eq("id", adId);
  } catch {
    // Leave headline/caption blank -- the image itself still finalizes fine.
  }
}

async function pollFalJob(supabase: Supabase, job: GenerationJob): Promise<PollResult> {
  let falStatus: string;
  try {
    falStatus = await getImageGenerationStatus(job.external_request_id);
  } catch (err) {
    return markFailed(
      supabase,
      job,
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
    const path = `${job.ad_set_id}/${Date.now()}-fal-generated.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("creative-assets")
      .upload(path, imageBytes, { contentType: generated.contentType });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("creative-assets").getPublicUrl(path);

    // A video Ad Set uses this same fal.ai path for its UGC reference image
    // rather than a finished ad, so it's labeled distinctly and skips ad copy.
    const { data: adSet } = await supabase
      .from("ad_sets")
      .select("format")
      .eq("id", job.ad_set_id)
      .single();
    const isReferenceImage = adSet?.format === "video";

    const { data: ad, error: insertError } = await supabase
      .from("ads")
      .insert({
        ad_set_id: job.ad_set_id,
        label: isReferenceImage ? "Reference Image" : null,
        type: "image",
        source: "ai_generated",
        provider: "fal-ai",
        generation_prompt: job.prompt,
        asset_url: publicUrl,
        status: "draft",
      })
      .select("id")
      .single();

    if (insertError || !ad) {
      const storagePath = getStoragePathFromPublicUrl(publicUrl, "creative-assets");
      if (storagePath) {
        await supabase.storage.from("creative-assets").remove([storagePath]);
      }
      throw new Error(insertError?.message ?? "Failed to save the generated ad.");
    }

    await supabase
      .from("generation_jobs")
      .update({ status: "completed", ad_id: ad.id })
      .eq("id", job.id);

    if (!isReferenceImage) {
      await attachAdCopy(supabase, ad.id, job.ad_set_id);
    }

    return { status: "completed", adId: ad.id };
  } catch (err) {
    return markFailed(
      supabase,
      job,
      err instanceof Error ? err.message : "Failed to finalize the generated ad."
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
      job,
      err instanceof Error ? err.message : "Failed to check generation status."
    );
  }

  if (statusResponse.status === "failed" || statusResponse.status === "nsfw") {
    return markFailed(
      supabase,
      job,
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
    const path = `${job.ad_set_id}/${Date.now()}-higgsfield-generated.mp4`;

    const { error: uploadError } = await supabase.storage
      .from("creative-assets")
      .upload(path, videoBytes, { contentType: "video/mp4" });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("creative-assets").getPublicUrl(path);

    // A per-clip job (part of a video Ad Set's 5-clip script) finalizes into
    // ad_clips. Anything else is the legacy single-shot "generate video from
    // this image" flow, which finalizes into a new Ad as before.
    if (job.clip_id) {
      const { error: updateError } = await supabase
        .from("ad_clips")
        .update({ status: "completed", asset_url: publicUrl })
        .eq("id", job.clip_id);

      if (updateError) {
        const storagePath = getStoragePathFromPublicUrl(publicUrl, "creative-assets");
        if (storagePath) {
          await supabase.storage.from("creative-assets").remove([storagePath]);
        }
        throw new Error(updateError.message);
      }

      await supabase.from("generation_jobs").update({ status: "completed" }).eq("id", job.id);
      return { status: "completed", clipId: job.clip_id };
    }

    const { data: ad, error: insertError } = await supabase
      .from("ads")
      .insert({
        ad_set_id: job.ad_set_id,
        type: "video",
        source: "ai_generated",
        provider: "higgsfield",
        generation_prompt: job.prompt,
        asset_url: publicUrl,
        status: "draft",
        source_ad_id: job.source_ad_id,
      })
      .select("id")
      .single();

    if (insertError || !ad) {
      const storagePath = getStoragePathFromPublicUrl(publicUrl, "creative-assets");
      if (storagePath) {
        await supabase.storage.from("creative-assets").remove([storagePath]);
      }
      throw new Error(insertError?.message ?? "Failed to save the generated ad.");
    }

    await supabase
      .from("generation_jobs")
      .update({ status: "completed", ad_id: ad.id })
      .eq("id", job.id);

    return { status: "completed", adId: ad.id };
  } catch (err) {
    return markFailed(
      supabase,
      job,
      err instanceof Error ? err.message : "Failed to finalize the generated ad."
    );
  }
}

async function pollShotstackJob(supabase: Supabase, job: GenerationJob): Promise<PollResult> {
  let statusResponse: Awaited<ReturnType<typeof getStitchStatus>>;
  try {
    statusResponse = await getStitchStatus(job.external_request_id);
  } catch (err) {
    return markFailed(
      supabase,
      job,
      err instanceof Error ? err.message : "Failed to check stitch status."
    );
  }

  if (statusResponse.status === "failed") {
    return markFailed(supabase, job, statusResponse.error ?? "Shotstack render failed.");
  }

  if (statusResponse.status !== "done" || !statusResponse.url) {
    return { status: "processing" };
  }

  try {
    const videoResponse = await fetch(statusResponse.url);
    if (!videoResponse.ok) {
      throw new Error("Failed to download the stitched video from Shotstack.");
    }
    const videoBytes = new Uint8Array(await videoResponse.arrayBuffer());
    const path = `${job.ad_set_id}/${Date.now()}-shotstack-stitched.mp4`;

    const { error: uploadError } = await supabase.storage
      .from("creative-assets")
      .upload(path, videoBytes, { contentType: "video/mp4" });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("creative-assets").getPublicUrl(path);

    const { data: ad, error: insertError } = await supabase
      .from("ads")
      .insert({
        ad_set_id: job.ad_set_id,
        label: "Final Video Ad",
        type: "video",
        source: "ai_generated",
        provider: "shotstack",
        asset_url: publicUrl,
        status: "draft",
      })
      .select("id")
      .single();

    if (insertError || !ad) {
      const storagePath = getStoragePathFromPublicUrl(publicUrl, "creative-assets");
      if (storagePath) {
        await supabase.storage.from("creative-assets").remove([storagePath]);
      }
      throw new Error(insertError?.message ?? "Failed to save the stitched ad.");
    }

    await supabase
      .from("generation_jobs")
      .update({ status: "completed", ad_id: ad.id })
      .eq("id", job.id);

    return { status: "completed", adId: ad.id };
  } catch (err) {
    return markFailed(
      supabase,
      job,
      err instanceof Error ? err.message : "Failed to finalize the stitched video."
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
    if (job.status === "failed") {
      return { status: "failed", error: job.error ?? "Unknown error." };
    }
    return job.clip_id
      ? { status: "completed", clipId: job.clip_id }
      : { status: "completed", adId: job.ad_id! };
  }

  if (job.provider === "shotstack") return pollShotstackJob(supabase, job);
  if (job.provider === "higgsfield") return pollHiggsfieldJob(supabase, job);
  return pollFalJob(supabase, job);
}

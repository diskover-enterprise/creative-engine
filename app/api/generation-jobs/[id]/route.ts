import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { pollGenerationJob } from "@/lib/generationPoll";
import type { GenerationJob } from "@/types";

// Polled by the client every few seconds after startImageGeneration() /
// startVideoGeneration() enqueues a job. Each call is short-lived: it checks
// the provider's status once, and only does the (still fast)
// download+upload+insert work on the single poll where the job first shows
// as completed.
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/generation-jobs/[id]">
) {
  const { id } = await ctx.params;
  const supabase = getSupabaseServerClient();

  const { data: job } = await supabase
    .from("generation_jobs")
    .select("*")
    .eq("id", id)
    .single();

  if (!job) {
    return NextResponse.json({ status: "failed", error: "Job not found." }, { status: 404 });
  }

  const result = await pollGenerationJob(supabase, job as GenerationJob);

  return NextResponse.json(
    result.status === "completed"
      ? { status: "completed", adId: result.adId, clipId: result.clipId }
      : result
  );
}

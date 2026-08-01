import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { pollGenerationJob } from "@/lib/generationPoll";
import type { GenerationJob } from "@/types";

// Hit on a schedule (see .github/workflows/finalize-generations.yml) rather
// than by a browser tab -- this is what lets automated generation runs
// (nobody watching) actually finish, since the per-job route above only ever
// gets polled while a user has a page open.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();

  const { data: jobs } = await supabase
    .from("generation_jobs")
    .select("*")
    .eq("status", "processing");

  const results = await Promise.all(
    (jobs ?? []).map(async (job) => {
      const result = await pollGenerationJob(supabase, job as GenerationJob);
      return { jobId: job.id, ...result };
    })
  );

  return NextResponse.json({ checked: results.length, results });
}

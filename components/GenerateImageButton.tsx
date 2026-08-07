"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FormError } from "@/components/FormStatus";
import { startImageGeneration } from "@/app/ads/actions";

type Phase = "idle" | "starting" | "processing" | "failed";

const POLL_INTERVAL_MS = 3000;

export default function GenerateImageButton({
  adSetId,
  initialJobId,
}: {
  adSetId: string;
  // Set when the page loads and finds a job already in flight (e.g. the
  // browser was closed mid-generation last time) -- resumes polling
  // immediately instead of leaving it stuck at "processing" forever with a
  // stale idle button.
  initialJobId?: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(initialJobId ? "processing" : "idle");
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollJob = useCallback(
    (jobId: string) => {
      intervalRef.current = setInterval(async () => {
        const response = await fetch(`/api/generation-jobs/${jobId}`);
        const data = await response.json();

        if (data.status === "completed") {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setPhase("idle");
          router.refresh();
        } else if (data.status === "failed") {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setError(data.error ?? "Generation failed.");
          setPhase("failed");
        }
      }, POLL_INTERVAL_MS);
    },
    [router]
  );

  useEffect(() => {
    if (initialJobId) {
      pollJob(initialJobId);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [initialJobId, pollJob]);

  async function handleGenerate() {
    setError(null);
    setPhase("starting");

    const result = await startImageGeneration(adSetId);
    if ("error" in result) {
      setError(result.error);
      setPhase("failed");
      return;
    }

    setPhase("processing");
    pollJob(result.jobId);
  }

  if (phase === "processing" || phase === "starting") {
    return (
      <p className="text-sm text-foreground/60">
        Generating image... this can take up to a minute.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {error ? <FormError message={error} /> : null}
      <button
        type="button"
        onClick={handleGenerate}
        className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
      >
        Generate Image (Higgsfield)
      </button>
    </div>
  );
}

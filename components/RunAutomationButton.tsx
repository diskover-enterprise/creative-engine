"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormError } from "@/components/FormStatus";
import { runAutomatedGeneration } from "@/app/products/actions";

type Phase = "idle" | "running" | "failed";

export default function RunAutomationButton({ productId }: { productId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  async function handleRun() {
    setError(null);
    setSummary(null);
    setPhase("running");

    const result = await runAutomatedGeneration(productId);
    if ("error" in result) {
      setError(result.error);
      setPhase("failed");
      return;
    }

    setSummary(
      `Created ${result.conceptsCreated} concept(s), started ${result.generationsStarted} image generation(s). They'll finish in the background -- check the Automated campaign in a bit.`
    );
    setPhase("idle");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-black/10 p-4 dark:border-white/10">
      <p className="text-sm font-medium">Automated Generation</p>
      {error ? <FormError message={error} /> : null}
      {summary ? (
        <p className="rounded-md border border-black/10 bg-black/[.02] px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[.03]">
          {summary}
        </p>
      ) : null}
      <button
        type="button"
        onClick={handleRun}
        disabled={phase === "running"}
        className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {phase === "running" ? "Running..." : "Run Automation"}
      </button>
    </div>
  );
}

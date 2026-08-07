"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormError } from "@/components/FormStatus";
import { suggestAdSetsForCampaign } from "@/app/campaigns/actions";
import { saveSuggestedAdSets } from "@/app/ad-sets/actions";
import type { AdSetSuggestion } from "@/lib/anthropic";
import type { AdSetFormat } from "@/types";

type Phase = "idle" | "loading" | "previewing" | "saving" | "failed";

export default function SuggestAdSetsButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [format, setFormat] = useState<AdSetFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AdSetSuggestion[]>([]);
  const [selected, setSelected] = useState<boolean[]>([]);
  const [summary, setSummary] = useState<string | null>(null);

  async function handleSuggest(chosenFormat: AdSetFormat) {
    setError(null);
    setSummary(null);
    setFormat(chosenFormat);
    setPhase("loading");

    const result = await suggestAdSetsForCampaign(campaignId, chosenFormat);
    if ("error" in result) {
      setError(result.error);
      setPhase("failed");
      return;
    }

    setSuggestions(result.suggestions);
    setSelected(result.suggestions.map(() => true));
    setPhase("previewing");
  }

  async function handleSave() {
    if (!format) return;
    setPhase("saving");
    setError(null);

    const chosen = suggestions.filter((_, index) => selected[index]);
    const result = await saveSuggestedAdSets(campaignId, format, chosen);
    if ("error" in result) {
      setError(result.error);
      setPhase("previewing");
      return;
    }

    setSummary(
      format === "video"
        ? `Created ${result.adSetsCreated} ad set(s). Open each one below to choose clip count and UGC/B-roll roles before generating.`
        : `Created ${result.adSetsCreated} ad set(s) and started producing ${result.generationsStarted} of them.`
    );
    setSuggestions([]);
    setFormat(null);
    setPhase("idle");
    router.refresh();
  }

  function handleCancel() {
    setSuggestions([]);
    setFormat(null);
    setError(null);
    setPhase("idle");
  }

  function toggle(index: number) {
    setSelected((current) => current.map((value, i) => (i === index ? !value : value)));
  }

  if (phase === "previewing" || phase === "saving") {
    const selectedCount = selected.filter(Boolean).length;

    return (
      <div className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
        <p className="text-sm font-medium">
          Review suggested {format === "video" ? "video" : "image"} ad sets
        </p>
        {error ? <FormError message={error} /> : null}

        {suggestions.map((suggestion, index) => (
          <label
            key={index}
            className="flex gap-3 rounded-md border border-black/10 p-3 text-sm dark:border-white/10"
          >
            <input
              type="checkbox"
              checked={selected[index] ?? false}
              onChange={() => toggle(index)}
              className="mt-1"
            />
            <div>
              <p className="font-medium">{suggestion.name}</p>
              <p className="mt-1 text-foreground/70">{suggestion.messaging_angle}</p>
              <p className="mt-1 text-xs text-foreground/50">
                {suggestion.target_emotion} — {suggestion.setting_scene}
              </p>
              <p className="text-xs text-foreground/50">
                CTA: {suggestion.call_to_action}
              </p>
              <p className="text-xs text-foreground/50">{suggestion.aspect_ratio}</p>
            </div>
          </label>
        ))}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={phase === "saving" || selectedCount === 0}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {phase === "saving" ? "Creating..." : `Create Selected (${selectedCount})`}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={phase === "saving"}
            className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium dark:border-white/15"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {error ? <FormError message={error} /> : null}
      {summary ? (
        <p className="rounded-md border border-black/10 bg-black/[.02] px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[.03]">
          {summary}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleSuggest("static_image")}
          disabled={phase === "loading"}
          className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium dark:border-white/15 disabled:opacity-50"
        >
          {phase === "loading" && format === "static_image"
            ? "Generating..."
            : "Generate Image Ad Concepts"}
        </button>
        <button
          type="button"
          onClick={() => handleSuggest("video")}
          disabled={phase === "loading"}
          className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium dark:border-white/15 disabled:opacity-50"
        >
          {phase === "loading" && format === "video" ? "Generating..." : "Generate Video Ad Concepts"}
        </button>
      </div>
    </div>
  );
}

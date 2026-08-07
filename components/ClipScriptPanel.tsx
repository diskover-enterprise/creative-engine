"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FormError } from "@/components/FormStatus";
import {
  startVideoAdSetGeneration,
  updateAdClipScript,
  generateAllClips,
  stitchAdClips,
} from "@/app/ad-sets/actions";
import type { AdClip, AdClipRole } from "@/types";

const POLL_INTERVAL_MS = 4000;
const DEFAULT_CLIP_COUNT = 5;
const MIN_CLIPS = 1;
const MAX_CLIPS = 10;

const STATUS_LABELS: Record<AdClip["status"], string> = {
  draft: "Draft",
  processing: "Generating...",
  completed: "Ready",
  failed: "Failed",
};

const ROLE_LABELS: Record<AdClipRole, string> = {
  ugc: "Model UGC",
  broll: "B-roll",
};

export default function ClipScriptPanel({
  adSetId,
  clips,
  referenceImageReady,
  referenceJobId,
  activeClipJobIds,
  hasFinalVideo,
}: {
  adSetId: string;
  clips: AdClip[];
  referenceImageReady: boolean;
  // Set when the reference image is still processing -- polled the same way
  // GenerateImageButton polls a static_image Ad Set's job, so this panel
  // doesn't just sit on "still generating" until the next cron sweep.
  referenceJobId?: string;
  activeClipJobIds: string[];
  hasFinalVideo: boolean;
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [generating, setGenerating] = useState(activeClipJobIds.length > 0);
  const [stitching, setStitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(clips.map((clip) => [clip.id, clip.script]))
  );
  const [clipCount, setClipCount] = useState(DEFAULT_CLIP_COUNT);
  const [roles, setRoles] = useState<AdClipRole[]>(Array(DEFAULT_CLIP_COUNT).fill("ugc"));
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function pollJobs(jobIds: string[]) {
    const pending = new Set(jobIds);
    pollRef.current = setInterval(async () => {
      await Promise.all(
        Array.from(pending).map(async (jobId) => {
          const response = await fetch(`/api/generation-jobs/${jobId}`);
          const data = await response.json();
          if (data.status === "completed" || data.status === "failed") {
            pending.delete(jobId);
          }
        })
      );

      if (pending.size === 0) {
        if (pollRef.current) clearInterval(pollRef.current);
        setGenerating(false);
        setStitching(false);
        router.refresh();
      }
    }, POLL_INTERVAL_MS);
  }

  useEffect(() => {
    if (activeClipJobIds.length > 0) {
      pollJobs(activeClipJobIds);
    } else if (referenceJobId) {
      pollJobs([referenceJobId]);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClipCountChange(count: number) {
    const clamped = Math.min(MAX_CLIPS, Math.max(MIN_CLIPS, count));
    setClipCount(clamped);
    setRoles((current) => {
      const next = current.slice(0, clamped);
      while (next.length < clamped) next.push("ugc");
      return next;
    });
  }

  function handleRoleChange(index: number, role: AdClipRole) {
    setRoles((current) => current.map((value, i) => (i === index ? role : value)));
  }

  async function handleStart() {
    setError(null);
    setStarting(true);
    const result = await startVideoAdSetGeneration(adSetId, roles);
    setStarting(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleScriptBlur(clipId: string) {
    const script = drafts[clipId];
    const clip = clips.find((c) => c.id === clipId);
    if (!clip || clip.script === script) return;
    await updateAdClipScript(clipId, script);
  }

  async function handleGenerateAll() {
    setError(null);
    setGenerating(true);
    const result = await generateAllClips(adSetId);
    if ("error" in result) {
      setError(result.error);
      setGenerating(false);
      return;
    }
    pollJobs(result.jobIds);
  }

  async function handleStitch() {
    setError(null);
    setStitching(true);
    const result = await stitchAdClips(adSetId);
    if ("error" in result) {
      setError(result.error);
      setStitching(false);
      return;
    }
    pollJobs([result.jobId]);
  }

  if (clips.length === 0) {
    return (
      <div className="mt-3 flex flex-col items-start gap-3">
        {error ? <FormError message={error} /> : null}

        <label className="flex items-center gap-2 text-sm">
          Number of clips
          <input
            type="number"
            min={MIN_CLIPS}
            max={MAX_CLIPS}
            value={clipCount}
            onChange={(e) => handleClipCountChange(Number(e.target.value) || MIN_CLIPS)}
            className="w-16 rounded-md border border-black/15 bg-transparent px-2 py-1 text-sm dark:border-white/15"
          />
        </label>

        <ul className="flex w-full flex-col gap-2">
          {roles.map((role, index) => (
            <li key={index} className="flex items-center gap-2 text-sm">
              <span className="w-14 text-foreground/50">Clip {index + 1}</span>
              <select
                value={role}
                onChange={(e) => handleRoleChange(index, e.target.value as AdClipRole)}
                className="rounded-md border border-black/15 bg-transparent px-2 py-1 text-sm dark:border-white/15"
              >
                <option value="ugc">{ROLE_LABELS.ugc}</option>
                <option value="broll">{ROLE_LABELS.broll}</option>
              </select>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={handleStart}
          disabled={starting}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {starting ? "Starting..." : "Generate Script"}
        </button>
      </div>
    );
  }

  const allCompleted = clips.every((clip) => clip.status === "completed");
  const hasEditableClips = clips.some((clip) => clip.status === "draft" || clip.status === "failed");
  const needsReferenceImage = clips.some((clip) => clip.role === "ugc");

  return (
    <div className="mt-3 flex flex-col gap-3">
      {error ? <FormError message={error} /> : null}
      {needsReferenceImage && !referenceImageReady ? (
        <p className="text-sm text-foreground/60">
          Model reference image is still generating -- check the Ads section below.
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {clips.map((clip) => (
          <li
            key={clip.id}
            className="rounded-md border border-black/10 p-3 dark:border-white/10"
          >
            <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-foreground/40">
              <span>
                Clip {clip.clip_number} · {ROLE_LABELS[clip.role]}
              </span>
              <span>{STATUS_LABELS[clip.status]}</span>
            </div>
            <textarea
              rows={2}
              value={drafts[clip.id] ?? clip.script}
              onChange={(e) =>
                setDrafts((current) => ({ ...current, [clip.id]: e.target.value }))
              }
              onBlur={() => handleScriptBlur(clip.id)}
              disabled={clip.status === "processing" || clip.status === "completed"}
              className="mt-2 w-full rounded-md border border-black/15 bg-transparent p-2 text-sm disabled:opacity-60 dark:border-white/15"
            />
            {clip.status === "completed" && clip.asset_url ? (
              <video src={clip.asset_url} controls className="mt-2 max-h-48 rounded-md" />
            ) : null}
            {clip.role === "broll" && clip.preview_image_url && clip.status !== "completed" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={clip.preview_image_url}
                alt=""
                className="mt-2 max-h-48 rounded-md object-cover"
              />
            ) : null}
            {clip.status === "failed" && clip.error ? (
              <p className="mt-1 text-xs text-red-500">{clip.error}</p>
            ) : null}
          </li>
        ))}
      </ul>

      {hasEditableClips ? (
        <button
          type="button"
          onClick={handleGenerateAll}
          disabled={generating || (needsReferenceImage && !referenceImageReady)}
          className="self-start rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {generating ? "Generating clips..." : "Approve & Generate Clips"}
        </button>
      ) : null}

      {allCompleted && !hasFinalVideo ? (
        <button
          type="button"
          onClick={handleStitch}
          disabled={stitching}
          className="self-start rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {stitching ? "Stitching..." : "Stitch into Final Video"}
        </button>
      ) : null}

      {hasFinalVideo ? (
        <p className="text-sm text-foreground/60">
          Final video ready -- see the Ads section below.
        </p>
      ) : null}
    </div>
  );
}

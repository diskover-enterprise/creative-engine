// Shotstack stitches the 5 generated clips of a video Ad Set into one final
// video. Same submit-then-poll shape as fal.ai/Higgsfield: submitStitch()
// queues the render and returns immediately, a Route Handler polls
// getStitchStatus() afterwards (see lib/generationPoll.ts).
const ENV = process.env.SHOTSTACK_ENV === "v1" ? "v1" : "stage";
const BASE_URL = `https://api.shotstack.io/edit/${ENV}`;

// Every Higgsfield clip is generated at this fixed duration (see
// DEFAULT_DURATION_SECONDS in lib/higgsfield.ts), so clips can be placed back
// to back on the timeline without probing each file's actual length.
const CLIP_DURATION_SECONDS = 5;

function authHeaders() {
  return {
    "x-api-key": process.env.SHOTSTACK_API_KEY ?? "",
    "Content-Type": "application/json",
  };
}

interface SubmitResponse {
  response: { id: string };
}

// Background music volume while a clip's voiceover is playing vs. not --
// same duck/un-duck split as the manual ffmpeg mix this replaces (see
// app/ad-sets/actions.ts's uploadClipVoiceover for how voiceoverUrl gets set).
const MUSIC_VOLUME_DUCKED = 0.25;
const MUSIC_VOLUME_FULL = 0.7;

export interface StitchClip {
  url: string;
  voiceoverUrl: string | null;
}

export async function submitStitch(clips: StitchClip[], musicUrl: string | null) {
  const videoClips = clips.map(({ url }, index) => ({
    asset: { type: "video", src: url },
    start: index * CLIP_DURATION_SECONDS,
    length: CLIP_DURATION_SECONDS,
  }));

  // A voiceover is shorter than its clip's 5s slot -- placed at the same
  // start/length as its video clip, it just finishes early and leaves the
  // rest of that slot silent on this track (same effect as the manual
  // mix's per-clip `adelay`).
  const voiceoverClips = clips.flatMap(({ voiceoverUrl }, index) =>
    voiceoverUrl
      ? [
          {
            asset: { type: "audio", src: voiceoverUrl },
            start: index * CLIP_DURATION_SECONDS,
            length: CLIP_DURATION_SECONDS,
          },
        ]
      : []
  );

  // Music is sliced into one clip per clip-slot, each `trim`-ing further
  // into the same source file so it keeps advancing continuously instead of
  // restarting per segment -- the sliced-clip equivalent of the manual mix's
  // time-varying ffmpeg volume expression, ducking under any slot that has
  // a voiceover.
  const musicClips = musicUrl
    ? clips.map(({ voiceoverUrl }, index) => ({
        asset: {
          type: "audio",
          src: musicUrl,
          trim: index * CLIP_DURATION_SECONDS,
          volume: voiceoverUrl ? MUSIC_VOLUME_DUCKED : MUSIC_VOLUME_FULL,
        },
        start: index * CLIP_DURATION_SECONDS,
        length: CLIP_DURATION_SECONDS,
      }))
    : [];

  const tracks = [
    { clips: videoClips },
    ...(voiceoverClips.length > 0 ? [{ clips: voiceoverClips }] : []),
    ...(musicClips.length > 0 ? [{ clips: musicClips }] : []),
  ];

  const response = await fetch(`${BASE_URL}/render`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      timeline: { tracks },
      output: { format: "mp4", resolution: "hd" },
    }),
  });

  if (!response.ok) {
    throw new Error(`Shotstack render submit failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as SubmitResponse;
  return data.response.id;
}

type ShotstackStatus = "queued" | "fetching" | "rendering" | "saving" | "done" | "failed";

interface StatusResponse {
  response: { status: ShotstackStatus; url?: string; error?: string };
}

export async function getStitchStatus(renderId: string) {
  const response = await fetch(`${BASE_URL}/render/${renderId}`, {
    headers: authHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Shotstack status check failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as StatusResponse;
  return data.response;
}

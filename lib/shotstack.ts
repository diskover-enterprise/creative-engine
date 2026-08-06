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

export async function submitStitch(clipUrls: string[]) {
  const clips = clipUrls.map((src, index) => ({
    asset: { type: "video", src },
    start: index * CLIP_DURATION_SECONDS,
    length: CLIP_DURATION_SECONDS,
  }));

  const response = await fetch(`${BASE_URL}/render`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      timeline: { tracks: [{ clips }] },
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

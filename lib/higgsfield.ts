// Higgsfield has no official JS/TS SDK yet ("coming soon" per their docs), so
// this talks to their REST API directly. Shape mirrors fal.ai's queue
// pattern: submit returns a request_id immediately, then a status endpoint is
// polled -- except Higgsfield's completed status response already includes
// the output, no separate "result" call needed.
const BASE_URL = "https://platform.higgsfield.ai";
const MODEL = "higgsfield-ai/dop/standard";
const DEFAULT_DURATION_SECONDS = 5;

function authHeaders() {
  return {
    Authorization: `Key ${process.env.HIGGSFIELD_API_KEY}`,
    "Content-Type": "application/json",
  };
}

interface SubmitResponse {
  request_id: string;
}

export async function submitVideoGeneration(imageUrl: string, prompt: string) {
  const response = await fetch(`${BASE_URL}/${MODEL}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      image_url: imageUrl,
      prompt,
      duration: DEFAULT_DURATION_SECONDS,
    }),
  });

  if (!response.ok) {
    throw new Error(`Higgsfield submit failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as SubmitResponse;
  return data.request_id;
}

type HiggsfieldStatus = "queued" | "in_progress" | "nsfw" | "failed" | "completed";

interface StatusResponse {
  status: HiggsfieldStatus;
  video?: { url: string };
}

export async function getVideoGenerationStatus(requestId: string) {
  const response = await fetch(`${BASE_URL}/requests/${requestId}/status`, {
    headers: authHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Higgsfield status check failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as StatusResponse;
}

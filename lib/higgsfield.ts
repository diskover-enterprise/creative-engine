// Higgsfield has no official JS/TS SDK yet ("coming soon" per their docs), so
// this talks to their REST API directly. Shape mirrors fal.ai's queue
// pattern: submit returns a request_id immediately, then a status endpoint is
// polled -- except Higgsfield's completed status response already includes
// the output, no separate "result" call needed.
const BASE_URL = "https://platform.higgsfield.ai";
const VIDEO_MODEL = "higgsfield-ai/dop/standard";
const DEFAULT_DURATION_SECONDS = 5;

// Confirmed live against /models: plain text-to-image, and a variant that
// takes a reference image (used to keep a real product/model consistent
// across generations instead of Higgsfield inventing its own each time).
const IMAGE_MODEL_STANDARD = "higgsfield-ai/soul/standard";
const IMAGE_MODEL_REFERENCE = "higgsfield-ai/soul/reference";

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
  const response = await fetch(`${BASE_URL}/${VIDEO_MODEL}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      image_url: imageUrl,
      prompt,
      duration: DEFAULT_DURATION_SECONDS,
    }),
  });

  if (!response.ok) {
    throw new Error(`Higgsfield video submit failed: ${response.status} ${await response.text()}`);
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

// Higgsfield's image models only accept this fixed set -- confirmed live via
// a 422 rejecting "4:5" (which fal.ai accepts fine, and which Claude's ad set
// suggestions can still pick since fal.ai generates the video model-reference
// image). Anything outside this set gets mapped to the closest match rather
// than failing the whole generation.
const SUPPORTED_ASPECT_RATIOS = new Set(["9:16", "16:9", "4:3", "3:4", "1:1", "2:3", "3:2"]);

function toHiggsfieldAspectRatio(aspectRatio: string): string {
  if (SUPPORTED_ASPECT_RATIOS.has(aspectRatio)) return aspectRatio;
  if (aspectRatio === "4:5") return "3:4"; // closest portrait ratio Higgsfield offers
  return "1:1";
}

// referenceImageUrl, when given (e.g. a real product photo), routes through
// the reference-capable model so the output stays consistent with it instead
// of Higgsfield inventing an unrelated product/scene.
export async function submitHiggsfieldImageGeneration(
  prompt: string,
  aspectRatio: string,
  referenceImageUrl?: string
) {
  const model = referenceImageUrl ? IMAGE_MODEL_REFERENCE : IMAGE_MODEL_STANDARD;
  const body: Record<string, string> = {
    prompt,
    aspect_ratio: toHiggsfieldAspectRatio(aspectRatio),
  };
  if (referenceImageUrl) {
    body.reference_image_url = referenceImageUrl;
  }

  const response = await fetch(`${BASE_URL}/${model}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Higgsfield image submit failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as SubmitResponse;
  return data.request_id;
}

interface ImageStatusResponse {
  status: HiggsfieldStatus;
  images?: { url: string }[];
}

export async function getHiggsfieldImageGenerationStatus(requestId: string) {
  const response = await fetch(`${BASE_URL}/requests/${requestId}/status`, {
    headers: authHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Higgsfield image status check failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as ImageStatusResponse;
}

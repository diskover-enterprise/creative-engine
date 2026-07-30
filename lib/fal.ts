import { fal } from "@fal-ai/client";

fal.config({ credentials: process.env.FAL_KEY });

const MODEL = "fal-ai/flux/dev";

// Custom width/height per aspect ratio rather than fal's built-in presets,
// so this stays in sync with the aspect ratios Concepts actually offer.
const IMAGE_SIZE_BY_ASPECT_RATIO: Record<string, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "4:5": { width: 864, height: 1080 },
  "9:16": { width: 720, height: 1280 },
  "16:9": { width: 1280, height: 720 },
};

interface FluxDevOutput {
  images: { url: string; width: number; height: number; content_type: string }[];
}

// Enqueues the job and returns immediately -- does NOT wait for the image to
// be generated. A Route Handler polls status()/result() afterwards. This
// keeps every individual request short, which matters on serverless
// deployments where a single request blocking until generation finishes
// (which can take well over a minute) would hit the platform's time limit.
export async function submitImageGeneration(prompt: string, aspectRatio: string) {
  const imageSize = IMAGE_SIZE_BY_ASPECT_RATIO[aspectRatio] ?? IMAGE_SIZE_BY_ASPECT_RATIO["1:1"];

  const { request_id } = await fal.queue.submit(MODEL, {
    input: {
      prompt,
      image_size: imageSize,
      num_images: 1,
    },
  });

  return request_id;
}

export async function getImageGenerationStatus(requestId: string) {
  const status = await fal.queue.status(MODEL, { requestId, logs: false });
  return status.status;
}

export async function getImageGenerationResult(requestId: string) {
  const result = await fal.queue.result(MODEL, { requestId });
  const output = result.data as FluxDevOutput;
  const image = output.images?.[0];
  if (!image) {
    throw new Error("fal.ai returned no image.");
  }

  return { url: image.url, contentType: image.content_type };
}

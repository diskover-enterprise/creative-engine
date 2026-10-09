import type { Campaign, AdSet } from "@/types";

// Appended to every generated prompt, deterministically -- not left to Claude
// to remember every time. Modeled on a hand-written prompt the user got much
// better Higgsfield results with: dense technical/realism language plus an
// explicit negative list, rather than a vague "make it look nice" request.
const REALISM_SUFFIX =
  "Photorealistic commercial product footage: physically accurate materials, lighting, reflections, shadows, and depth of field. Avoid label or text morphing, fake lettering, warped or malformed hands, floating or physically impossible objects, unrealistic liquid or material behavior, artificial glow, or lens flares.";

const PRODUCT_FIDELITY_LINE =
  "Preserve the supplied reference product's real packaging, label, logo, colors, and proportions exactly as shown -- do not invent or alter them.";

// Deterministic prompt assembly for an Ad Set. No AI model is called here --
// this just formats the structured brief (plus inherited Campaign context)
// into a single prompt string a future image/video generation step could
// send to fal.ai, Higgsfield, etc.
export function buildAdSetPrompt(
  campaign: Pick<
    Campaign,
    | "name"
    | "description"
    | "brand_voice"
    | "visual_style"
    | "audience"
    | "benefits"
    | "offer"
    | "product_image_url"
  >,
  adSet: Pick<
    AdSet,
    | "messaging_angle"
    | "target_emotion"
    | "visual_style_override"
    | "tone_override"
    | "setting_scene"
    | "key_message"
    | "call_to_action"
    | "format"
    | "aspect_ratio"
  >
) {
  const lines: string[] = [];

  lines.push(`Product/campaign: ${campaign.name}.`);
  if (campaign.description) lines.push(`Description: ${campaign.description}.`);
  if (adSet.key_message) lines.push(`Key message to convey: ${adSet.key_message}.`);
  else if (campaign.benefits) lines.push(`Key message to convey: ${campaign.benefits}.`);
  if (campaign.offer) lines.push(`Offer: ${campaign.offer}.`);
  if (adSet.messaging_angle) lines.push(`Creative angle: ${adSet.messaging_angle}.`);
  if (adSet.target_emotion) lines.push(`Target emotion: ${adSet.target_emotion}.`);

  const tone = adSet.tone_override || campaign.brand_voice;
  if (tone) lines.push(`Tone of voice: ${tone}.`);

  const visualStyle = adSet.visual_style_override || campaign.visual_style;
  if (visualStyle) lines.push(`Visual style: ${visualStyle}.`);

  if (adSet.setting_scene) lines.push(`Setting/scene: ${adSet.setting_scene}.`);
  if (campaign.audience) lines.push(`Target audience: ${campaign.audience}.`);
  if (adSet.call_to_action) lines.push(`Call to action text: "${adSet.call_to_action}".`);

  const formatLabel =
    adSet.format === "video" ? "short vertical ad video" : "static ad image";
  lines.push(`Format: ${formatLabel}, aspect ratio ${adSet.aspect_ratio}.`);

  // Real footage of real people gets mixed in with AI-generated video, so
  // AI-generated video specifically should read as natural and candid, not
  // like an obviously synthetic, overly polished ad.
  if (adSet.format === "video") {
    lines.push(
      "Natural, candid, handheld feel -- avoid an overly polished, glossy, or artificial studio look."
    );
  }

  lines.push(REALISM_SUFFIX);
  if (campaign.product_image_url) lines.push(PRODUCT_FIDELITY_LINE);

  return lines.join(" ");
}

// Same realism/negative-prompt/product-fidelity suffix, for a video Ad Set's
// per-clip script (written by Claude in generateClipScript, then sent to
// Higgsfield as-is for that clip's still image and video generation). Kept
// separate from the clip's stored `script` column so the user still sees and
// edits clean creative text -- this only wraps it at the point of actually
// calling Higgsfield (see generateAllClips in app/ad-sets/actions.ts).
export function buildClipPrompt(script: string, hasProductImage: boolean) {
  const lines = [script, REALISM_SUFFIX];
  if (hasProductImage) lines.push(PRODUCT_FIDELITY_LINE);
  return lines.join(" ");
}

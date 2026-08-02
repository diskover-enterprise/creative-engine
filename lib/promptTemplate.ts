import type { Campaign, AdSet } from "@/types";

// Deterministic prompt assembly for an Ad Set. No AI model is called here --
// this just formats the structured brief (plus inherited Campaign context)
// into a single prompt string a future image/video generation step could
// send to fal.ai, Higgsfield, etc.
export function buildAdSetPrompt(
  campaign: Pick<
    Campaign,
    "name" | "description" | "brand_voice" | "visual_style" | "audience" | "benefits" | "offer"
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

  return lines.join(" ");
}

import type { Brand, Product, Concept } from "@/types";

// Deterministic prompt assembly for a Concept. No AI model is called here --
// this just formats the structured brief (plus inherited Brand/Product
// context) into a single prompt string a future image/video generation step
// could send to fal.ai, Higgsfield, etc.
export function buildConceptPrompt(
  brand: Pick<Brand, "name" | "brand_voice" | "visual_style">,
  product: Pick<Product, "name" | "description" | "audience" | "benefits" | "offer">,
  concept: Pick<
    Concept,
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

  lines.push(`Product: ${product.name} by ${brand.name}.`);
  if (product.description) lines.push(`Product description: ${product.description}.`);
  if (concept.key_message) lines.push(`Key message to convey: ${concept.key_message}.`);
  else if (product.benefits) lines.push(`Key message to convey: ${product.benefits}.`);
  if (product.offer) lines.push(`Offer: ${product.offer}.`);
  if (concept.messaging_angle) lines.push(`Creative angle: ${concept.messaging_angle}.`);
  if (concept.target_emotion) lines.push(`Target emotion: ${concept.target_emotion}.`);

  const tone = concept.tone_override || brand.brand_voice;
  if (tone) lines.push(`Tone of voice: ${tone}.`);

  const visualStyle = concept.visual_style_override || brand.visual_style;
  if (visualStyle) lines.push(`Visual style: ${visualStyle}.`);

  if (concept.setting_scene) lines.push(`Setting/scene: ${concept.setting_scene}.`);
  if (product.audience) lines.push(`Target audience: ${product.audience}.`);
  if (concept.call_to_action) lines.push(`Call to action text: "${concept.call_to_action}".`);

  const formatLabel =
    concept.format === "video" ? "short vertical ad video" : "static ad image";
  lines.push(`Format: ${formatLabel}, aspect ratio ${concept.aspect_ratio}.`);

  return lines.join(" ");
}

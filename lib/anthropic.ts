import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const client = new Anthropic();

export const ConceptSuggestionSchema = z.object({
  name: z.string().describe("Short label for this concept, e.g. 'Morning Rush Angle'"),
  messaging_angle: z
    .string()
    .describe("The core creative idea or hook this concept is built around"),
  target_emotion: z.string().describe("The primary emotion this concept should evoke"),
  setting_scene: z.string().describe("Where/how the product is shown"),
  key_message: z.string().describe("The single most important message to convey"),
  call_to_action: z.string().describe("Suggested call-to-action text"),
  format: z.enum(["static_image", "video"]),
  aspect_ratio: z.enum(["1:1", "4:5", "9:16", "16:9"]),
});

const ConceptSuggestionsResponseSchema = z.object({
  suggestions: z.array(ConceptSuggestionSchema).length(3),
});

export type ConceptSuggestion = z.infer<typeof ConceptSuggestionSchema>;

interface SuggestionContext {
  brand: { name: string; brand_voice: string | null; visual_style: string | null };
  product: {
    name: string;
    description: string | null;
    audience: string | null;
    benefits: string | null;
    offer: string | null;
  };
  campaign: { name: string; objective: string | null };
}

// Uses the Anthropic API purely for creative ideation (proposing distinct
// campaign angles) -- the final generation prompt sent to fal.ai/Higgsfield
// is still assembled deterministically by lib/promptTemplate.ts, not by this
// model.
export async function suggestConcepts(context: SuggestionContext) {
  const { brand, product, campaign } = context;

  const prompt = `
Brand: ${brand.name}
Brand voice: ${brand.brand_voice ?? "not specified"}
Visual style: ${brand.visual_style ?? "not specified"}

Product: ${product.name}
Description: ${product.description ?? "not specified"}
Target audience: ${product.audience ?? "not specified"}
Benefits: ${product.benefits ?? "not specified"}
Offer: ${product.offer ?? "not specified"}

Campaign: ${campaign.name}
Objective: ${campaign.objective ?? "not specified"}
`.trim();

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 2048,
    system:
      "You are a creative strategist for digital advertising. Given brand and product context, propose exactly 3 distinct, actionable creative concept directions for an ad campaign. Each concept must take a genuinely different angle from the others (different emotion, different scenario, or different audience appeal) -- do not produce near-duplicates. Keep each field concise and concrete, ready to hand to a designer. Real footage of real people will often be mixed with AI-generated visuals, so favor authentic, lived-in, UGC-style settings and scenes over glossy, studio-perfect ones -- AI-generated output should not look conspicuously polished or synthetic.",
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(ConceptSuggestionsResponseSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Claude did not return a parseable set of suggestions.");
  }

  return response.parsed_output.suggestions;
}

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const client = new Anthropic();

export const AdSetSuggestionSchema = z.object({
  name: z.string().describe("Short label for this ad set, e.g. 'Morning Rush Angle'"),
  messaging_angle: z
    .string()
    .describe("The core creative idea or hook this ad set is built around"),
  target_emotion: z.string().describe("The primary emotion this ad set should evoke"),
  setting_scene: z.string().describe("Where/how the product is shown"),
  key_message: z.string().describe("The single most important message to convey"),
  call_to_action: z.string().describe("Suggested call-to-action text"),
  format: z.enum(["static_image", "video"]),
  aspect_ratio: z.enum(["1:1", "4:5", "9:16", "16:9"]),
});

const AdSetSuggestionsResponseSchema = z.object({
  suggestions: z.array(AdSetSuggestionSchema).length(3),
});

export type AdSetSuggestion = z.infer<typeof AdSetSuggestionSchema>;

interface SuggestionContext {
  campaign: {
    name: string;
    description: string | null;
    brand_voice: string | null;
    visual_style: string | null;
    audience: string | null;
    benefits: string | null;
    offer: string | null;
    objective: string | null;
  };
}

// Uses the Anthropic API purely for creative ideation (proposing distinct
// campaign angles) -- the final generation prompt sent to fal.ai/Higgsfield
// is still assembled deterministically by lib/promptTemplate.ts, not by this
// model.
export async function suggestAdSets(context: SuggestionContext) {
  const { campaign } = context;

  const prompt = `
Campaign: ${campaign.name}
Description: ${campaign.description ?? "not specified"}
Brand voice: ${campaign.brand_voice ?? "not specified"}
Visual style: ${campaign.visual_style ?? "not specified"}
Target audience: ${campaign.audience ?? "not specified"}
Benefits: ${campaign.benefits ?? "not specified"}
Offer: ${campaign.offer ?? "not specified"}
Objective: ${campaign.objective ?? "not specified"}
`.trim();

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 2048,
    system:
      "You are a creative strategist for digital advertising. Given brand and product context, propose exactly 3 distinct, actionable ad set directions for an ad campaign. Each ad set must take a genuinely different angle from the others (different emotion, different scenario, or different audience appeal) -- do not produce near-duplicates. Keep each field concise and concrete, ready to hand to a designer. Real footage of real people will often be mixed with AI-generated visuals, so favor authentic, lived-in, UGC-style settings and scenes over glossy, studio-perfect ones -- AI-generated output should not look conspicuously polished or synthetic.",
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(AdSetSuggestionsResponseSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Claude did not return a parseable set of suggestions.");
  }

  return response.parsed_output.suggestions;
}

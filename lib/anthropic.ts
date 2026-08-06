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

const SUGGESTION_COUNT = 10;

const AdSetSuggestionsResponseSchema = z.object({
  suggestions: z.array(AdSetSuggestionSchema).length(SUGGESTION_COUNT),
});

export type AdSetSuggestion = z.infer<typeof AdSetSuggestionSchema>;

interface CampaignContext {
  name: string;
  description: string | null;
  brand_voice: string | null;
  visual_style: string | null;
  audience: string | null;
  benefits: string | null;
  offer: string | null;
  objective: string | null;
}

interface SuggestionContext {
  campaign: CampaignContext;
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
    max_tokens: 4096,
    system:
      `You are a creative strategist for digital advertising. Given brand and product context, propose exactly ${SUGGESTION_COUNT} distinct, actionable ad set directions for an ad campaign. Each ad set must take a genuinely different angle from the others (different emotion, different scenario, or different audience appeal) -- do not produce near-duplicates. Keep each field concise and concrete, ready to hand to a designer. Real footage of real people will often be mixed with AI-generated visuals, so favor authentic, lived-in, UGC-style settings and scenes over glossy, studio-perfect ones -- AI-generated output should not look conspicuously polished or synthetic.`,
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(AdSetSuggestionsResponseSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Claude did not return a parseable set of suggestions.");
  }

  return response.parsed_output.suggestions;
}

interface AdSetContext {
  messaging_angle: string | null;
  target_emotion: string | null;
  tone_override: string | null;
  visual_style_override: string | null;
  setting_scene: string | null;
  key_message: string | null;
  call_to_action: string | null;
}

function describeCampaignAndAdSet(campaign: CampaignContext, adSet: AdSetContext) {
  return `
Campaign: ${campaign.name}
Brand voice: ${adSet.tone_override ?? campaign.brand_voice ?? "not specified"}
Visual style: ${adSet.visual_style_override ?? campaign.visual_style ?? "not specified"}
Target audience: ${campaign.audience ?? "not specified"}
Offer: ${campaign.offer ?? "not specified"}

Ad angle: ${adSet.messaging_angle ?? "not specified"}
Target emotion: ${adSet.target_emotion ?? "not specified"}
Setting/scene: ${adSet.setting_scene ?? "not specified"}
Key message: ${adSet.key_message ?? campaign.benefits ?? "not specified"}
Call to action: ${adSet.call_to_action ?? "not specified"}
`.trim();
}

export const AdCopySchema = z.object({
  headline: z.string().describe("Short, punchy ad headline, under ~8 words"),
  caption: z.string().describe("Supporting caption/body copy for the ad, 1-2 sentences"),
});

export type AdCopy = z.infer<typeof AdCopySchema>;

// Writes the headline + caption that turn a bare generated image into a
// finished ad. Called once a fal.ai image completes for a static_image Ad
// Set (see lib/generationPoll.ts) -- never for a video Ad Set's reference
// image, which isn't meant to be shown as-is.
export async function generateAdCopy(context: {
  campaign: CampaignContext;
  adSet: AdSetContext;
}): Promise<AdCopy> {
  const prompt = describeCampaignAndAdSet(context.campaign, context.adSet);

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 1024,
    system:
      "You are a direct-response copywriter. Given an ad's brand/campaign context and creative angle, write one headline and one caption for the ad. The headline is the first thing a scrolling viewer reads -- make it concrete and specific to the angle, not generic brand-speak. The caption is 1-2 sentences of supporting copy that can sit under the image. Match the brand's tone of voice exactly.",
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(AdCopySchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Claude did not return parseable ad copy.");
  }

  return response.parsed_output;
}

export const ClipScriptSchema = z.object({
  clips: z
    .array(
      z.object({
        description: z
          .string()
          .describe(
            "What happens in this ~5 second clip: the action, framing, and any on-camera line -- written as a direct instruction to a UGC creator/video model, not as prose narration"
          ),
      })
    )
    .length(5),
});

export type ClipScript = z.infer<typeof ClipScriptSchema>;

// Writes a 5-clip UGC video script (~5 seconds per clip, ~25 seconds total)
// for a video Ad Set. Generated up front from a reference image + this
// script so the whole thing can be reviewed/edited before any per-clip
// Higgsfield generation is triggered (see lib/generationPoll.ts and
// app/ad-sets/actions.ts).
export async function generateClipScript(context: {
  campaign: CampaignContext;
  adSet: AdSetContext;
}): Promise<ClipScript> {
  const prompt = describeCampaignAndAdSet(context.campaign, context.adSet);

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 2048,
    system:
      "You are directing a UGC-style short vertical ad video, shot as 5 sequential handheld clips of about 5 seconds each (~25 seconds total) from one consistent reference image/scene. Write exactly 5 clip descriptions that tell a coherent, natural mini-story building toward the call to action -- each one a concrete instruction (setting, action, camera framing, any spoken line) a video generation model can follow. Favor authentic, lived-in, slightly imperfect handheld footage over polished studio production -- this will be mixed with real captured footage, so it must not read as obviously AI-generated or overly smooth.",
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(ClipScriptSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Claude did not return a parseable clip script.");
  }

  return response.parsed_output;
}

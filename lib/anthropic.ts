import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { AdSetFormat, AdClipRole } from "@/types";

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
  format: AdSetFormat;
  hasProductImage: boolean;
}

// Uses the Anthropic API purely for creative ideation (proposing distinct
// campaign angles) -- the final generation prompt sent to fal.ai/Higgsfield
// is still assembled deterministically by lib/promptTemplate.ts, not by this
// model. Only Name + optional Description usually exist for a Campaign now,
// so Claude is expected to infer audience/tone/angles itself when the other
// fields are blank rather than relying on them.
export async function suggestAdSets(context: SuggestionContext) {
  const { campaign, format, hasProductImage } = context;

  const prompt = `
Product/Campaign: ${campaign.name}
Description: ${campaign.description ?? "not specified -- infer a plausible, common use case for a product like this"}
Brand voice: ${campaign.brand_voice ?? "not specified -- pick a tone that fits this kind of product"}
Visual style: ${campaign.visual_style ?? "not specified"}
Target audience: ${campaign.audience ?? "not specified -- infer a plausible target audience"}
Benefits: ${campaign.benefits ?? "not specified"}
Offer: ${campaign.offer ?? "not specified"}
Objective: ${campaign.objective ?? "not specified"}
A real product photo will${hasProductImage ? "" : " NOT"} be used as a visual reference for generation.
`.trim();

  const formatInstruction =
    format === "video"
      ? "Every one of these is for a VIDEO ad, so setting_scene should describe a scene with movement/action potential, not a static shot."
      : "Every one of these is for a STATIC IMAGE ad, so setting_scene should describe one single freeze-frame moment.";

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 4096,
    system:
      `You are a creative strategist for digital advertising. Given a product/campaign name and whatever other context is provided, propose exactly ${SUGGESTION_COUNT} distinct, actionable ad set directions. ${formatInstruction} Each ad set must take a genuinely different angle from the others (different emotion, different scenario, or different audience appeal) -- do not produce near-duplicates. Write each field as a detailed, concrete master prompt fragment specific enough to hand directly to an image/video generation model -- not a vague summary. Real footage of real people will often be mixed with AI-generated visuals, so favor authentic, lived-in, UGC-style settings and scenes over glossy, studio-perfect ones -- AI-generated output should not look conspicuously polished or synthetic.`,
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
// finished ad. Called once an image completes for a static_image Ad Set (see
// lib/generationPoll.ts) -- never for a video Ad Set's reference image,
// which isn't meant to be shown as-is.
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

// Writes a full-length video script (~5 seconds per clip) for a video Ad
// Set, respecting a per-clip UGC/B-roll role assignment: a 'ugc' clip is
// performed by the consistent on-camera model/creator, a 'broll' clip is a
// product/scene shot with nobody on camera (a candidate for voiceover later,
// since there's no on-camera dialogue). Generated up front from just the
// role list so the whole thing can be reviewed/edited before any per-clip
// Higgsfield generation is triggered (see lib/generationPoll.ts and
// app/ad-sets/actions.ts).
export async function generateClipScript(context: {
  campaign: CampaignContext;
  adSet: AdSetContext;
  roles: AdClipRole[];
}): Promise<{ clips: { description: string }[] }> {
  const { roles } = context;
  const prompt = `${describeCampaignAndAdSet(context.campaign, context.adSet)}

Shot list (in order, ${roles.length} clips total, ~5 seconds each): ${roles
    .map((role, index) => `Clip ${index + 1} = ${role === "ugc" ? "UGC (on-camera creator)" : "B-ROLL (no person)"}`)
    .join(", ")}`;

  const ClipScriptSchema = z.object({
    clips: z
      .array(
        z.object({
          description: z
            .string()
            .describe(
              "What happens in this ~5 second clip: the action, framing, and any on-camera line -- written as a direct instruction to a UGC creator/video model, not as prose narration. A UGC clip shows the creator on camera (with dialogue if natural); a B-ROLL clip must not describe any person speaking or appearing on camera -- product/scene/hands only."
            ),
        })
      )
      .length(roles.length),
  });

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 2048,
    system:
      "You are directing a short vertical ad video, shot as a sequence of ~5 second clips from one consistent product/scene. You'll be given an ordered shot list marking each clip as UGC (the on-camera creator performs) or B-ROLL (no person -- product, hands, or scene only, since this may get a voiceover added later instead of on-camera dialogue). Write one clip description per shot-list entry, in order, telling a coherent, natural mini-story building toward the call to action -- each one a concrete instruction (setting, action, camera framing, any spoken line for UGC clips) a video generation model can follow. Favor authentic, lived-in, slightly imperfect handheld footage over polished studio production -- this will be mixed with real captured footage, so it must not read as obviously AI-generated or overly smooth.",
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(ClipScriptSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Claude did not return a parseable clip script.");
  }

  return response.parsed_output;
}

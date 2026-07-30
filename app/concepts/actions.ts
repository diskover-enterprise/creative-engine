"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getStoragePathFromPublicUrl } from "@/lib/supabase/storage";
import { buildConceptPrompt } from "@/lib/promptTemplate";
import type { ConceptFormat } from "@/types";
import type { ConceptSuggestion } from "@/lib/anthropic";

export type ActionState = { error: string } | null;

const FORMATS: ConceptFormat[] = ["static_image", "video"];

function textOrNull(formData: FormData, key: string) {
  const value = formData.get(key)?.toString().trim();
  return value ? value : null;
}

function formatOrDefault(formData: FormData): ConceptFormat {
  const value = formData.get("format")?.toString();
  return (FORMATS as string[]).includes(value ?? "") ? (value as ConceptFormat) : "static_image";
}

function fieldsFromForm(formData: FormData) {
  return {
    name: textOrNull(formData, "name"),
    messaging_angle: textOrNull(formData, "messaging_angle"),
    target_emotion: textOrNull(formData, "target_emotion"),
    visual_style_override: textOrNull(formData, "visual_style_override"),
    tone_override: textOrNull(formData, "tone_override"),
    setting_scene: textOrNull(formData, "setting_scene"),
    key_message: textOrNull(formData, "key_message"),
    call_to_action: textOrNull(formData, "call_to_action"),
    format: formatOrDefault(formData),
    aspect_ratio: textOrNull(formData, "aspect_ratio") ?? "1:1",
  };
}

// Walks Concept -> Campaign -> Product -> Brand to gather the context the
// deterministic prompt template needs.
async function getPromptContext(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  campaignId: string
) {
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("product_id")
    .eq("id", campaignId)
    .single();

  if (!campaign) return null;

  const { data: product } = await supabase
    .from("products")
    .select("name, description, audience, benefits, offer, brand_id")
    .eq("id", campaign.product_id)
    .single();

  if (!product) return null;

  const { data: brand } = await supabase
    .from("brands")
    .select("name, brand_voice, visual_style")
    .eq("id", product.brand_id)
    .single();

  if (!brand) return null;

  return { brand, product };
}

export async function createConcept(
  campaignId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const fields = fieldsFromForm(formData);
  if (!fields.name) {
    return { error: "Concept name is required." };
  }

  const supabase = getSupabaseServerClient();
  const context = await getPromptContext(supabase, campaignId);
  if (!context) {
    return { error: "Could not find the parent campaign/product/brand." };
  }

  const generatedPrompt = buildConceptPrompt(context.brand, context.product, fields);

  const { data: concept, error } = await supabase
    .from("concepts")
    .insert({
      campaign_id: campaignId,
      ...fields,
      generated_prompt: generatedPrompt,
    })
    .select()
    .single();

  if (error || !concept) {
    return { error: error?.message ?? "Failed to create concept." };
  }

  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/concepts/${concept.id}`);
}

export async function updateConcept(
  conceptId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const fields = fieldsFromForm(formData);
  if (!fields.name) {
    return { error: "Concept name is required." };
  }

  const supabase = getSupabaseServerClient();

  const { data: existing } = await supabase
    .from("concepts")
    .select("campaign_id")
    .eq("id", conceptId)
    .single();

  if (!existing) {
    return { error: "Concept not found." };
  }

  const context = await getPromptContext(supabase, existing.campaign_id);
  if (!context) {
    return { error: "Could not find the parent campaign/product/brand." };
  }

  const generatedPrompt = buildConceptPrompt(context.brand, context.product, fields);

  const { error } = await supabase
    .from("concepts")
    .update({ ...fields, generated_prompt: generatedPrompt })
    .eq("id", conceptId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/concepts/${conceptId}`);
  revalidatePath(`/campaigns/${existing.campaign_id}`);
  redirect(`/concepts/${conceptId}`);
}

// Persists only the AI-suggested concepts the user chose to keep in the
// preview UI. Nothing from suggestConceptsForCampaign() is ever written to
// the database until this runs.
export async function saveSuggestedConcepts(
  campaignId: string,
  suggestions: ConceptSuggestion[]
): Promise<{ error: string } | null> {
  if (suggestions.length === 0) {
    return { error: "No concepts selected." };
  }

  const supabase = getSupabaseServerClient();
  const context = await getPromptContext(supabase, campaignId);
  if (!context) {
    return { error: "Could not find the parent campaign/product/brand." };
  }

  const rows = suggestions.map((suggestion) => {
    // AI suggestions inherit the brand's voice/style rather than overriding
    // them, so these are always null here (same as leaving the fields blank
    // in the manual Concept form).
    const fields = { ...suggestion, visual_style_override: null, tone_override: null };
    return {
      campaign_id: campaignId,
      ...fields,
      generated_prompt: buildConceptPrompt(context.brand, context.product, fields),
    };
  });

  const { error } = await supabase.from("concepts").insert(rows);
  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/campaigns/${campaignId}`);
  return null;
}

export async function deleteConcept(conceptId: string) {
  const supabase = getSupabaseServerClient();

  const { data: concept } = await supabase
    .from("concepts")
    .select("campaign_id")
    .eq("id", conceptId)
    .single();

  const { data: creatives } = await supabase
    .from("creatives")
    .select("asset_url")
    .eq("concept_id", conceptId);

  const paths = (creatives ?? [])
    .map((creative) =>
      creative.asset_url
        ? getStoragePathFromPublicUrl(creative.asset_url, "creative-assets")
        : null
    )
    .filter((path): path is string => Boolean(path));

  if (paths.length > 0) {
    await supabase.storage.from("creative-assets").remove(paths);
  }

  // creatives rows cascade-delete via the FK constraint.
  await supabase.from("concepts").delete().eq("id", conceptId);

  if (concept?.campaign_id) {
    revalidatePath(`/campaigns/${concept.campaign_id}`);
    redirect(`/campaigns/${concept.campaign_id}`);
  } else {
    redirect("/dashboard");
  }
}

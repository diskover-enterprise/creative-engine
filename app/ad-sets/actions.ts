"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getStoragePathFromPublicUrl } from "@/lib/supabase/storage";
import { buildAdSetPrompt } from "@/lib/promptTemplate";
import type { AdSetFormat } from "@/types";
import type { AdSetSuggestion } from "@/lib/anthropic";

export type ActionState = { error: string } | null;

const FORMATS: AdSetFormat[] = ["static_image", "video"];

function textOrNull(formData: FormData, key: string) {
  const value = formData.get(key)?.toString().trim();
  return value ? value : null;
}

function formatOrDefault(formData: FormData): AdSetFormat {
  const value = formData.get("format")?.toString();
  return (FORMATS as string[]).includes(value ?? "") ? (value as AdSetFormat) : "static_image";
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

// Fetches the parent Campaign fields the deterministic prompt template needs.
async function getPromptContext(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  campaignId: string
) {
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("name, description, brand_voice, visual_style, audience, benefits, offer")
    .eq("id", campaignId)
    .single();

  if (!campaign) return null;

  return campaign;
}

export async function createAdSet(
  campaignId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const fields = fieldsFromForm(formData);
  if (!fields.name) {
    return { error: "Ad set name is required." };
  }

  const supabase = getSupabaseServerClient();
  const context = await getPromptContext(supabase, campaignId);
  if (!context) {
    return { error: "Could not find the parent campaign." };
  }

  const generatedPrompt = buildAdSetPrompt(context, fields);

  const { data: adSet, error } = await supabase
    .from("ad_sets")
    .insert({
      campaign_id: campaignId,
      ...fields,
      generated_prompt: generatedPrompt,
    })
    .select()
    .single();

  if (error || !adSet) {
    return { error: error?.message ?? "Failed to create ad set." };
  }

  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/ad-sets/${adSet.id}`);
}

export async function updateAdSet(
  adSetId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const fields = fieldsFromForm(formData);
  if (!fields.name) {
    return { error: "Ad set name is required." };
  }

  const supabase = getSupabaseServerClient();

  const { data: existing } = await supabase
    .from("ad_sets")
    .select("campaign_id")
    .eq("id", adSetId)
    .single();

  if (!existing) {
    return { error: "Ad set not found." };
  }

  const context = await getPromptContext(supabase, existing.campaign_id);
  if (!context) {
    return { error: "Could not find the parent campaign." };
  }

  const generatedPrompt = buildAdSetPrompt(context, fields);

  const { error } = await supabase
    .from("ad_sets")
    .update({ ...fields, generated_prompt: generatedPrompt })
    .eq("id", adSetId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/ad-sets/${adSetId}`);
  revalidatePath(`/campaigns/${existing.campaign_id}`);
  redirect(`/ad-sets/${adSetId}`);
}

// Persists only the AI-suggested ad sets the user chose to keep in the
// preview UI. Nothing from suggestAdSetsForCampaign() is ever written to the
// database until this runs.
export async function saveSuggestedAdSets(
  campaignId: string,
  suggestions: AdSetSuggestion[]
): Promise<{ error: string } | null> {
  if (suggestions.length === 0) {
    return { error: "No ad sets selected." };
  }

  const supabase = getSupabaseServerClient();
  const context = await getPromptContext(supabase, campaignId);
  if (!context) {
    return { error: "Could not find the parent campaign." };
  }

  const rows = suggestions.map((suggestion) => {
    // AI suggestions inherit the campaign's voice/style rather than
    // overriding them, so these are always null here (same as leaving the
    // fields blank in the manual Ad Set form).
    const fields = { ...suggestion, visual_style_override: null, tone_override: null };
    return {
      campaign_id: campaignId,
      ...fields,
      generated_prompt: buildAdSetPrompt(context, fields),
    };
  });

  const { error } = await supabase.from("ad_sets").insert(rows);
  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/campaigns/${campaignId}`);
  return null;
}

export async function deleteAdSet(adSetId: string) {
  const supabase = getSupabaseServerClient();

  const { data: adSet } = await supabase
    .from("ad_sets")
    .select("campaign_id")
    .eq("id", adSetId)
    .single();

  const { data: ads } = await supabase
    .from("ads")
    .select("asset_url")
    .eq("ad_set_id", adSetId);

  const paths = (ads ?? [])
    .map((ad) => (ad.asset_url ? getStoragePathFromPublicUrl(ad.asset_url, "creative-assets") : null))
    .filter((path): path is string => Boolean(path));

  if (paths.length > 0) {
    await supabase.storage.from("creative-assets").remove(paths);
  }

  // ads rows cascade-delete via the FK constraint.
  await supabase.from("ad_sets").delete().eq("id", adSetId);

  if (adSet?.campaign_id) {
    revalidatePath(`/campaigns/${adSet.campaign_id}`);
    redirect(`/campaigns/${adSet.campaign_id}`);
  } else {
    redirect("/campaigns");
  }
}

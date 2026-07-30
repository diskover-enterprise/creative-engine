"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getStoragePathFromPublicUrl } from "@/lib/supabase/storage";
import { suggestConcepts, type ConceptSuggestion } from "@/lib/anthropic";
import type { CampaignStatus } from "@/types";

export type ActionState = { error: string } | null;

const STATUSES: CampaignStatus[] = ["draft", "active", "paused", "completed"];

function textOrNull(formData: FormData, key: string) {
  const value = formData.get(key)?.toString().trim();
  return value ? value : null;
}

function statusOrDefault(formData: FormData): CampaignStatus {
  const value = formData.get("status")?.toString();
  return (STATUSES as string[]).includes(value ?? "") ? (value as CampaignStatus) : "draft";
}

export async function createCampaign(
  productId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const name = textOrNull(formData, "name");
  if (!name) {
    return { error: "Campaign name is required." };
  }

  const supabase = getSupabaseServerClient();

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      product_id: productId,
      name,
      objective: textOrNull(formData, "objective"),
      status: statusOrDefault(formData),
      start_date: textOrNull(formData, "start_date"),
      end_date: textOrNull(formData, "end_date"),
      notes: textOrNull(formData, "notes"),
    })
    .select()
    .single();

  if (error || !campaign) {
    return { error: error?.message ?? "Failed to create campaign." };
  }

  revalidatePath(`/products/${productId}`);
  redirect(`/campaigns/${campaign.id}`);
}

export async function updateCampaign(
  campaignId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const name = textOrNull(formData, "name");
  if (!name) {
    return { error: "Campaign name is required." };
  }

  const supabase = getSupabaseServerClient();

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .update({
      name,
      objective: textOrNull(formData, "objective"),
      status: statusOrDefault(formData),
      start_date: textOrNull(formData, "start_date"),
      end_date: textOrNull(formData, "end_date"),
      notes: textOrNull(formData, "notes"),
    })
    .eq("id", campaignId)
    .select()
    .single();

  if (error || !campaign) {
    return { error: error?.message ?? "Failed to update campaign." };
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/products/${campaign.product_id}`);
  redirect(`/campaigns/${campaignId}`);
}

// Proposes 3 draft Concepts for this Campaign using Claude -- these are NOT
// saved. The caller (a client component) shows them as a preview and only
// persists the ones the user picks, via saveSuggestedConcepts.
export async function suggestConceptsForCampaign(
  campaignId: string
): Promise<{ error: string } | { suggestions: ConceptSuggestion[] }> {
  const supabase = getSupabaseServerClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("name, objective, product_id")
    .eq("id", campaignId)
    .single();

  if (!campaign) {
    return { error: "Campaign not found." };
  }

  const { data: product } = await supabase
    .from("products")
    .select("name, description, audience, benefits, offer, brand_id")
    .eq("id", campaign.product_id)
    .single();

  if (!product) {
    return { error: "Product not found." };
  }

  const { data: brand } = await supabase
    .from("brands")
    .select("name, brand_voice, visual_style")
    .eq("id", product.brand_id)
    .single();

  if (!brand) {
    return { error: "Brand not found." };
  }

  try {
    const suggestions = await suggestConcepts({
      brand,
      product,
      campaign: { name: campaign.name, objective: campaign.objective },
    });
    return { suggestions };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to generate suggestions." };
  }
}

export async function deleteCampaign(campaignId: string) {
  const supabase = getSupabaseServerClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("product_id")
    .eq("id", campaignId)
    .single();

  const { data: concepts } = await supabase
    .from("concepts")
    .select("id")
    .eq("campaign_id", campaignId);

  const conceptIds = (concepts ?? []).map((concept) => concept.id);

  if (conceptIds.length > 0) {
    const { data: creatives } = await supabase
      .from("creatives")
      .select("asset_url")
      .in("concept_id", conceptIds);

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
  }

  // concepts and creatives rows cascade-delete via FK constraints.
  await supabase.from("campaigns").delete().eq("id", campaignId);

  if (campaign?.product_id) {
    revalidatePath(`/products/${campaign.product_id}`);
    redirect(`/products/${campaign.product_id}`);
  } else {
    redirect("/dashboard");
  }
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getStoragePathFromPublicUrl } from "@/lib/supabase/storage";
import { suggestAdSets, type AdSetSuggestion } from "@/lib/anthropic";
import { buildAdSetPrompt } from "@/lib/promptTemplate";
import { submitHiggsfieldImageGeneration } from "@/lib/higgsfield";
import type { CampaignStatus, AdSetFormat } from "@/types";

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

function validLandingPageUrl(formData: FormData): { value: string | null } | { error: string } {
  const value = textOrNull(formData, "landing_page_url");
  if (!value) return { value: null };
  try {
    new URL(value);
    return { value };
  } catch {
    return { error: "Landing page URL is not a valid URL." };
  }
}

// Only Name + Description are on the create form now -- everything else
// (brand voice, audience, offer, scheduling, auto_generate, ...) is still a
// real column you can fill in later from the Edit page, just not required
// up front.
function fieldsFromForm(formData: FormData) {
  return {
    name: textOrNull(formData, "name"),
    description: textOrNull(formData, "description"),
    brand_voice: textOrNull(formData, "brand_voice"),
    visual_style: textOrNull(formData, "visual_style"),
    audience: textOrNull(formData, "audience"),
    benefits: textOrNull(formData, "benefits"),
    offer: textOrNull(formData, "offer"),
    auto_generate: formData.get("auto_generate") === "on",
    objective: textOrNull(formData, "objective"),
    status: statusOrDefault(formData),
    start_date: textOrNull(formData, "start_date"),
    end_date: textOrNull(formData, "end_date"),
    notes: textOrNull(formData, "notes"),
  };
}

async function uploadLogo(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  campaignId: string,
  logo: File
) {
  const path = `${campaignId}/${Date.now()}-${logo.name}`;
  const { error } = await supabase.storage
    .from("brand-logos")
    .upload(path, logo, { contentType: logo.type });

  if (error) {
    throw new Error(error.message);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("brand-logos").getPublicUrl(path);

  return publicUrl;
}

// The product photo passed to Higgsfield as a reference so generated ads
// show the real product instead of an invented one. Stored in the same
// bucket as gallery campaign images, just referenced by its own column
// (campaigns.product_image_url) rather than a campaign_images row, since
// it's used as generation input, not a gallery photo.
async function uploadProductImage(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  campaignId: string,
  image: File
) {
  const path = `${campaignId}/product-reference-${Date.now()}-${image.name}`;
  const { error } = await supabase.storage
    .from("product-images")
    .upload(path, image, { contentType: image.type });

  if (error) {
    throw new Error(error.message);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("product-images").getPublicUrl(path);

  return publicUrl;
}

async function uploadCampaignImages(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  campaignId: string,
  images: File[],
  startPosition: number
) {
  let position = startPosition;
  for (const image of images) {
    const path = `${campaignId}/${Date.now()}-${position}-${image.name}`;
    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(path, image, { contentType: image.type });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("product-images").getPublicUrl(path);

    await supabase.from("campaign_images").insert({
      campaign_id: campaignId,
      url: publicUrl,
      position,
    });

    position += 1;
  }
}

export async function createCampaign(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const fields = fieldsFromForm(formData);
  if (!fields.name) {
    return { error: "Campaign name is required." };
  }

  const landingPage = validLandingPageUrl(formData);
  if ("error" in landingPage) {
    return { error: landingPage.error };
  }

  const supabase = getSupabaseServerClient();

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({ ...fields, landing_page_url: landingPage.value })
    .select()
    .single();

  if (error || !campaign) {
    return { error: error?.message ?? "Failed to create campaign." };
  }

  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    try {
      const logoUrl = await uploadLogo(supabase, campaign.id, logo);
      await supabase.from("campaigns").update({ logo_url: logoUrl }).eq("id", campaign.id);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to upload logo." };
    }
  }

  const productImage = formData.get("product_image");
  if (productImage instanceof File && productImage.size > 0) {
    try {
      const productImageUrl = await uploadProductImage(supabase, campaign.id, productImage);
      await supabase.from("campaigns").update({ product_image_url: productImageUrl }).eq("id", campaign.id);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to upload product image." };
    }
  }

  const images = formData
    .getAll("images")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (images.length > 0) {
    try {
      await uploadCampaignImages(supabase, campaign.id, images, 0);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to upload images." };
    }
  }

  revalidatePath("/campaigns");
  redirect(`/campaigns/${campaign.id}`);
}

export async function updateCampaign(
  campaignId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const fields = fieldsFromForm(formData);
  if (!fields.name) {
    return { error: "Campaign name is required." };
  }

  const landingPage = validLandingPageUrl(formData);
  if ("error" in landingPage) {
    return { error: landingPage.error };
  }

  const supabase = getSupabaseServerClient();

  const { data: existing } = await supabase
    .from("campaigns")
    .select("logo_url, product_image_url")
    .eq("id", campaignId)
    .single();

  const updates: Record<string, string | boolean | null> = {
    ...fields,
    landing_page_url: landingPage.value,
  };

  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    try {
      updates.logo_url = await uploadLogo(supabase, campaignId, logo);
      if (existing?.logo_url) {
        const oldPath = getStoragePathFromPublicUrl(existing.logo_url, "brand-logos");
        if (oldPath) {
          await supabase.storage.from("brand-logos").remove([oldPath]);
        }
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to upload logo." };
    }
  }

  const productImage = formData.get("product_image");
  if (productImage instanceof File && productImage.size > 0) {
    try {
      updates.product_image_url = await uploadProductImage(supabase, campaignId, productImage);
      if (existing?.product_image_url) {
        const oldPath = getStoragePathFromPublicUrl(existing.product_image_url, "product-images");
        if (oldPath) {
          await supabase.storage.from("product-images").remove([oldPath]);
        }
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to upload product image." };
    }
  }

  const { error } = await supabase.from("campaigns").update(updates).eq("id", campaignId);
  if (error) {
    return { error: error.message };
  }

  const images = formData
    .getAll("images")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (images.length > 0) {
    const { data: existingImages } = await supabase
      .from("campaign_images")
      .select("position")
      .eq("campaign_id", campaignId)
      .order("position", { ascending: false })
      .limit(1);

    const startPosition = (existingImages?.[0]?.position ?? -1) + 1;

    try {
      await uploadCampaignImages(supabase, campaignId, images, startPosition);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to upload images." };
    }
  }

  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}`);
}

// Proposes 10 draft Ad Sets for this Campaign using Claude, all in the given
// format (Image vs Video is chosen once for the whole batch) -- these are
// NOT saved. The caller (a client component) shows them as a preview and
// only persists the ones the user picks, via saveSuggestedAdSets.
export async function suggestAdSetsForCampaign(
  campaignId: string,
  format: AdSetFormat
): Promise<{ error: string } | { suggestions: AdSetSuggestion[] }> {
  const supabase = getSupabaseServerClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("name, description, brand_voice, visual_style, audience, benefits, offer, objective, product_image_url")
    .eq("id", campaignId)
    .single();

  if (!campaign) {
    return { error: "Campaign not found." };
  }

  try {
    const suggestions = await suggestAdSets({
      campaign,
      format,
      hasProductImage: Boolean(campaign.product_image_url),
    });
    return { suggestions };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to generate suggestions." };
  }
}

const DEFAULT_DAILY_GENERATION_LIMIT = 20;

function startOfTodayUTC() {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

// The automated pipeline for a Campaign marked auto_generate: asks Claude for
// static_image ad set directions and saves all of them (no human preview
// step -- that's the point of automation), then starts a Higgsfield image
// for as many as the remaining daily budget allows. Automation always uses
// static_image -- the video pipeline needs a human to choose clip count and
// UGC/B-roll roles, which doesn't fit an unattended run.
export async function runAutomatedGeneration(
  campaignId: string
): Promise<{ error: string } | { adSetsCreated: number; generationsStarted: number }> {
  const supabase = getSupabaseServerClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select(
      "name, description, brand_voice, visual_style, audience, benefits, offer, objective, auto_generate, product_image_url"
    )
    .eq("id", campaignId)
    .single();

  if (!campaign) {
    return { error: "Campaign not found." };
  }
  if (!campaign.auto_generate) {
    return { error: "This campaign is not marked for automated generation." };
  }

  const dailyLimit = Number(process.env.DAILY_GENERATION_LIMIT ?? DEFAULT_DAILY_GENERATION_LIMIT);

  const { count: usedToday } = await supabase
    .from("generation_jobs")
    .select("id", { count: "exact", head: true })
    .eq("triggered_by", "automated")
    .gte("created_at", startOfTodayUTC());

  const remainingBudget = dailyLimit - (usedToday ?? 0);
  if (remainingBudget <= 0) {
    return { error: `Daily automated generation limit (${dailyLimit}) already reached today.` };
  }

  let suggestions;
  try {
    suggestions = await suggestAdSets({
      campaign,
      format: "static_image",
      hasProductImage: Boolean(campaign.product_image_url),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to generate ad set suggestions." };
  }

  const adSetRows = suggestions.map((suggestion) => {
    const fields = {
      ...suggestion,
      format: "static_image" as AdSetFormat,
      visual_style_override: null,
      tone_override: null,
    };
    return {
      campaign_id: campaignId,
      ...fields,
      generated_prompt: buildAdSetPrompt(campaign, fields),
    };
  });

  const { data: savedAdSets, error: insertError } = await supabase
    .from("ad_sets")
    .insert(adSetRows)
    .select("id, aspect_ratio, generated_prompt");

  if (insertError || !savedAdSets) {
    return { error: insertError?.message ?? "Failed to save generated ad sets." };
  }

  const toGenerate = savedAdSets.slice(0, remainingBudget);
  let generationsStarted = 0;

  for (const adSet of toGenerate) {
    if (!adSet.generated_prompt) continue;

    try {
      const requestId = await submitHiggsfieldImageGeneration(
        adSet.generated_prompt,
        adSet.aspect_ratio,
        campaign.product_image_url ?? undefined
      );
      await supabase.from("generation_jobs").insert({
        ad_set_id: adSet.id,
        provider: "higgsfield-image",
        external_request_id: requestId,
        status: "processing",
        prompt: adSet.generated_prompt,
        triggered_by: "automated",
      });
      generationsStarted += 1;
    } catch {
      // Leave this ad set without an Ad -- it can still be generated manually
      // later from its own page.
    }
  }

  revalidatePath(`/campaigns/${campaignId}`);

  return { adSetsCreated: savedAdSets.length, generationsStarted };
}

export async function deleteCampaignImage(imageId: string, campaignId: string) {
  const supabase = getSupabaseServerClient();

  const { data: image } = await supabase
    .from("campaign_images")
    .select("url")
    .eq("id", imageId)
    .single();

  if (image?.url) {
    const path = getStoragePathFromPublicUrl(image.url, "product-images");
    if (path) {
      await supabase.storage.from("product-images").remove([path]);
    }
  }

  await supabase.from("campaign_images").delete().eq("id", imageId);

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/edit`);
}

export async function deleteCampaign(campaignId: string) {
  const supabase = getSupabaseServerClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("logo_url, product_image_url")
    .eq("id", campaignId)
    .single();

  const { data: images } = await supabase
    .from("campaign_images")
    .select("url")
    .eq("campaign_id", campaignId);

  const imagePaths = (images ?? [])
    .map((image) => getStoragePathFromPublicUrl(image.url, "product-images"))
    .filter((path): path is string => Boolean(path));

  if (imagePaths.length > 0) {
    await supabase.storage.from("product-images").remove(imagePaths);
  }

  if (campaign?.logo_url) {
    const logoPath = getStoragePathFromPublicUrl(campaign.logo_url, "brand-logos");
    if (logoPath) {
      await supabase.storage.from("brand-logos").remove([logoPath]);
    }
  }

  if (campaign?.product_image_url) {
    const productImagePath = getStoragePathFromPublicUrl(campaign.product_image_url, "product-images");
    if (productImagePath) {
      await supabase.storage.from("product-images").remove([productImagePath]);
    }
  }

  const { data: adSets } = await supabase
    .from("ad_sets")
    .select("id")
    .eq("campaign_id", campaignId);

  const adSetIds = (adSets ?? []).map((adSet) => adSet.id);

  if (adSetIds.length > 0) {
    const { data: ads } = await supabase
      .from("ads")
      .select("asset_url")
      .in("ad_set_id", adSetIds);

    const adPaths = (ads ?? [])
      .map((ad) => (ad.asset_url ? getStoragePathFromPublicUrl(ad.asset_url, "creative-assets") : null))
      .filter((path): path is string => Boolean(path));

    if (adPaths.length > 0) {
      await supabase.storage.from("creative-assets").remove(adPaths);
    }
  }

  // campaign_images, ad_sets, and ads rows cascade-delete via FK constraints.
  await supabase.from("campaigns").delete().eq("id", campaignId);

  revalidatePath("/campaigns");
  redirect("/campaigns");
}

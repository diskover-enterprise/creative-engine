"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getStoragePathFromPublicUrl } from "@/lib/supabase/storage";
import { suggestConcepts } from "@/lib/anthropic";
import { buildConceptPrompt } from "@/lib/promptTemplate";
import { submitImageGeneration } from "@/lib/fal";

export type ActionState = { error: string } | null;

function textOrNull(formData: FormData, key: string) {
  const value = formData.get(key)?.toString().trim();
  return value ? value : null;
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

async function uploadProductImages(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  productId: string,
  images: File[],
  startPosition: number
) {
  let position = startPosition;
  for (const image of images) {
    const path = `${productId}/${Date.now()}-${position}-${image.name}`;
    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(path, image, { contentType: image.type });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("product-images").getPublicUrl(path);

    await supabase.from("product_images").insert({
      product_id: productId,
      url: publicUrl,
      position,
    });

    position += 1;
  }
}

export async function createProduct(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const brandId = formData.get("brand_id")?.toString();
  const name = textOrNull(formData, "name");

  if (!brandId || !name) {
    return { error: "Brand and product name are required." };
  }

  const landingPage = validLandingPageUrl(formData);
  if ("error" in landingPage) {
    return { error: landingPage.error };
  }

  const supabase = getSupabaseServerClient();

  const { data: product, error } = await supabase
    .from("products")
    .insert({
      brand_id: brandId,
      name,
      description: textOrNull(formData, "description"),
      landing_page_url: landingPage.value,
      audience: textOrNull(formData, "audience"),
      benefits: textOrNull(formData, "benefits"),
      offer: textOrNull(formData, "offer"),
      auto_generate: formData.get("auto_generate") === "on",
    })
    .select()
    .single();

  if (error || !product) {
    return { error: error?.message ?? "Failed to create product." };
  }

  const images = formData
    .getAll("images")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (images.length > 0) {
    try {
      await uploadProductImages(supabase, product.id, images, 0);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to upload images." };
    }
  }

  revalidatePath("/products");
  revalidatePath("/dashboard");
  redirect(`/products/${product.id}`);
}

export async function updateProduct(
  productId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const brandId = formData.get("brand_id")?.toString();
  const name = textOrNull(formData, "name");

  if (!brandId || !name) {
    return { error: "Brand and product name are required." };
  }

  const landingPage = validLandingPageUrl(formData);
  if ("error" in landingPage) {
    return { error: landingPage.error };
  }

  const supabase = getSupabaseServerClient();

  const { error } = await supabase
    .from("products")
    .update({
      brand_id: brandId,
      name,
      description: textOrNull(formData, "description"),
      landing_page_url: landingPage.value,
      audience: textOrNull(formData, "audience"),
      benefits: textOrNull(formData, "benefits"),
      offer: textOrNull(formData, "offer"),
      auto_generate: formData.get("auto_generate") === "on",
    })
    .eq("id", productId);

  if (error) {
    return { error: error.message };
  }

  const images = formData
    .getAll("images")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (images.length > 0) {
    const { data: existingImages } = await supabase
      .from("product_images")
      .select("position")
      .eq("product_id", productId)
      .order("position", { ascending: false })
      .limit(1);

    const startPosition = (existingImages?.[0]?.position ?? -1) + 1;

    try {
      await uploadProductImages(supabase, productId, images, startPosition);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to upload images." };
    }
  }

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  revalidatePath("/dashboard");
  redirect(`/products/${productId}`);
}

export async function deleteProduct(productId: string) {
  const supabase = getSupabaseServerClient();

  const { data: images } = await supabase
    .from("product_images")
    .select("url")
    .eq("product_id", productId);

  const paths = (images ?? [])
    .map((image) => getStoragePathFromPublicUrl(image.url, "product-images"))
    .filter((path): path is string => Boolean(path));

  if (paths.length > 0) {
    await supabase.storage.from("product-images").remove(paths);
  }

  // product_images rows cascade-delete via the FK constraint.
  await supabase.from("products").delete().eq("id", productId);

  revalidatePath("/products");
  revalidatePath("/dashboard");
  redirect("/products");
}

const DEFAULT_DAILY_GENERATION_LIMIT = 20;

function startOfTodayUTC() {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

// The automated pipeline for a Product marked auto_generate: finds-or-creates
// an "Automated" Campaign, asks Claude for 3 concept directions and saves all
// of them (no human preview step -- that's the point of automation), then
// starts fal.ai image generation for as many as the remaining daily budget
// allows. Video (Higgsfield) stays a manual step from the Creative page --
// it's slower and costlier, so automation doesn't reach for it by default.
export async function runAutomatedGeneration(
  productId: string
): Promise<{ error: string } | { conceptsCreated: number; generationsStarted: number }> {
  const supabase = getSupabaseServerClient();

  const { data: product } = await supabase
    .from("products")
    .select("name, description, audience, benefits, offer, brand_id, auto_generate")
    .eq("id", productId)
    .single();

  if (!product) {
    return { error: "Product not found." };
  }
  if (!product.auto_generate) {
    return { error: "This product is not marked for automated generation." };
  }

  const { data: brand } = await supabase
    .from("brands")
    .select("name, brand_voice, visual_style")
    .eq("id", product.brand_id)
    .single();

  if (!brand) {
    return { error: "Brand not found." };
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

  let { data: campaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("product_id", productId)
    .eq("name", "Automated")
    .maybeSingle();

  if (!campaign) {
    const { data: newCampaign, error: campaignError } = await supabase
      .from("campaigns")
      .insert({ product_id: productId, name: "Automated", status: "active" })
      .select("id")
      .single();

    if (campaignError || !newCampaign) {
      return { error: campaignError?.message ?? "Failed to create the Automated campaign." };
    }
    campaign = newCampaign;
  }

  let suggestions;
  try {
    suggestions = await suggestConcepts({
      brand,
      product,
      campaign: { name: "Automated", objective: null },
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to generate concept suggestions." };
  }

  const conceptRows = suggestions.map((suggestion) => {
    const fields = { ...suggestion, visual_style_override: null, tone_override: null };
    return {
      campaign_id: campaign!.id,
      ...fields,
      generated_prompt: buildConceptPrompt(brand, product, fields),
    };
  });

  const { data: savedConcepts, error: insertError } = await supabase
    .from("concepts")
    .insert(conceptRows)
    .select("id, aspect_ratio, generated_prompt");

  if (insertError || !savedConcepts) {
    return { error: insertError?.message ?? "Failed to save generated concepts." };
  }

  const toGenerate = savedConcepts.slice(0, remainingBudget);
  let generationsStarted = 0;

  for (const concept of toGenerate) {
    if (!concept.generated_prompt) continue;
    try {
      const requestId = await submitImageGeneration(concept.generated_prompt, concept.aspect_ratio);
      await supabase.from("generation_jobs").insert({
        concept_id: concept.id,
        provider: "fal-ai",
        external_request_id: requestId,
        status: "processing",
        prompt: concept.generated_prompt,
        triggered_by: "automated",
      });
      generationsStarted += 1;
    } catch {
      // Leave this concept without a Creative -- it can still be generated
      // manually later from its own page.
    }
  }

  revalidatePath(`/products/${productId}`);
  revalidatePath(`/campaigns/${campaign.id}`);

  return { conceptsCreated: savedConcepts.length, generationsStarted };
}

export async function deleteProductImage(imageId: string, productId: string) {
  const supabase = getSupabaseServerClient();

  const { data: image } = await supabase
    .from("product_images")
    .select("url")
    .eq("id", imageId)
    .single();

  if (image?.url) {
    const path = getStoragePathFromPublicUrl(image.url, "product-images");
    if (path) {
      await supabase.storage.from("product-images").remove([path]);
    }
  }

  await supabase.from("product_images").delete().eq("id", imageId);

  revalidatePath(`/products/${productId}`);
  revalidatePath(`/products/${productId}/edit`);
  revalidatePath("/products");
}

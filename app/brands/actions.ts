"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getStoragePathFromPublicUrl } from "@/lib/supabase/storage";

export type ActionState = { error: string } | null;

function textOrNull(formData: FormData, key: string) {
  const value = formData.get(key)?.toString().trim();
  return value ? value : null;
}

async function uploadLogo(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  brandId: string,
  logo: File
) {
  const path = `${brandId}/${Date.now()}-${logo.name}`;
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

export async function createBrand(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const name = textOrNull(formData, "name");
  if (!name) {
    return { error: "Brand name is required." };
  }

  const supabase = getSupabaseServerClient();

  const { data: brand, error } = await supabase
    .from("brands")
    .insert({
      name,
      description: textOrNull(formData, "description"),
      brand_voice: textOrNull(formData, "brand_voice"),
      visual_style: textOrNull(formData, "visual_style"),
    })
    .select()
    .single();

  if (error || !brand) {
    return { error: error?.message ?? "Failed to create brand." };
  }

  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    try {
      const logoUrl = await uploadLogo(supabase, brand.id, logo);
      await supabase.from("brands").update({ logo_url: logoUrl }).eq("id", brand.id);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to upload logo." };
    }
  }

  revalidatePath("/brands");
  revalidatePath("/dashboard");
  redirect(`/brands/${brand.id}`);
}

export async function updateBrand(
  brandId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const name = textOrNull(formData, "name");
  if (!name) {
    return { error: "Brand name is required." };
  }

  const supabase = getSupabaseServerClient();

  const { data: existing } = await supabase
    .from("brands")
    .select("logo_url")
    .eq("id", brandId)
    .single();

  const updates: Record<string, string | null> = {
    name,
    description: textOrNull(formData, "description"),
    brand_voice: textOrNull(formData, "brand_voice"),
    visual_style: textOrNull(formData, "visual_style"),
  };

  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    try {
      updates.logo_url = await uploadLogo(supabase, brandId, logo);
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

  const { error } = await supabase.from("brands").update(updates).eq("id", brandId);
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/brands");
  revalidatePath(`/brands/${brandId}`);
  revalidatePath("/dashboard");
  redirect(`/brands/${brandId}`);
}

export async function deleteBrand(brandId: string) {
  const supabase = getSupabaseServerClient();

  const { data: brand } = await supabase
    .from("brands")
    .select("logo_url")
    .eq("id", brandId)
    .single();

  const { data: products } = await supabase
    .from("products")
    .select("id")
    .eq("brand_id", brandId);

  const productIds = (products ?? []).map((product) => product.id);

  if (productIds.length > 0) {
    const { data: images } = await supabase
      .from("product_images")
      .select("url")
      .in("product_id", productIds);

    const paths = (images ?? [])
      .map((image) => getStoragePathFromPublicUrl(image.url, "product-images"))
      .filter((path): path is string => Boolean(path));

    if (paths.length > 0) {
      await supabase.storage.from("product-images").remove(paths);
    }
  }

  if (brand?.logo_url) {
    const logoPath = getStoragePathFromPublicUrl(brand.logo_url, "brand-logos");
    if (logoPath) {
      await supabase.storage.from("brand-logos").remove([logoPath]);
    }
  }

  // Products and product_images rows cascade-delete via the FK constraints.
  await supabase.from("brands").delete().eq("id", brandId);

  revalidatePath("/brands");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  redirect("/brands");
}

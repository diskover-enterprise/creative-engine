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

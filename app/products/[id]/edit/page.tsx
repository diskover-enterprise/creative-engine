import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { updateProduct, deleteProductImage } from "../../actions";
import ProductForm from "@/components/ProductForm";
import type { Product } from "@/types";

export const dynamic = "force-dynamic";

type ProductWithImages = Product & {
  product_images: { id: string; url: string; position: number }[];
};

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  const [{ data: productData }, { data: brands }] = await Promise.all([
    supabase
      .from("products")
      .select("*, product_images(id, url, position)")
      .eq("id", id)
      .single(),
    supabase.from("brands").select("id, name").order("name"),
  ]);

  if (!productData) {
    notFound();
  }

  const product = productData as ProductWithImages;

  const boundUpdate = updateProduct.bind(null, product.id);
  const existingImages = [...product.product_images]
    .sort((a, b) => a.position - b.position)
    .map((image) => ({
      id: image.id,
      url: image.url,
      deleteAction: deleteProductImage.bind(null, image.id, product.id),
    }));

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold">Edit Product</h1>
      <ProductForm
        action={boundUpdate}
        brands={brands ?? []}
        product={product}
        existingImages={existingImages}
        submitLabel="Save Changes"
      />
    </div>
  );
}

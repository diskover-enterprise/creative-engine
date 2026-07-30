import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createProduct } from "../actions";
import ProductForm from "@/components/ProductForm";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const supabase = getSupabaseServerClient();
  const { data: brands } = await supabase
    .from("brands")
    .select("id, name")
    .order("name");

  if (!brands || brands.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Create Product</h1>
        <p className="mt-2 text-foreground/60">
          You need to create a brand before adding a product.
        </p>
        <Link href="/brands/new" className="mt-4 inline-block text-sm underline">
          Create a brand
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold">Create Product</h1>
      <ProductForm action={createProduct} brands={brands} submitLabel="Save Product" />
    </div>
  );
}

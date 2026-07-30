import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Brand, Product } from "@/types";

export const dynamic = "force-dynamic";

type ProductWithBrand = Product & { brands: { id: string; name: string } | null };

export default async function DashboardPage() {
  const supabase = getSupabaseServerClient();

  const [{ data: brandsData }, { data: productsData }] = await Promise.all([
    supabase
      .from("brands")
      .select("id, name")
      .order("created_at", { ascending: false }),
    supabase
      .from("products")
      .select("id, name, brands(id, name)")
      .order("created_at", { ascending: false }),
  ]);

  const brands = (brandsData ?? []) as Pick<Brand, "id" | "name">[];
  const products = (productsData ?? []) as unknown as Pick<
    ProductWithBrand,
    "id" | "name" | "brands"
  >[];

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap gap-3">
        <Link
          href="/brands/new"
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          + Create Brand
        </Link>
        <Link
          href="/products/new"
          className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium dark:border-white/15"
        >
          + Create Product
        </Link>
      </div>

      <section>
        <h2 className="text-lg font-semibold">Brands</h2>
        {brands.length === 0 ? (
          <p className="mt-2 text-sm text-foreground/60">No brands yet.</p>
        ) : (
          <ul className="mt-3 space-y-1">
            {brands.map((brand) => (
              <li key={brand.id} className="text-sm">
                <Link href={`/brands/${brand.id}`} className="hover:underline">
                  {brand.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Products</h2>
        {products.length === 0 ? (
          <p className="mt-2 text-sm text-foreground/60">No products yet.</p>
        ) : (
          <ul className="mt-3 space-y-1">
            {products.map((product) => (
              <li key={product.id} className="text-sm">
                <Link href={`/products/${product.id}`} className="hover:underline">
                  {product.name}
                </Link>
                {product.brands ? (
                  <span className="text-foreground/50"> — {product.brands.name}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

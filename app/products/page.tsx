import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Product } from "@/types";

type ProductListItem = Product & {
  brands: { id: string; name: string } | null;
  product_images: { url: string; position: number }[];
};

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("products")
    .select("*, brands(id, name), product_images(url, position)")
    .order("created_at", { ascending: false });

  const products = (data ?? []) as ProductListItem[];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Products</h1>
        <Link
          href="/products/new"
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          + Create Product
        </Link>
      </div>

      {products.length === 0 ? (
        <p className="mt-6 text-foreground/60">No products yet.</p>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {products.map((product) => {
            const [image] = [...product.product_images].sort(
              (a, b) => a.position - b.position
            );
            return (
              <li
                key={product.id}
                className="rounded-lg border border-black/10 p-4 dark:border-white/10"
              >
                <Link href={`/products/${product.id}`} className="block">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={image.url}
                      alt=""
                      className="mb-3 h-32 w-full rounded object-cover"
                    />
                  ) : null}
                  <span className="font-medium hover:underline">{product.name}</span>
                </Link>
                {product.brands ? (
                  <Link
                    href={`/brands/${product.brands.id}`}
                    className="mt-1 block text-sm text-foreground/60 hover:underline"
                  >
                    {product.brands.name}
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

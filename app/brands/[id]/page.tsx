import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { deleteBrand } from "../actions";
import DeleteButton from "@/components/DeleteButton";
import type { Brand, Product } from "@/types";

export const dynamic = "force-dynamic";

export default async function BrandDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  const [{ data: brandData }, { data: productsData }] = await Promise.all([
    supabase.from("brands").select("*").eq("id", id).single(),
    supabase
      .from("products")
      .select("id, name")
      .eq("brand_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!brandData) {
    notFound();
  }

  const brand = brandData as Brand;
  const products = (productsData ?? []) as Pick<Product, "id" | "name">[];
  const boundDelete = deleteBrand.bind(null, brand.id);

  return (
    <div className="max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {brand.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logo_url}
              alt=""
              className="h-14 w-14 rounded object-cover"
            />
          ) : null}
          <h1 className="text-2xl font-semibold">{brand.name}</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/brands/${brand.id}/edit`}
            className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium dark:border-white/15"
          >
            Edit
          </Link>
          <DeleteButton
            action={boundDelete}
            confirmText={`Delete "${brand.name}"? This also deletes its ${products.length} product(s) and their images. This cannot be undone.`}
          />
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Detail label="Description" value={brand.description} />
        <Detail label="Brand Voice" value={brand.brand_voice} />
        <Detail label="Visual Style" value={brand.visual_style} />
      </dl>

      <section className="mt-10">
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
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-foreground/40">
        {label}
      </dt>
      <dd className="mt-1 text-sm">
        {value || <span className="text-foreground/40">—</span>}
      </dd>
    </div>
  );
}

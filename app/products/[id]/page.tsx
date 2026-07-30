import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { deleteProduct } from "../actions";
import DeleteButton from "@/components/DeleteButton";
import type { Campaign, Product } from "@/types";

type ProductDetail = Product & {
  brands: { id: string; name: string } | null;
  product_images: { id: string; url: string; position: number }[];
};

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  const [{ data }, { data: campaignsData }] = await Promise.all([
    supabase
      .from("products")
      .select("*, brands(id, name), product_images(id, url, position)")
      .eq("id", id)
      .single(),
    supabase
      .from("campaigns")
      .select("id, name, status")
      .eq("product_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!data) {
    notFound();
  }

  const product = data as ProductDetail;
  const images = [...product.product_images].sort(
    (a, b) => a.position - b.position
  );
  const campaigns = (campaignsData ?? []) as Pick<Campaign, "id" | "name" | "status">[];
  const boundDelete = deleteProduct.bind(null, product.id);

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          {product.brands ? (
            <Link
              href={`/brands/${product.brands.id}`}
              className="text-sm text-foreground/60 hover:underline"
            >
              {product.brands.name}
            </Link>
          ) : null}
          <h1 className="text-2xl font-semibold">{product.name}</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/products/${product.id}/edit`}
            className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium dark:border-white/15"
          >
            Edit
          </Link>
          <DeleteButton
            action={boundDelete}
            confirmText={`Delete "${product.name}"? This cannot be undone.`}
          />
        </div>
      </div>

      {images.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((image) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={image.id}
              src={image.url}
              alt=""
              className="aspect-square rounded-lg object-cover"
            />
          ))}
        </div>
      )}

      <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Detail label="Description" value={product.description} />
        <Detail label="Target Audience" value={product.audience} />
        <Detail label="Benefits" value={product.benefits} />
        <Detail label="Offer" value={product.offer} />
        <Detail
          label="Landing Page"
          value={
            product.landing_page_url ? (
              <a
                href={product.landing_page_url}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {product.landing_page_url}
              </a>
            ) : null
          }
        />
      </dl>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Campaigns</h2>
          <Link
            href={`/products/${product.id}/campaigns/new`}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
          >
            + New Campaign
          </Link>
        </div>
        {campaigns.length === 0 ? (
          <p className="mt-2 text-sm text-foreground/60">No campaigns yet.</p>
        ) : (
          <ul className="mt-3 space-y-1">
            {campaigns.map((campaign) => (
              <li key={campaign.id} className="text-sm">
                <Link href={`/campaigns/${campaign.id}`} className="hover:underline">
                  {campaign.name}
                </Link>
                <span className="text-foreground/50"> — {campaign.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
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

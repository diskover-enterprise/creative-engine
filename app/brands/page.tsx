import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Brand } from "@/types";

export const dynamic = "force-dynamic";

export default async function BrandsPage() {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("brands")
    .select("*")
    .order("created_at", { ascending: false });

  const brands = (data ?? []) as Brand[];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Brands</h1>
        <Link
          href="/brands/new"
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          + Create Brand
        </Link>
      </div>

      {brands.length === 0 ? (
        <p className="mt-6 text-foreground/60">No brands yet.</p>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {brands.map((brand) => (
            <li key={brand.id}>
              <Link
                href={`/brands/${brand.id}`}
                className="block rounded-lg border border-black/10 p-4 hover:border-black/30 dark:border-white/10 dark:hover:border-white/30"
              >
                <div className="flex items-center gap-3">
                  {brand.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={brand.logo_url}
                      alt=""
                      className="h-10 w-10 rounded object-cover"
                    />
                  ) : null}
                  <span className="font-medium">{brand.name}</span>
                </div>
                {brand.description ? (
                  <p className="mt-2 line-clamp-2 text-sm text-foreground/60">
                    {brand.description}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createAd } from "@/app/ads/actions";
import AdForm from "@/components/AdForm";

export const dynamic = "force-dynamic";

export default async function NewAdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: adSetId } = await params;
  const supabase = getSupabaseServerClient();
  const { data: adSet } = await supabase
    .from("ad_sets")
    .select("id, name")
    .eq("id", adSetId)
    .single();

  if (!adSet) {
    notFound();
  }

  const boundCreate = createAd.bind(null, adSetId);

  return (
    <div className="max-w-xl">
      <p className="text-sm text-foreground/60">{adSet.name}</p>
      <h1 className="text-2xl font-semibold">Create Ad</h1>
      <AdForm action={boundCreate} submitLabel="Save Ad" />
    </div>
  );
}

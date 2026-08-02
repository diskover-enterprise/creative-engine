import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createAdSet } from "@/app/ad-sets/actions";
import AdSetForm from "@/components/AdSetForm";

export const dynamic = "force-dynamic";

export default async function NewAdSetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: campaignId } = await params;
  const supabase = getSupabaseServerClient();
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name")
    .eq("id", campaignId)
    .single();

  if (!campaign) {
    notFound();
  }

  const boundCreate = createAdSet.bind(null, campaignId);

  return (
    <div className="max-w-xl">
      <p className="text-sm text-foreground/60">{campaign.name}</p>
      <h1 className="text-2xl font-semibold">Create Ad Set</h1>
      <AdSetForm action={boundCreate} submitLabel="Save Ad Set" />
    </div>
  );
}

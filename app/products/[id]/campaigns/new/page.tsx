import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createCampaign } from "@/app/campaigns/actions";
import CampaignForm from "@/components/CampaignForm";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: productId } = await params;
  const supabase = getSupabaseServerClient();
  const { data: product } = await supabase
    .from("products")
    .select("id, name")
    .eq("id", productId)
    .single();

  if (!product) {
    notFound();
  }

  const boundCreate = createCampaign.bind(null, productId);

  return (
    <div className="max-w-xl">
      <p className="text-sm text-foreground/60">{product.name}</p>
      <h1 className="text-2xl font-semibold">Create Campaign</h1>
      <CampaignForm action={boundCreate} submitLabel="Save Campaign" />
    </div>
  );
}

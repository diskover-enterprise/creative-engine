import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { updateCampaign } from "../../actions";
import CampaignForm from "@/components/CampaignForm";
import type { Campaign } from "@/types";

export const dynamic = "force-dynamic";

export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from("campaigns").select("*").eq("id", id).single();

  if (!data) {
    notFound();
  }

  const campaign = data as Campaign;
  const boundUpdate = updateCampaign.bind(null, campaign.id);

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold">Edit Campaign</h1>
      <CampaignForm action={boundUpdate} campaign={campaign} submitLabel="Save Changes" />
    </div>
  );
}

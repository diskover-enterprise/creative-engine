import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { updateCampaign, deleteCampaignImage } from "../../actions";
import CampaignForm from "@/components/CampaignForm";
import type { Campaign } from "@/types";

export const dynamic = "force-dynamic";

type CampaignWithImages = Campaign & {
  campaign_images: { id: string; url: string; position: number }[];
};

export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("campaigns")
    .select("*, campaign_images(id, url, position)")
    .eq("id", id)
    .single();

  if (!data) {
    notFound();
  }

  const campaign = data as CampaignWithImages;
  const boundUpdate = updateCampaign.bind(null, campaign.id);
  const existingImages = [...campaign.campaign_images]
    .sort((a, b) => a.position - b.position)
    .map((image) => ({
      id: image.id,
      url: image.url,
      deleteAction: deleteCampaignImage.bind(null, image.id, campaign.id),
    }));

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold">Edit Campaign</h1>
      <CampaignForm
        action={boundUpdate}
        campaign={campaign}
        existingImages={existingImages}
        submitLabel="Save Changes"
      />
    </div>
  );
}

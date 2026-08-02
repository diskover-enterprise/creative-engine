import { createCampaign } from "../actions";
import CampaignForm from "@/components/CampaignForm";

export default function NewCampaignPage() {
  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold">Create Campaign</h1>
      <CampaignForm action={createCampaign} submitLabel="Save Campaign" />
    </div>
  );
}

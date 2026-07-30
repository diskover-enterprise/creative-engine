import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createConcept } from "@/app/concepts/actions";
import ConceptForm from "@/components/ConceptForm";

export const dynamic = "force-dynamic";

export default async function NewConceptPage({
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

  const boundCreate = createConcept.bind(null, campaignId);

  return (
    <div className="max-w-xl">
      <p className="text-sm text-foreground/60">{campaign.name}</p>
      <h1 className="text-2xl font-semibold">Create Concept</h1>
      <ConceptForm action={boundCreate} submitLabel="Save Concept" />
    </div>
  );
}

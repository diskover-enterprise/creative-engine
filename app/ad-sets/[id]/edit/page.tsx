import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { updateAdSet } from "../../actions";
import AdSetForm from "@/components/AdSetForm";
import type { AdSet } from "@/types";

export const dynamic = "force-dynamic";

export default async function EditAdSetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from("ad_sets").select("*").eq("id", id).single();

  if (!data) {
    notFound();
  }

  const adSet = data as AdSet;
  const boundUpdate = updateAdSet.bind(null, adSet.id);

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold">Edit Ad Set</h1>
      <AdSetForm action={boundUpdate} adSet={adSet} submitLabel="Save Changes" />
    </div>
  );
}

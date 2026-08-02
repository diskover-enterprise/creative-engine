import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { updateAd } from "../../actions";
import AdForm from "@/components/AdForm";
import type { Ad } from "@/types";

export const dynamic = "force-dynamic";

export default async function EditAdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from("ads").select("*").eq("id", id).single();

  if (!data) {
    notFound();
  }

  const ad = data as Ad;
  const boundUpdate = updateAd.bind(null, ad.id);

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold">Edit Ad</h1>
      <AdForm action={boundUpdate} ad={ad} submitLabel="Save Changes" />
    </div>
  );
}

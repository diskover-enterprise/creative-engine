import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { updateCreative } from "../../actions";
import CreativeForm from "@/components/CreativeForm";
import type { Creative } from "@/types";

export const dynamic = "force-dynamic";

export default async function EditCreativePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from("creatives").select("*").eq("id", id).single();

  if (!data) {
    notFound();
  }

  const creative = data as Creative;
  const boundUpdate = updateCreative.bind(null, creative.id);

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold">Edit Creative</h1>
      <CreativeForm action={boundUpdate} creative={creative} submitLabel="Save Changes" />
    </div>
  );
}

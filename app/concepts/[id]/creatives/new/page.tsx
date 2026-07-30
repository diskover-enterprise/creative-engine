import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createCreative } from "@/app/creatives/actions";
import CreativeForm from "@/components/CreativeForm";

export const dynamic = "force-dynamic";

export default async function NewCreativePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: conceptId } = await params;
  const supabase = getSupabaseServerClient();
  const { data: concept } = await supabase
    .from("concepts")
    .select("id, name")
    .eq("id", conceptId)
    .single();

  if (!concept) {
    notFound();
  }

  const boundCreate = createCreative.bind(null, conceptId);

  return (
    <div className="max-w-xl">
      <p className="text-sm text-foreground/60">{concept.name}</p>
      <h1 className="text-2xl font-semibold">Create Creative</h1>
      <CreativeForm action={boundCreate} submitLabel="Save Creative" />
    </div>
  );
}

import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { updateConcept } from "../../actions";
import ConceptForm from "@/components/ConceptForm";
import type { Concept } from "@/types";

export const dynamic = "force-dynamic";

export default async function EditConceptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from("concepts").select("*").eq("id", id).single();

  if (!data) {
    notFound();
  }

  const concept = data as Concept;
  const boundUpdate = updateConcept.bind(null, concept.id);

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold">Edit Concept</h1>
      <ConceptForm action={boundUpdate} concept={concept} submitLabel="Save Changes" />
    </div>
  );
}

import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { updateBrand } from "../../actions";
import BrandForm from "@/components/BrandForm";
import type { Brand } from "@/types";

export const dynamic = "force-dynamic";

export default async function EditBrandPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from("brands").select("*").eq("id", id).single();

  if (!data) {
    notFound();
  }

  const brand = data as Brand;
  const boundUpdate = updateBrand.bind(null, brand.id);

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold">Edit Brand</h1>
      <BrandForm action={boundUpdate} brand={brand} submitLabel="Save Changes" />
    </div>
  );
}

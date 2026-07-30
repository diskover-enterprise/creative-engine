import BrandForm from "@/components/BrandForm";
import { createBrand } from "../actions";

export default function NewBrandPage() {
  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold">Create Brand</h1>
      <BrandForm action={createBrand} submitLabel="Save Brand" />
    </div>
  );
}

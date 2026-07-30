"use client";

import { useActionState } from "react";
import FormField, { inputClass } from "@/components/FormField";
import { FormError, SubmitButton } from "@/components/FormStatus";
import type { Product } from "@/types";
import type { ActionState } from "@/app/products/actions";

type ExistingImage = {
  id: string;
  url: string;
  deleteAction: (formData: FormData) => Promise<void>;
};

export default function ProductForm({
  action,
  brands,
  product,
  existingImages,
  submitLabel,
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  brands: { id: string; name: string }[];
  product?: Product;
  existingImages?: ExistingImage[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      {state?.error ? <FormError message={state.error} /> : null}

      <FormField label="Brand">
        <select name="brand_id" required defaultValue={product?.brand_id} className={inputClass}>
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Product Name">
        <input name="name" required defaultValue={product?.name} className={inputClass} />
      </FormField>

      <FormField label="Product Description">
        <textarea
          name="description"
          rows={3}
          defaultValue={product?.description ?? ""}
          className={inputClass}
        />
      </FormField>

      <FormField label="Landing Page URL">
        <input
          type="url"
          name="landing_page_url"
          defaultValue={product?.landing_page_url ?? ""}
          className={inputClass}
        />
      </FormField>

      <FormField label="Target Audience">
        <textarea
          name="audience"
          rows={2}
          defaultValue={product?.audience ?? ""}
          className={inputClass}
        />
      </FormField>

      <FormField label="Benefits">
        <textarea
          name="benefits"
          rows={2}
          defaultValue={product?.benefits ?? ""}
          className={inputClass}
        />
      </FormField>

      <FormField label="Offer">
        <input name="offer" defaultValue={product?.offer ?? ""} className={inputClass} />
      </FormField>

      {existingImages && existingImages.length > 0 ? (
        <div>
          <p className="text-sm font-medium">Current Images</p>
          <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-4">
            {existingImages.map((image) => (
              <div key={image.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt=""
                  className="aspect-square rounded-md object-cover"
                />
                <form action={image.deleteAction} className="mt-1">
                  <button
                    type="submit"
                    className="w-full rounded-md border border-red-500/30 px-2 py-1 text-xs text-red-600 dark:text-red-400"
                  >
                    Remove
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <FormField
        label={existingImages && existingImages.length > 0 ? "Add More Images" : "Product Images"}
      >
        <input type="file" name="images" accept="image/*" multiple className={inputClass} />
      </FormField>

      <SubmitButton pending={pending} label={submitLabel} />
    </form>
  );
}

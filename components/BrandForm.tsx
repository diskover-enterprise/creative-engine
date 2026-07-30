"use client";

import { useActionState } from "react";
import FormField, { inputClass } from "@/components/FormField";
import { FormError, SubmitButton } from "@/components/FormStatus";
import type { Brand } from "@/types";
import type { ActionState } from "@/app/brands/actions";

export default function BrandForm({
  action,
  brand,
  submitLabel,
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  brand?: Brand;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      {state?.error ? <FormError message={state.error} /> : null}

      <FormField label="Brand Name">
        <input name="name" required defaultValue={brand?.name} className={inputClass} />
      </FormField>

      <FormField label="Description">
        <textarea
          name="description"
          rows={3}
          defaultValue={brand?.description ?? ""}
          className={inputClass}
        />
      </FormField>

      <FormField label="Brand Voice">
        <textarea
          name="brand_voice"
          rows={2}
          defaultValue={brand?.brand_voice ?? ""}
          className={inputClass}
        />
      </FormField>

      <FormField label="Visual Style">
        <textarea
          name="visual_style"
          rows={2}
          defaultValue={brand?.visual_style ?? ""}
          className={inputClass}
        />
      </FormField>

      {brand?.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logo_url} alt="" className="h-16 w-16 rounded object-cover" />
      ) : null}

      <FormField label={brand?.logo_url ? "Replace Logo" : "Logo"}>
        <input type="file" name="logo" accept="image/*" className={inputClass} />
      </FormField>

      <SubmitButton pending={pending} label={submitLabel} />
    </form>
  );
}

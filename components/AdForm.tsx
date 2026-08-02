"use client";

import { useActionState } from "react";
import FormField, { inputClass } from "@/components/FormField";
import { FormError, SubmitButton } from "@/components/FormStatus";
import type { Ad } from "@/types";
import type { ActionState } from "@/app/ads/actions";

export default function AdForm({
  action,
  ad,
  submitLabel,
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  ad?: Ad;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      {state?.error ? <FormError message={state.error} /> : null}

      <FormField label="Label">
        <input
          name="label"
          defaultValue={ad?.label ?? ""}
          placeholder="e.g. Version 1, Hero shot"
          className={inputClass}
        />
      </FormField>

      <FormField label="Type">
        <select name="type" defaultValue={ad?.type ?? "image"} className={inputClass}>
          <option value="image">Image</option>
          <option value="video">Video</option>
        </select>
      </FormField>

      <FormField label="Status">
        <select name="status" defaultValue={ad?.status ?? "draft"} className={inputClass}>
          <option value="draft">Draft</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </FormField>

      <FormField label="Notes">
        <textarea name="notes" rows={2} defaultValue={ad?.notes ?? ""} className={inputClass} />
      </FormField>

      {ad?.asset_url ? (
        <div>
          <p className="mb-1 text-sm font-medium">Current Asset</p>
          {ad.type === "video" ? (
            <video src={ad.asset_url} controls className="max-h-64 rounded-md" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ad.asset_url} alt="" className="max-h-64 rounded-md object-cover" />
          )}
        </div>
      ) : null}

      <FormField label={ad?.asset_url ? "Replace Asset" : "Asset (image or video)"}>
        <input type="file" name="asset" accept="image/*,video/*" className={inputClass} />
      </FormField>

      <SubmitButton pending={pending} label={submitLabel} />
    </form>
  );
}

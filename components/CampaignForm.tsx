"use client";

import { useActionState } from "react";
import FormField, { inputClass } from "@/components/FormField";
import { FormError, SubmitButton } from "@/components/FormStatus";
import type { Campaign } from "@/types";
import type { ActionState } from "@/app/campaigns/actions";

type ExistingImage = {
  id: string;
  url: string;
  deleteAction: (formData: FormData) => Promise<void>;
};

export default function CampaignForm({
  action,
  campaign,
  existingImages,
  submitLabel,
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  campaign?: Campaign;
  existingImages?: ExistingImage[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      {state?.error ? <FormError message={state.error} /> : null}

      <FormField label="Campaign Name">
        <input name="name" required defaultValue={campaign?.name} className={inputClass} />
      </FormField>

      <FormField label="Description">
        <textarea
          name="description"
          rows={3}
          defaultValue={campaign?.description ?? ""}
          className={inputClass}
        />
      </FormField>

      <FormField label="Brand Voice">
        <textarea
          name="brand_voice"
          rows={2}
          defaultValue={campaign?.brand_voice ?? ""}
          className={inputClass}
        />
      </FormField>

      <FormField label="Visual Style">
        <textarea
          name="visual_style"
          rows={2}
          defaultValue={campaign?.visual_style ?? ""}
          className={inputClass}
        />
      </FormField>

      {campaign?.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={campaign.logo_url} alt="" className="h-16 w-16 rounded object-cover" />
      ) : null}

      <FormField label={campaign?.logo_url ? "Replace Logo" : "Logo"}>
        <input type="file" name="logo" accept="image/*" className={inputClass} />
      </FormField>

      <FormField label="Landing Page URL">
        <input
          type="url"
          name="landing_page_url"
          defaultValue={campaign?.landing_page_url ?? ""}
          className={inputClass}
        />
      </FormField>

      <FormField label="Target Audience">
        <textarea
          name="audience"
          rows={2}
          defaultValue={campaign?.audience ?? ""}
          className={inputClass}
        />
      </FormField>

      <FormField label="Benefits">
        <textarea
          name="benefits"
          rows={2}
          defaultValue={campaign?.benefits ?? ""}
          className={inputClass}
        />
      </FormField>

      <FormField label="Offer">
        <input name="offer" defaultValue={campaign?.offer ?? ""} className={inputClass} />
      </FormField>

      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="auto_generate"
          defaultChecked={campaign?.auto_generate ?? false}
        />
        Enable automated ad set + ad generation for this campaign
      </label>

      <FormField label="Objective">
        <input
          name="objective"
          defaultValue={campaign?.objective ?? ""}
          placeholder="e.g. Awareness, Conversion, Launch"
          className={inputClass}
        />
      </FormField>

      <FormField label="Status">
        <select name="status" defaultValue={campaign?.status ?? "draft"} className={inputClass}>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
        </select>
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Start Date">
          <input
            type="date"
            name="start_date"
            defaultValue={campaign?.start_date ?? ""}
            className={inputClass}
          />
        </FormField>
        <FormField label="End Date">
          <input
            type="date"
            name="end_date"
            defaultValue={campaign?.end_date ?? ""}
            className={inputClass}
          />
        </FormField>
      </div>

      <FormField label="Notes">
        <textarea name="notes" rows={3} defaultValue={campaign?.notes ?? ""} className={inputClass} />
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
        label={existingImages && existingImages.length > 0 ? "Add More Images" : "Campaign Images"}
      >
        <input type="file" name="images" accept="image/*" multiple className={inputClass} />
      </FormField>

      <SubmitButton pending={pending} label={submitLabel} />
    </form>
  );
}

"use client";

import { useActionState } from "react";
import FormField, { inputClass } from "@/components/FormField";
import { FormError, SubmitButton } from "@/components/FormStatus";
import type { Campaign } from "@/types";
import type { ActionState } from "@/app/campaigns/actions";

export default function CampaignForm({
  action,
  campaign,
  submitLabel,
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  campaign?: Campaign;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      {state?.error ? <FormError message={state.error} /> : null}

      <FormField label="Campaign Name">
        <input name="name" required defaultValue={campaign?.name} className={inputClass} />
      </FormField>

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

      <SubmitButton pending={pending} label={submitLabel} />
    </form>
  );
}

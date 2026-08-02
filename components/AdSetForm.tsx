"use client";

import { useActionState } from "react";
import FormField, { inputClass } from "@/components/FormField";
import { FormError, SubmitButton } from "@/components/FormStatus";
import type { AdSet } from "@/types";
import type { ActionState } from "@/app/ad-sets/actions";

const ASPECT_RATIOS = ["1:1", "4:5", "9:16", "16:9"];

export default function AdSetForm({
  action,
  adSet,
  submitLabel,
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  adSet?: AdSet;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      {state?.error ? <FormError message={state.error} /> : null}

      <FormField label="Ad Set Name">
        <input name="name" required defaultValue={adSet?.name} className={inputClass} />
      </FormField>

      <FormField label="Messaging Angle">
        <textarea
          name="messaging_angle"
          rows={2}
          defaultValue={adSet?.messaging_angle ?? ""}
          placeholder="The core idea or hook this ad set is built around"
          className={inputClass}
        />
      </FormField>

      <FormField label="Target Emotion">
        <input
          name="target_emotion"
          defaultValue={adSet?.target_emotion ?? ""}
          placeholder="e.g. Trust, Excitement, Urgency, Relief"
          className={inputClass}
        />
      </FormField>

      <FormField label="Visual Style Override">
        <textarea
          name="visual_style_override"
          rows={2}
          defaultValue={adSet?.visual_style_override ?? ""}
          placeholder="Leave blank to use the campaign's visual style"
          className={inputClass}
        />
      </FormField>

      <FormField label="Tone Override">
        <textarea
          name="tone_override"
          rows={2}
          defaultValue={adSet?.tone_override ?? ""}
          placeholder="Leave blank to use the campaign's voice"
          className={inputClass}
        />
      </FormField>

      <FormField label="Setting / Scene">
        <textarea
          name="setting_scene"
          rows={2}
          defaultValue={adSet?.setting_scene ?? ""}
          placeholder="Where/how the product is shown"
          className={inputClass}
        />
      </FormField>

      <FormField label="Key Message">
        <textarea
          name="key_message"
          rows={2}
          defaultValue={adSet?.key_message ?? ""}
          placeholder="Leave blank to use the campaign's benefits"
          className={inputClass}
        />
      </FormField>

      <FormField label="Call To Action">
        <input
          name="call_to_action"
          defaultValue={adSet?.call_to_action ?? ""}
          placeholder="e.g. Shop Now, Get 20% Off"
          className={inputClass}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Format">
          <select name="format" defaultValue={adSet?.format ?? "static_image"} className={inputClass}>
            <option value="static_image">Static Image</option>
            <option value="video">Video</option>
          </select>
        </FormField>

        <FormField label="Aspect Ratio">
          <select
            name="aspect_ratio"
            defaultValue={adSet?.aspect_ratio ?? "1:1"}
            className={inputClass}
          >
            {ASPECT_RATIOS.map((ratio) => (
              <option key={ratio} value={ratio}>
                {ratio}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <SubmitButton pending={pending} label={submitLabel} pendingLabel="Generating prompt..." />
    </form>
  );
}

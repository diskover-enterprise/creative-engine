"use client";

import { useActionState } from "react";
import FormField, { inputClass } from "@/components/FormField";
import { FormError, SubmitButton } from "@/components/FormStatus";
import type { Concept } from "@/types";
import type { ActionState } from "@/app/concepts/actions";

const ASPECT_RATIOS = ["1:1", "4:5", "9:16", "16:9"];

export default function ConceptForm({
  action,
  concept,
  submitLabel,
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  concept?: Concept;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      {state?.error ? <FormError message={state.error} /> : null}

      <FormField label="Concept Name">
        <input name="name" required defaultValue={concept?.name} className={inputClass} />
      </FormField>

      <FormField label="Messaging Angle">
        <textarea
          name="messaging_angle"
          rows={2}
          defaultValue={concept?.messaging_angle ?? ""}
          placeholder="The core idea or hook this concept is built around"
          className={inputClass}
        />
      </FormField>

      <FormField label="Target Emotion">
        <input
          name="target_emotion"
          defaultValue={concept?.target_emotion ?? ""}
          placeholder="e.g. Trust, Excitement, Urgency, Relief"
          className={inputClass}
        />
      </FormField>

      <FormField label="Visual Style Override">
        <textarea
          name="visual_style_override"
          rows={2}
          defaultValue={concept?.visual_style_override ?? ""}
          placeholder="Leave blank to use the brand's visual style"
          className={inputClass}
        />
      </FormField>

      <FormField label="Tone Override">
        <textarea
          name="tone_override"
          rows={2}
          defaultValue={concept?.tone_override ?? ""}
          placeholder="Leave blank to use the brand's voice"
          className={inputClass}
        />
      </FormField>

      <FormField label="Setting / Scene">
        <textarea
          name="setting_scene"
          rows={2}
          defaultValue={concept?.setting_scene ?? ""}
          placeholder="Where/how the product is shown"
          className={inputClass}
        />
      </FormField>

      <FormField label="Key Message">
        <textarea
          name="key_message"
          rows={2}
          defaultValue={concept?.key_message ?? ""}
          placeholder="Leave blank to use the product's benefits"
          className={inputClass}
        />
      </FormField>

      <FormField label="Call To Action">
        <input
          name="call_to_action"
          defaultValue={concept?.call_to_action ?? ""}
          placeholder="e.g. Shop Now, Get 20% Off"
          className={inputClass}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Format">
          <select name="format" defaultValue={concept?.format ?? "static_image"} className={inputClass}>
            <option value="static_image">Static Image</option>
            <option value="video">Video</option>
          </select>
        </FormField>

        <FormField label="Aspect Ratio">
          <select
            name="aspect_ratio"
            defaultValue={concept?.aspect_ratio ?? "1:1"}
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

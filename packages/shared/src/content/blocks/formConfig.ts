import { z } from "zod";
import { LocalizedText } from "../primitives";

const formField = z.object({
  label: LocalizedText,
  placeholder: LocalizedText.optional(),
  required: z.boolean().default(false),
});

/** Quote/contact form copy (dict.form). Runtime payloads are operational-only (not snapshotted). */
export const formConfigBlock = z.object({
  fields: z.object({
    name: formField,
    email: formField,
    phone: formField,
    quantity: formField,
    standard: formField,
    height: formField,
    width: formField,
    thickness: formField,
    upload: formField,
    message: formField,
  }),
  uploadHelp: LocalizedText,
  standardOptions: z
    .array(z.object({ value: z.string(), label: LocalizedText }))
    .min(1),
  submit: LocalizedText,
  // submitting OPTIONAL: the in-flight submit label (Webflow `data-wait`, shown while the form
  // posts). The web falls back to "Please wait…" / "Vui lòng đợi…" when absent, so the published
  // v1 snapshot (which predates this field) stays valid — no re-publish. Editable as `formConfig.submitting`.
  submitting: LocalizedText.optional(),
  success: LocalizedText,
  fail: LocalizedText,
});
export type FormConfigBlock = z.infer<typeof formConfigBlock>;

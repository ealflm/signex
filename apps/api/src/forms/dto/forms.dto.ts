import { z } from '@signex/shared';

// Single unified lead form. (Historically split into 'quote' / 'contact'; the
// public site now posts every submission as 'contact'.) Existing rows with the
// old 'quote' key stay readable — the column is a free string, not an enum.
export const VALID_FORM_KEYS = ['contact'] as const;
export type FormKey = (typeof VALID_FORM_KEYS)[number];

/** Permissive submit schema — requires name + email (contactable), rest optional */
export const submitSchema = z.object({
  name: z.string().min(1, 'name is required').max(200),
  email: z.string().email('valid email required').max(254),
  phone: z.string().max(50).optional(),
  message: z.string().max(5000).optional(),
  company: z.string().max(200).optional(),
  subject: z.string().max(300).optional(),
});

export type SubmitInput = z.infer<typeof submitSchema>;

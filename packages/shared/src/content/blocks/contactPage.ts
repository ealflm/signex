import { z } from "zod";
import { LocalizedText, TwoToneTitle, AssetRef } from "../primitives";

/** The /contact page copy (dict.contactPage). NAP cards come from businessContact. */
export const contactPageBlock = z.object({
  // eyebrow OPTIONAL: the home contact section's eyebrow ("Reach Out"/"Liên Hệ"). The web falls back
  // to the literal when absent, so the published v1 snapshot (which predates this field) stays valid —
  // no re-publish required. Editable via the visual editor as `contactPage.eyebrow`.
  eyebrow: LocalizedText.optional(),
  // cardLabels OPTIONAL: titles of the Email/Phone/Address NAP cards, shared by BOTH the home contact
  // section and the contact page. Each is OPTIONAL; the web falls back to "Email"/"Phone"/"Address"
  // when absent (published v1 snapshot stays valid). Editable as `contactPage.cardLabels.<key>`.
  cardLabels: z
    .object({
      email: LocalizedText.optional(),
      phone: LocalizedText.optional(),
      address: LocalizedText.optional(),
    })
    .optional(),
  // hero.image OPTIONAL: the web falls back to the literal sara-dubler still when absent, so the
  // published v1 snapshot (which predates this field) stays valid — no re-publish required. This is
  // the contact-c hero's parallax image; the visual editor edits it as `contactPage.hero.image`.
  hero: z.object({ title: TwoToneTitle, subtitle: LocalizedText, image: AssetRef.optional() }),
  map: z.object({ eyebrow: LocalizedText, title: TwoToneTitle }),
});
export type ContactPageBlock = z.infer<typeof contactPageBlock>;

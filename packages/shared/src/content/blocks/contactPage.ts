import { z } from "zod";
import { LocalizedText, TwoToneTitle, MediaRef, Overlay } from "../primitives";

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
  // hero.eyebrow OPTIONAL: the contact-c hero's small label (was a hardcoded "Contact"). The web falls
  // back to "Contact" when absent, so the published v1 snapshot stays valid. Editable as
  // `contactPage.hero.eyebrow`.
  // hero.image OPTIONAL + FLEXIBLE (image OR video, like the home/about heroes): the web falls back
  // to the literal sara-dubler still when absent, so the published v1 snapshot (which predates this
  // field) stays valid — no re-publish required. A previously stored AssetRef parses unchanged
  // (MediaRef discriminates structurally on mp4AssetId). hero.overlay: the configurable scrim over
  // the hero media (absent = transparent). Edited as `contactPage.hero.image` / `.overlay`.
  hero: z.object({
    eyebrow: LocalizedText.optional(),
    title: TwoToneTitle,
    subtitle: LocalizedText,
    image: MediaRef.optional(),
    overlay: Overlay.optional(),
  }),
  map: z.object({ eyebrow: LocalizedText, title: TwoToneTitle }),
});
export type ContactPageBlock = z.infer<typeof contactPageBlock>;

import { z } from "zod";
import { LocalizedText, TwoToneTitle, AssetRef } from "../primitives";

/** The /contact page copy (dict.contactPage). NAP cards come from businessContact. */
export const contactPageBlock = z.object({
  // hero.image OPTIONAL: the web falls back to the literal sara-dubler still when absent, so the
  // published v1 snapshot (which predates this field) stays valid — no re-publish required. This is
  // the contact-c hero's parallax image; the visual editor edits it as `contactPage.hero.image`.
  hero: z.object({ title: TwoToneTitle, subtitle: LocalizedText, image: AssetRef.optional() }),
  map: z.object({ eyebrow: LocalizedText, title: TwoToneTitle }),
});
export type ContactPageBlock = z.infer<typeof contactPageBlock>;

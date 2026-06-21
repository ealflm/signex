import { z } from "zod";
import { LocalizedText, Href, AssetRef } from "../primitives";

/** Primary navigation (dict.nav) + the logo asset (promoted from a hardcoded /assets path). */
export const navBlock = z.object({
  skip: LocalizedText,
  logo: AssetRef,
  cta: z.object({ label: LocalizedText, href: Href }),
  links: z.array(z.object({ label: LocalizedText, href: Href })).min(1),
});
export type NavBlock = z.infer<typeof navBlock>;

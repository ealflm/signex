// app/[lang]/dictionaries.ts
// LEGACY SHIM. The site now reads CMS Release snapshots (app/lib/content.ts), not the static
// en/vi JSON. `Dictionary` is aliased to the resolved snapshot view `SiteContent` (a structural
// superset of the old dict), so every ({ dict }) => JSX component compiles unchanged. The dict
// JSON files remain only as the importer's source (migrated once into Release v1).
import "server-only";
import type { Locale } from "@/app/lib/i18n-config";
import { getSiteContent, type SiteContent } from "@/app/lib/content";

export type Dictionary = SiteContent;

// Back-compat alias for any caller still importing getDictionary; routes to the published path.
export const getDictionary = (locale: Locale): Promise<Dictionary> => getSiteContent(locale);

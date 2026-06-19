// app/[lang]/dictionaries.ts
// Server-only dictionary loader (the idiomatic App Router i18n pattern). Translation
// JSON never ships to the client bundle — only the resolved strings are server-rendered.
import "server-only";
import type { Locale } from "@/app/lib/i18n-config";

const dictionaries = {
  en: () => import("./dictionaries/en.json").then((m) => m.default),
  vi: () => import("./dictionaries/vi.json").then((m) => m.default),
};

export type Dictionary = Awaited<ReturnType<(typeof dictionaries)["en"]>>;

export const getDictionary = (locale: Locale): Promise<Dictionary> =>
  dictionaries[locale]();

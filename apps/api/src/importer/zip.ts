export interface LT {
  en: string;
  vi: string;
}

export function lt(en: string, vi: string): LT {
  return { en, vi };
}

export function ltArray(
  en: string[],
  vi: string[],
): { en: string[]; vi: string[] } {
  return { en: [...en], vi: [...vi] };
}

export function twoTone(
  leadEn: string,
  leadVi: string,
  accentEn: string,
  accentVi: string,
): { lead: LT; accent: LT } {
  return { lead: lt(leadEn, leadVi), accent: lt(accentEn, accentVi) };
}

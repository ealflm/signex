import { z, LocalizedText } from '@signex/shared';
import type { AssetKind } from '@signex/db';

const MB = 1024 * 1024;

export const MIME_ALLOWLIST: Record<
  string,
  { kind: AssetKind; maxBytes: number }
> = {
  'image/png': { kind: 'IMAGE', maxBytes: 15 * MB },
  'image/jpeg': { kind: 'IMAGE', maxBytes: 15 * MB },
  'image/webp': { kind: 'IMAGE', maxBytes: 15 * MB },
  'image/gif': { kind: 'IMAGE', maxBytes: 15 * MB },
  'image/avif': { kind: 'IMAGE', maxBytes: 15 * MB },
  'image/svg+xml': { kind: 'SVG', maxBytes: 2 * MB },
  'video/mp4': { kind: 'VIDEO', maxBytes: 200 * MB },
  'video/webm': { kind: 'VIDEO', maxBytes: 200 * MB },
};

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

export function kindForMime(mime: string): AssetKind {
  const entry = MIME_ALLOWLIST[mime];
  if (!entry) {
    throw new Error(`Unsupported mime ${mime}`);
  }
  return entry.kind;
}

export function extForMime(mime: string): string {
  const ext = EXT_BY_MIME[mime];
  if (!ext) {
    throw new Error(`Unsupported mime ${mime}`);
  }
  return ext;
}

// Match diacritic marks in the NFD decomposition range
const DIACRITICS = /[̀-ͯ]/g;

export function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'asset';
}

export function keyFor(sha256: string, slug: string, ext: string): string {
  return `originals/${sha256.slice(0, 32)}/${slug}.${ext}`;
}

/**
 * Derives a deterministic CUID-shaped Asset ID from a sha256 hex string.
 * Format: 'c' + first 24 hex chars of sha256 = 25 chars total, all [a-z0-9].
 * Satisfies z.string().cuid() so AssetRef.assetId validation passes.
 * Same sha256 → same id (content-addressed, fully reproducible).
 */
export function assetIdFromSha256(sha256: string): string {
  return 'c' + sha256.slice(0, 24).toLowerCase();
}

const sha256Field = z
  .string()
  .regex(/^[0-9a-f]{64}$/i, 'sha256 must be 64 hex chars');
const mimeField = z
  .string()
  .refine((m) => m in MIME_ALLOWLIST, { message: 'mime not in allowlist' });

export const presignSchema = z
  .object({
    mime: mimeField,
    bytes: z.number().int().positive(),
    sha256: sha256Field,
    originalName: z.string().min(1).max(255),
    altDefault: LocalizedText.optional(),
  })
  .superRefine((val, ctx) => {
    const cap = MIME_ALLOWLIST[val.mime]?.maxBytes;
    if (cap !== undefined && val.bytes > cap) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `file size ${val.bytes} exceeds size cap ${cap} for ${val.mime}`,
        path: ['bytes'],
      });
    }
  });

export const confirmSchema = z.object({
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export const replaceSchema = presignSchema;

export const altSchema = z.object({ alt: LocalizedText });

export type PresignInput = z.infer<typeof presignSchema>;
export type ConfirmInput = z.infer<typeof confirmSchema>;
export type ReplaceInput = z.infer<typeof replaceSchema>;
export type AltInput = z.infer<typeof altSchema>;

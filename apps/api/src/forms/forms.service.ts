import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AssetsService } from '../assets/assets.service';
import { MIME_ALLOWLIST } from '../assets/dto/assets.dto';
import { SYSTEM_USER_ID } from '../auth/seed-config';
import {
  VALID_FORM_KEYS,
  type FormKey,
  type SubmitInput,
} from './dto/forms.dto';

/** File upload size cap for form attachments (50 MB). Exported so the multer
 *  interceptor can share the same constant and they can never drift. */
export const UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

/** Anti-spam window: a submission is treated as a repeat (and flagged) when an
 *  identical payload, or a burst from the same IP, lands inside this window. */
const DEDUPE_WINDOW_MS = 10 * 60 * 1000;
/** Max submissions from one IP inside the window before the rest are flagged. */
const IP_BURST_LIMIT = 6;

/** Stable JSON (sorted keys) so the same content hashes identically. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const body = Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',');
  return `{${body}}`;
}

/** Content fingerprint for a submission — form + normalized payload. */
function fingerprint(formKey: string, payload: unknown): string {
  return createHash('sha256')
    .update(`${formKey}|${stableStringify(payload)}`)
    .digest('hex');
}

/** MIME types accepted on the forms upload field: images (incl. SVG) + PDF.
 *  Video types in MIME_ALLOWLIST are NOT accepted here. */
export const FORMS_ACCEPTED_MIMES = new Set([
  ...Object.keys(MIME_ALLOWLIST).filter((m) => m.startsWith('image/')),
  'application/pdf',
]);

/** Resolved attachment metadata — public URL + display name, never raw bytes. */
export interface PublicUpload {
  assetId: string;
  url: string;
  originalName: string;
  mime: string;
}

/** Public shape returned by the list/detail endpoints — no raw upload bytes,
 *  no internal asset fields beyond the safe public projection. */
export interface PublicSubmission {
  id: string;
  formKey: string;
  status: string;
  payload: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
  upload: PublicUpload | null;
}

export interface ListOptions {
  status?: 'NEW' | 'READ' | 'ARCHIVED';
  /** `true` = only flagged spam; otherwise the inbox excludes flagged rows. */
  spam?: boolean;
  take?: number;
  skip?: number;
  /** createdAt sort direction. Defaults to 'desc' (newest first). */
  order?: 'asc' | 'desc';
}

export interface ListResult {
  items: PublicSubmission[];
  total: number;
}

export interface SummaryResult {
  total: number;
  new: number;
  read: number;
  archived: number;
  /** Flagged spam/duplicate count (excluded from the figures above). */
  spam: number;
  series: Array<{ date: string; count: number }>;
}

/** Build a YYYY-MM-DD string from a Date (UTC). */
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class FormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: AssetsService,
  ) {}

  async submit(
    formKey: string,
    payload: SubmitInput,
    file: Express.Multer.File | null,
    ip: string | null,
    userAgent: string | null,
  ): Promise<{ ok: true }> {
    // 1. Validate formKey
    if (!(VALID_FORM_KEYS as readonly string[]).includes(formKey)) {
      throw new NotFoundException(`Unknown form: ${formKey}`);
    }

    // 2. Handle optional file upload
    let uploadAssetId: string | null = null;
    if (file) {
      if (!FORMS_ACCEPTED_MIMES.has(file.mimetype)) {
        throw new BadRequestException(
          `File type ${file.mimetype} is not accepted; images or PDF only`,
        );
      }
      if (file.buffer.length > UPLOAD_MAX_BYTES) {
        throw new BadRequestException(
          `File too large (max ${UPLOAD_MAX_BYTES} bytes)`,
        );
      }
      const assetDto = await this.assets.register(
        { id: SYSTEM_USER_ID, role: 'ADMIN' },
        {
          bytes: file.buffer,
          mime: file.mimetype,
          originalName: file.originalname,
        },
        // Forms allow a larger attachment than the CMS media library's per-mime
        // caps (e.g. 50 MB images/PDF), so lift the cap for this trusted path.
        { maxBytes: UPLOAD_MAX_BYTES },
      );
      uploadAssetId = assetDto.id;
    }

    // 3. Anti-spam: flag (don't reject) a repeat — identical content, or a burst
    //    from the same IP, inside the window. Flagged rows stay out of the inbox
    //    and are bulk-clearable; the submitter still gets a normal success.
    const flagged = await this.isSpam(formKey, payload, ip);

    // 4. Persist the submission. The attribution ids are pulled into their own
    //    columns (not duplicated inside the payload JSON blob) so the analytics
    //    read-model can join leads back to sessions/visitors.
    const { sessionId, visitorId, ...rest } = payload;
    await this.prisma.client.formSubmission.create({
      data: {
        formKey: formKey as FormKey,
        payload: rest as object,
        uploadAssetId,
        ip,
        userAgent,
        flagged,
        sessionId: sessionId ?? null,
        visitorId: visitorId ?? null,
      },
    });

    // 5. Attribute the lead: flip the matching analytics session to converted.
    //    updateMany so a missing/expired session id is a silent no-op, never a
    //    throw — attribution is best-effort and must never fail the submit.
    if (sessionId) {
      await this.prisma.client.analyticsSession
        .updateMany({ where: { id: sessionId }, data: { converted: true } })
        .catch(() => undefined);
    }

    return { ok: true };
  }

  /** True when this submission repeats recent content or floods from one IP. */
  private async isSpam(
    formKey: string,
    payload: SubmitInput,
    ip: string | null,
  ): Promise<boolean> {
    const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
    const recent = await this.prisma.client.formSubmission.findMany({
      where: { formKey, createdAt: { gte: since } },
      select: { payload: true, ip: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const fp = fingerprint(formKey, payload);
    const duplicate = recent.some(
      (r) => fingerprint(formKey, r.payload) === fp,
    );
    if (duplicate) return true;

    if (ip) {
      const fromIp = recent.filter((r) => r.ip === ip).length;
      if (fromIp >= IP_BURST_LIMIT) return true;
    }
    return false;
  }

  /**
   * Resolve a batch of uploadAssetIds to their public attachment metadata in ONE
   * query (no N+1). Returns a Map keyed by assetId; missing/soft-deleted assets are
   * simply absent (the caller maps those to `upload: null`). Only the safe public
   * projection is selected — never raw bytes or other internal columns.
   */
  private async resolveUploads(
    assetIds: string[],
  ): Promise<Map<string, PublicUpload>> {
    const unique = [...new Set(assetIds)];
    if (unique.length === 0) return new Map();
    const assets = await this.prisma.client.asset.findMany({
      where: { id: { in: unique } },
      select: { id: true, r2Key: true, originalName: true, mime: true },
    });
    return new Map(
      assets.map((a) => [
        a.id,
        {
          assetId: a.id,
          url: this.assets.publicUrl(a.r2Key),
          originalName: a.originalName,
          mime: a.mime,
        },
      ]),
    );
  }

  /** Map a raw row + resolved-upload map → the public submission shape. */
  private toPublic(
    row: {
      id: string;
      formKey: string;
      status: string;
      payload: unknown;
      ip: string | null;
      userAgent: string | null;
      createdAt: Date;
      uploadAssetId: string | null;
    },
    uploads: Map<string, PublicUpload>,
  ): PublicSubmission {
    return {
      id: row.id,
      formKey: row.formKey,
      status: row.status,
      payload: row.payload,
      ip: row.ip,
      userAgent: row.userAgent,
      createdAt: row.createdAt,
      upload: row.uploadAssetId
        ? (uploads.get(row.uploadAssetId) ?? null)
        : null,
    };
  }

  async list(opts: ListOptions = {}): Promise<ListResult> {
    const take = Math.min(opts.take ?? 20, 200);
    const skip = opts.skip ?? 0;

    const order = opts.order === 'asc' ? 'asc' : 'desc';

    // Spam is segregated: the inbox excludes flagged rows; the Spam view shows
    // only them.
    const where: Record<string, unknown> = { flagged: opts.spam === true };
    if (opts.status) where.status = opts.status;

    const [rows, total] = await Promise.all([
      this.prisma.client.formSubmission.findMany({
        where,
        orderBy: { createdAt: order },
        take,
        skip,
      }),
      this.prisma.client.formSubmission.count({ where }),
    ]);

    const uploads = await this.resolveUploads(
      rows.map((r) => r.uploadAssetId).filter((x): x is string => x != null),
    );
    const items = rows.map((r) => this.toPublic(r, uploads));

    return { items, total };
  }

  /** GET one submission by id (EDITOR+) — used by the inbox detail view. */
  async get(id: string): Promise<PublicSubmission> {
    const row = await this.prisma.client.formSubmission.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException(`Submission not found: ${id}`);
    const uploads = await this.resolveUploads(
      row.uploadAssetId ? [row.uploadAssetId] : [],
    );
    return this.toPublic(row, uploads);
  }

  async summary(): Promise<SummaryResult> {
    // Fetch all submissions from last 90 days for series + counts
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // The headline figures count real leads only — flagged spam is excluded and
    // reported separately.
    const [total, newCount, readCount, archivedCount, spamCount, recent] =
      await Promise.all([
        this.prisma.client.formSubmission.count({ where: { flagged: false } }),
        this.prisma.client.formSubmission.count({
          where: { flagged: false, status: 'NEW' },
        }),
        this.prisma.client.formSubmission.count({
          where: { flagged: false, status: 'READ' },
        }),
        this.prisma.client.formSubmission.count({
          where: { flagged: false, status: 'ARCHIVED' },
        }),
        this.prisma.client.formSubmission.count({ where: { flagged: true } }),
        this.prisma.client.formSubmission.findMany({
          where: { flagged: false, createdAt: { gte: since } },
          select: { createdAt: true },
          orderBy: { createdAt: 'asc' },
        }),
      ]);

    // Build a day-keyed map (UTC dates) and fill zeroes
    const dayMap = new Map<string, number>();
    // Pre-fill all 90 days with 0
    for (let i = 89; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      dayMap.set(toDateStr(d), 0);
    }
    for (const row of recent) {
      const key = toDateStr(row.createdAt);
      if (dayMap.has(key)) {
        dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
      }
    }

    const series = Array.from(dayMap.entries()).map(([date, count]) => ({
      date,
      count,
    }));

    return {
      total,
      new: newCount,
      read: readCount,
      archived: archivedCount,
      spam: spamCount,
      series,
    };
  }

  /** Hard-delete all flagged spam. Returns how many rows were removed. */
  async clearSpam(): Promise<{ deleted: number }> {
    const { count } = await this.prisma.client.formSubmission.deleteMany({
      where: { flagged: true },
    });
    return { deleted: count };
  }

  async setStatus(
    id: string,
    status: 'NEW' | 'READ' | 'ARCHIVED',
  ): Promise<PublicSubmission> {
    const row = await this.prisma.client.formSubmission.update({
      where: { id },
      data: { status },
    });
    const uploads = await this.resolveUploads(
      row.uploadAssetId ? [row.uploadAssetId] : [],
    );
    return this.toPublic(row, uploads);
  }
}

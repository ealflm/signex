import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssetsService } from '../assets/assets.service';
import { MIME_ALLOWLIST } from '../assets/dto/assets.dto';
import { SYSTEM_USER_ID } from '../auth/seed-config';
import {
  VALID_FORM_KEYS,
  type FormKey,
  type SubmitInput,
} from './dto/forms.dto';

/** File upload size cap for form attachments (10 MB). Exported so the multer
 *  interceptor can share the same constant and they can never drift. */
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/** MIME types accepted on the forms upload field (images / SVG only).
 *  Video types in MIME_ALLOWLIST are NOT accepted here. */
export const FORMS_IMAGE_MIMES = new Set(
  Object.keys(MIME_ALLOWLIST).filter((m) => m.startsWith('image/')),
);

/** Public shape returned by the list endpoint — no raw upload bytes. */
export interface PublicSubmission {
  id: string;
  formKey: string;
  status: string;
  payload: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
  hasUpload: boolean;
}

export interface ListOptions {
  status?: 'NEW' | 'READ' | 'ARCHIVED';
  formKey?: 'quote' | 'contact';
  take?: number;
  skip?: number;
}

export interface ListResult {
  items: PublicSubmission[];
  total: number;
}

export interface SummaryResult {
  total: number;
  new: number;
  byKey: { quote: number; contact: number };
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
      if (!FORMS_IMAGE_MIMES.has(file.mimetype)) {
        throw new BadRequestException(
          `File type ${file.mimetype} is not accepted; images only`,
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
      );
      uploadAssetId = assetDto.id;
    }

    // 3. Persist the submission
    await this.prisma.client.formSubmission.create({
      data: {
        formKey: formKey as FormKey,
        payload: payload as object,
        uploadAssetId,
        ip,
        userAgent,
      },
    });

    return { ok: true };
  }

  async list(opts: ListOptions = {}): Promise<ListResult> {
    const take = Math.min(opts.take ?? 20, 200);
    const skip = opts.skip ?? 0;

    const where: Record<string, unknown> = {};
    if (opts.status) where.status = opts.status;
    if (opts.formKey) where.formKey = opts.formKey;

    const [rows, total] = await Promise.all([
      this.prisma.client.formSubmission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.client.formSubmission.count({ where }),
    ]);

    const items: PublicSubmission[] = rows.map((r) => ({
      id: r.id,
      formKey: r.formKey,
      status: r.status,
      payload: r.payload,
      ip: r.ip,
      userAgent: r.userAgent,
      createdAt: r.createdAt,
      hasUpload: r.uploadAssetId != null,
    }));

    return { items, total };
  }

  async summary(): Promise<SummaryResult> {
    // Fetch all submissions from last 90 days for series + counts
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const [total, newCount, quoteCount, contactCount, recent] =
      await Promise.all([
        this.prisma.client.formSubmission.count(),
        this.prisma.client.formSubmission.count({ where: { status: 'NEW' } }),
        this.prisma.client.formSubmission.count({
          where: { formKey: 'quote' },
        }),
        this.prisma.client.formSubmission.count({
          where: { formKey: 'contact' },
        }),
        this.prisma.client.formSubmission.findMany({
          where: { createdAt: { gte: since } },
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
      byKey: { quote: quoteCount, contact: contactCount },
      series,
    };
  }

  async setStatus(
    id: string,
    status: 'NEW' | 'READ' | 'ARCHIVED',
  ): Promise<PublicSubmission> {
    const row = await this.prisma.client.formSubmission.update({
      where: { id },
      data: { status },
    });
    return {
      id: row.id,
      formKey: row.formKey,
      status: row.status,
      payload: row.payload,
      ip: row.ip,
      userAgent: row.userAgent,
      createdAt: row.createdAt,
      hasUpload: row.uploadAssetId != null,
    };
  }
}

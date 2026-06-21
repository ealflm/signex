import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service, IMMUTABLE_CACHE_CONTROL } from './r2.service';
import { readImageDimensions } from './image-dimensions';
import { sanitizeSvg, SvgForbiddenError } from './svg-sanitize';
import {
  MIME_ALLOWLIST,
  kindForMime,
  extForMime,
  slugify,
  keyFor,
  type PresignInput,
  type ReplaceInput,
} from './dto/assets.dto';
import type { Asset } from '@signex/db';

export type LocalizedText = { en: string; vi: string };

export interface AssetDto {
  id: string;
  status: string;
  kind: string;
  sha256: string;
  r2Key: string;
  url: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  originalName: string;
  altDefault: LocalizedText | null;
  posterId: string | null;
}

interface Actor {
  id: string;
  role: string;
}

export type PresignResult =
  | { deduped: true; asset: AssetDto }
  | {
      deduped: false;
      assetId: string;
      r2Key: string;
      upload: {
        url: string;
        headers: Record<string, string>;
        expiresIn: number;
      };
    };

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2Service,
  ) {}

  toAssetDto(a: Asset): AssetDto {
    return {
      id: a.id,
      status: a.status,
      kind: a.kind,
      sha256: a.sha256,
      r2Key: a.r2Key,
      url: this.r2.publicUrl(a.r2Key),
      mime: a.mime,
      bytes: Number(a.bytes),
      width: a.width ?? null,
      height: a.height ?? null,
      duration: a.duration ?? null,
      originalName: a.originalName,
      altDefault: (a.altDefault as LocalizedText | null) ?? null,
      posterId: a.posterId ?? null,
    };
  }

  private async audit(
    actor: Actor,
    action: string,
    entityId: string,
    meta?: unknown,
  ) {
    await this.prisma.client.auditLog.create({
      data: {
        userId: actor.id,
        action,
        entityType: 'asset',
        entityId,
        meta: meta as never,
      },
    });
  }

  async presign(actor: Actor, input: PresignInput): Promise<PresignResult> {
    const sha256 = input.sha256.toLowerCase();
    // Dedup short-circuit: same bytes already live => same content-addressed key.
    const existing = await this.prisma.client.asset.findUnique({
      where: { sha256 },
    });
    if (existing && existing.status === 'READY') {
      return { deduped: true, asset: this.toAssetDto(existing) };
    }

    const kind = kindForMime(input.mime);
    const ext = extForMime(input.mime);
    const slug = slugify(input.originalName.replace(/\.[^.]+$/, ''));
    const r2Key = keyFor(sha256, slug, ext);

    // Re-use an existing PENDING row for the same bytes (idempotent re-presign).
    const asset =
      existing ??
      (await this.prisma.client.asset.create({
        data: {
          status: 'PENDING',
          kind,
          sha256,
          r2Key,
          mime: input.mime,
          bytes: BigInt(input.bytes),
          originalName: input.originalName,
          altDefault: (input.altDefault as never) ?? undefined,
          uploadedById: actor.id,
        },
      }));

    const upload = await this.r2.presignPut({
      r2Key: asset.r2Key,
      mime: input.mime,
      sha256,
      maxBytes: MIME_ALLOWLIST[input.mime].maxBytes,
    });
    await this.audit(actor, 'asset.presign', asset.id, { r2Key: asset.r2Key });
    return { deduped: false, assetId: asset.id, r2Key: asset.r2Key, upload };
  }

  async confirm(actor: Actor, assetId: string): Promise<AssetDto> {
    const asset = await this.prisma.client.asset.findUnique({
      where: { id: assetId },
    });
    if (!asset) {
      throw new NotFoundException('asset not found');
    }
    if (asset.status === 'READY') {
      return this.toAssetDto(asset); // idempotent
    }

    const head = await this.r2.headObject(asset.r2Key);
    if (!head) {
      throw new BadRequestException('uploaded object not found in R2');
    }

    const bytes = await this.r2.getObjectBytes(asset.r2Key);
    const actualSha = createHash('sha256').update(bytes).digest('hex');
    if (actualSha !== asset.sha256) {
      throw new BadRequestException(
        'CHECKSUM_MISMATCH: uploaded bytes do not match declared sha256',
      );
    }

    let storedBytes = bytes;
    if (asset.kind === 'SVG') {
      // Sanitize-or-forbid: re-write the cleaned SVG back to R2 (key/hash unchanged, content trusted).
      let cleaned: Buffer;
      try {
        cleaned = sanitizeSvg(bytes);
      } catch (e) {
        if (e instanceof SvgForbiddenError)
          throw new BadRequestException('INVALID_SVG: ' + e.message);
        throw e;
      }
      storedBytes = cleaned;
      await this.r2.putObject({
        r2Key: asset.r2Key,
        body: cleaned,
        mime: asset.mime,
        cacheControl: IMMUTABLE_CACHE_CONTROL,
      });
    }

    const dims = readImageDimensions(storedBytes, asset.mime);

    const updated = await this.prisma.client.asset.update({
      where: { id: asset.id },
      data: {
        status: 'READY',
        bytes: BigInt(storedBytes.length),
        width: dims?.width ?? null,
        height: dims?.height ?? null,
      },
    });
    await this.audit(actor, 'asset.confirm', asset.id, {
      bytes: storedBytes.length,
    });
    return this.toAssetDto(updated);
  }

  /** Server-side upload path reused by the importer + replace (no presign round-trip). */
  async register(
    actor: Actor,
    input: {
      bytes: Buffer;
      mime: string;
      originalName: string;
      altDefault?: LocalizedText;
    },
  ): Promise<AssetDto> {
    if (!(input.mime in MIME_ALLOWLIST)) {
      throw new BadRequestException(`mime ${input.mime} not in allowlist`);
    }
    const cap = MIME_ALLOWLIST[input.mime].maxBytes;
    if (input.bytes.length > cap) {
      throw new BadRequestException(
        `file size ${input.bytes.length} exceeds cap ${cap}`,
      );
    }

    let body = input.bytes;
    if (input.mime === 'image/svg+xml') {
      try {
        body = sanitizeSvg(body);
      } catch (e) {
        if (e instanceof SvgForbiddenError)
          throw new BadRequestException('INVALID_SVG: ' + e.message);
        throw e;
      }
    }
    const sha256 = createHash('sha256').update(body).digest('hex');

    const existing = await this.prisma.client.asset.findUnique({
      where: { sha256 },
    });
    if (existing && existing.status === 'READY') {
      return this.toAssetDto(existing); // dedup
    }

    const kind = kindForMime(input.mime);
    const ext = extForMime(input.mime);
    const slug = slugify(input.originalName.replace(/\.[^.]+$/, ''));
    const r2Key = keyFor(sha256, slug, ext);
    const dims = readImageDimensions(body, input.mime);

    await this.r2.putObject({
      r2Key,
      body,
      mime: input.mime,
      cacheControl: IMMUTABLE_CACHE_CONTROL,
      checksumSha256: Buffer.from(sha256, 'hex').toString('base64'),
    });

    const asset = existing
      ? await this.prisma.client.asset.update({
          where: { id: existing.id },
          data: {
            status: 'READY',
            bytes: BigInt(body.length),
            width: dims?.width ?? null,
            height: dims?.height ?? null,
          },
        })
      : await this.prisma.client.asset.create({
          data: {
            status: 'READY',
            kind,
            sha256,
            r2Key,
            mime: input.mime,
            bytes: BigInt(body.length),
            width: dims?.width ?? null,
            height: dims?.height ?? null,
            originalName: input.originalName,
            altDefault: (input.altDefault as never) ?? undefined,
            uploadedById: actor.id,
          },
        });
    await this.audit(actor, 'asset.register', asset.id, { r2Key });
    return this.toAssetDto(asset);
  }

  async list(opts?: {
    kind?: string;
    includeDeleted?: boolean;
  }): Promise<AssetDto[]> {
    const rows = await this.prisma.client.asset.findMany({
      where: {
        status: 'READY',
        ...(opts?.kind ? { kind: opts.kind as never } : {}),
        ...(opts?.includeDeleted ? {} : { deletedAt: null }),
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toAssetDto(r));
  }

  async usage(assetId: string): Promise<{
    working: {
      id: string;
      ownerType: string;
      ownerId: string;
      field: string;
    }[];
    releases: { releaseId: string }[];
  }> {
    const [working, releases] = await Promise.all([
      this.prisma.client.assetRef.findMany({ where: { assetId } }),
      this.prisma.client.releaseAssetRef.findMany({
        where: { assetId },
        select: { releaseId: true },
      }),
    ]);
    return {
      working: working.map((w) => ({
        id: w.id,
        ownerType: w.ownerType,
        ownerId: w.ownerId,
        field: w.field,
      })),
      releases,
    };
  }

  /** Replace = register the new bytes; callers repoint imageId/posterId atomically at the catalog/content layer. */
  async replace(
    actor: Actor,
    assetId: string,
    input: ReplaceInput & { bytes?: Buffer },
  ): Promise<AssetDto> {
    const target = await this.prisma.client.asset.findUnique({
      where: { id: assetId },
    });
    if (!target) {
      throw new NotFoundException('asset to replace not found');
    }
    if (!input.bytes) {
      throw new BadRequestException('replace requires raw bytes');
    }
    const dto = await this.register(actor, {
      bytes: input.bytes,
      mime: input.mime,
      originalName: input.originalName,
    });
    await this.audit(actor, 'asset.replace', assetId, { replacedWith: dto.id });
    return dto;
  }

  async setAlt(
    actor: Actor,
    assetId: string,
    alt: LocalizedText,
  ): Promise<AssetDto> {
    const asset = await this.prisma.client.asset.findUnique({
      where: { id: assetId },
    });
    if (!asset) {
      throw new NotFoundException('asset not found');
    }
    const updated = await this.prisma.client.asset.update({
      where: { id: assetId },
      data: { altDefault: alt as never },
    });
    await this.audit(actor, 'asset.setAlt', assetId, { alt });
    return this.toAssetDto(updated);
  }
}

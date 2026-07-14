import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@signex/db';
import {
  BLOCK_REGISTRY,
  parseBlock,
  ReleaseSnapshotSchema,
  type BlockKey,
} from '@signex/shared';
import type { AuthedUser } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { collectAssetIds, freezeAsset } from '../release/snapshot-assets';
import type { SaveDraftInput } from './save-draft.dto';

export interface ThemeListItem {
  id: string;
  name: string;
  draftRevision: number;
  lastPublishedRevision: number;
  dirty: boolean;
  isLive: boolean;
  updatedAt: Date;
  /** Public URL of this theme's hero image (from draftSnapshot), for the /themes card thumbnail. */
  heroImageUrl?: string;
}

/**
 * Resolve a theme's hero-image public URL from its draftSnapshot:
 * blocks.hero.image.assetId → assets[assetId].r2Key → `${MEDIA_PUBLIC_BASE}/${r2Key}`
 * (same URL the web read-path builds). Returns undefined when absent/unresolvable.
 */
function heroImageUrlFromSnapshot(snapshot: unknown): string | undefined {
  try {
    const snap = snapshot as {
      blocks?: { hero?: { image?: { assetId?: string } } };
      assets?: Record<string, { r2Key?: string } | undefined>;
    };
    const assetId = snap.blocks?.hero?.image?.assetId;
    const r2Key = assetId ? snap.assets?.[assetId]?.r2Key : undefined;
    if (!r2Key) return undefined;
    const base = (process.env.MEDIA_PUBLIC_BASE ?? '').replace(/\/+$/, '');
    return base ? `${base}/${r2Key}` : undefined;
  } catch {
    return undefined;
  }
}

/** Shape passed to applyDraftMutation to record the audit entry. */
export interface ApplyDraftAuditMeta {
  action: string;
  meta?: unknown;
}

@Injectable()
export class ThemeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Optimistic-lock guard: bumps draftRevision with a single CONDITIONAL atomic
   * write, throws ConflictException('STALE_DRAFT') on mismatch, and returns the
   * new revision.
   *
   * The `updateMany({ where: { id, draftRevision: expected } })` is the lock:
   * only the row still at `expectedDraftRevision` is touched. Under READ
   * COMMITTED a concurrent same-theme writer's UPDATE blocks on the first
   * writer's row lock, then re-evaluates the `draftRevision = expected`
   * predicate against the just-committed row — which no longer matches — so it
   * affects 0 rows and 409s instead of blind-overwriting (the lost-update race a
   * SELECT-then-update left open). A missing theme is distinguished as 404.
   */
  async guardAndBump(
    tx: Prisma.TransactionClient,
    themeId: string,
    expectedDraftRevision: number,
  ): Promise<number> {
    const res = await tx.theme.updateMany({
      where: { id: themeId, draftRevision: expectedDraftRevision },
      data: { draftRevision: { increment: 1 } },
    });

    if (res.count === 0) {
      // 0 rows → either the theme is gone or the revision moved on. Distinguish
      // for a correct status (404 vs 409) with a cheap existence probe.
      const exists = await tx.theme.findUnique({
        where: { id: themeId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('theme not found');
      throw new ConflictException('STALE_DRAFT');
    }

    return expectedDraftRevision + 1;
  }

  /**
   * Core draft-mutation primitive — runs ONE transaction that:
   *   1. guardAndBump (optimistic-lock)
   *   2. clones draftSnapshot
   *   3. calls mutate(snap, tx) — any throw → 422 propagates, no persist
   *   4. reconciles snap.assets (collectAssetIds → findMany → freezeAsset)
   *   5. ReleaseSnapshotSchema backstop (fail → 422 INVALID_SNAPSHOT)
   *   6. persists { draftSnapshot, draftRevision }
   *   7. writes audit entry
   *
   * Callers (saveDraft, CatalogService.*) provide the mutator and audit action;
   * the rest of the scaffolding is shared and tested once here.
   */
  async applyDraftMutation(
    actor: AuthedUser,
    themeId: string,
    expectedDraftRevision: number,
    mutate: (snap: any, tx: Prisma.TransactionClient) => void | Promise<void>,
    auditMeta: ApplyDraftAuditMeta,
  ): Promise<{ draftRevision: number }> {
    return this.prisma.client.$transaction(async (tx) => {
      // 1. Optimistic-lock bump — throws 409 STALE_DRAFT on mismatch.
      const rev = await this.guardAndBump(tx, themeId, expectedDraftRevision);

      // 2. Fetch and clone the current draft snapshot.
      const theme = await tx.theme.findUniqueOrThrow({
        where: { id: themeId },
        select: { draftSnapshot: true },
      });

      const snap: any = structuredClone(theme.draftSnapshot);
      if (!snap.blocks) snap.blocks = {};
      if (!snap.catalog) snap.catalog = { categories: [] };
      if (!snap.catalog.categories) snap.catalog.categories = [];

      // 3. Apply the caller's mutation. Any throw aborts (no persist, no bump committed).
      await mutate(snap, tx);

      // 4. Reconcile assets: collect every assetId referenced in the snapshot,
      //    fetch rows from the DB, and rebuild snap.assets (prunes orphans).
      const assetIds = collectAssetIds(snap);
      const assetRows = await tx.asset.findMany({
        where: { id: { in: [...assetIds] } },
        select: {
          id: true,
          r2Key: true,
          mime: true,
          width: true,
          height: true,
          poster: { select: { r2Key: true } },
        },
      });
      snap.assets = Object.fromEntries(
        assetRows.map((r) => [r.id, freezeAsset(r)]),
      );

      // 5. Schema backstop — ensures the snapshot is still structurally valid.
      const parsed = ReleaseSnapshotSchema.safeParse(snap);
      if (!parsed.success) {
        throw new UnprocessableEntityException({
          code: 'INVALID_SNAPSHOT',
          issues: parsed.error.issues,
        });
      }

      // 6. Persist snapshot + revision atomically.
      await tx.theme.update({
        where: { id: themeId },
        data: {
          draftSnapshot: snap as unknown as Prisma.InputJsonValue,
          draftRevision: rev,
        },
      });

      // 7. Audit trail.
      await this.audit.record(tx, {
        userId: actor.id,
        action: auditMeta.action,
        entityType: 'theme',
        entityId: themeId,
        meta: auditMeta.meta,
      });

      return { draftRevision: rev };
    });
  }

  async list(): Promise<ThemeListItem[]> {
    const [themes, pointer] = await Promise.all([
      this.prisma.client.theme.findMany({
        select: {
          id: true,
          name: true,
          draftRevision: true,
          lastPublishedRevision: true,
          updatedAt: true,
          draftSnapshot: true,
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.client.publishedPointer.findUnique({
        where: { id: 'singleton' },
        select: { release: { select: { themeId: true } } },
      }),
    ]);

    const liveThemeId = pointer?.release?.themeId ?? null;

    return themes.map(({ draftSnapshot, ...t }) => ({
      ...t,
      dirty: t.draftRevision !== t.lastPublishedRevision,
      isLive: t.id === liveThemeId,
      heroImageUrl: heroImageUrlFromSnapshot(draftSnapshot),
    }));
  }

  async get(id: string) {
    return this.prisma.client.theme.findUniqueOrThrow({ where: { id } });
  }

  async duplicate(actor: AuthedUser, sourceId: string, name: string) {
    const src = await this.prisma.client.theme.findUniqueOrThrow({
      where: { id: sourceId },
    });

    return this.prisma.client.theme.create({
      data: {
        name,
        draftSnapshot: structuredClone(src.draftSnapshot) as Prisma.InputJsonValue,
        liveSnapshot: Prisma.DbNull,
        draftRevision: 0,
        lastPublishedRevision: 0,
        createdById: actor.id,
      },
    });
  }

  async rename(id: string, name: string) {
    // P2002 unique-constraint on name → the global PrismaExceptionFilter maps
    // it to 409. We let it propagate; no manual catch needed here.
    return this.prisma.client.theme.update({
      where: { id },
      data: { name },
    });
  }

  async remove(id: string) {
    const pointer = await this.prisma.client.publishedPointer.findUnique({
      where: { id: 'singleton' },
      select: { release: { select: { themeId: true } } },
    });

    if (pointer?.release?.themeId === id) {
      throw new ConflictException('LIVE_THEME');
    }

    return this.prisma.client.theme.delete({ where: { id } });
  }

  async saveDraft(
    actor: AuthedUser,
    themeId: string,
    body: SaveDraftInput,
  ): Promise<{ draftRevision: number }> {
    const { edits, expectedDraftRevision, palette, replacePalette } = body;

    return this.applyDraftMutation(
      actor,
      themeId,
      expectedDraftRevision,
      async (snap) => {
        // Apply each edit. Any parse failure aborts (throws 422).
        for (const { key, data } of edits) {
          try {
            if (!(key in BLOCK_REGISTRY)) {
              throw Object.assign(new Error(`Unknown block key: "${key}"`), {
                _unknownBlock: true,
              });
            }
            (snap.blocks as Record<string, unknown>)[key] = parseBlock(
              key as BlockKey,
              data,
            );
          } catch (err: unknown) {
            const e = err as Record<string, unknown> & { message?: string };
            const code = e._unknownBlock ? 'UNKNOWN_BLOCK' : 'INVALID_BLOCK';
            throw new UnprocessableEntityException({
              code,
              key,
              detail: e.message,
            });
          }
        }

        // `replacePalette` is the explicit "reset" signal: the merge below is additive-only (it can
        // never DELETE a previously-saved key), so a client-side reset that must remove persisted
        // keys sends `replacePalette: true` and we set the palette verbatim instead of merging.
        if (replacePalette) {
          snap.palette = palette ?? {};
          return;
        }

        // Merge the palette patch, shallow-merged per slice, so a patch that only sends e.g.
        // `seeds` doesn't wipe existing `tokens`/`overrides`.
        // `overrides` is a LIST keyed by `selector`: merge role-wise per selector, because
        // pendingPalette resets to {} across a save boundary — a whole-entry replace would drop a
        // role saved in an earlier session (e.g. `text` now, `bg` later on the same element).
        if (palette) {
          const prev = (snap.palette ?? {}) as {
            seeds?: Record<string, string>;
            tokens?: Record<string, string>;
            overrides?: Array<Record<string, string>>;
          };
          const bySelector = new Map<string, Record<string, string>>();
          for (const ov of prev.overrides ?? []) {
            if (ov?.selector) bySelector.set(ov.selector, { ...ov });
          }
          for (const ov of palette.overrides ?? []) {
            bySelector.set(ov.selector, {
              ...(bySelector.get(ov.selector) ?? {}),
              ...ov,
            });
          }
          snap.palette = {
            seeds: { ...(prev.seeds ?? {}), ...(palette.seeds ?? {}) },
            tokens: { ...(prev.tokens ?? {}), ...(palette.tokens ?? {}) },
            overrides: [...bySelector.values()],
          };
        }
      },
      { action: 'theme.savedraft', meta: { keys: edits.map((e) => e.key) } },
    );
  }
}

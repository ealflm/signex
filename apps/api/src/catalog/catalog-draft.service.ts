import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@signex/db';
import { CatalogSnapshotSchema, CATALOG_SCHEMA_VERSION } from '@signex/shared';
import type { AuthedUser } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

/** Shape passed to applyCatalogMutation to record the audit entry. */
export interface ApplyCatalogAuditMeta {
  action: string;
  meta?: unknown;
}

/** Read view of the global catalog draft (for the admin catalog editor). */
export interface CatalogDraftView {
  draftRevision: number;
  lastPublishedRevision: number;
  dirty: boolean;
  categories: any[];
}

function emptySnapshot(): Prisma.InputJsonValue {
  return {
    catalogSchemaVersion: CATALOG_SCHEMA_VERSION,
    categories: [],
  } as unknown as Prisma.InputJsonValue;
}

/**
 * Write primitive for the GLOBAL catalog draft (CatalogDraft singleton). This is
 * the catalog-domain twin of ThemeService.applyDraftMutation, but:
 *   - it targets the single `singleton` row (no themeId — catalog is global),
 *   - it validates against CatalogSnapshotSchema (not ReleaseSnapshotSchema), and
 *   - it does NOT reconcile a separate assets map: catalog images are inline,
 *     self-contained FrozenAssets (frozen on write by the CRUD mutators), so
 *     there is no snap.assets to rebuild.
 */
@Injectable()
export class CatalogDraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Self-heal: the backfill creates the singleton, but a fresh/dev system may not have run it. */
  private async ensureDraft() {
    const existing = await this.prisma.client.catalogDraft.findUnique({
      where: { id: 'singleton' },
    });
    if (existing) return existing;
    return this.prisma.client.catalogDraft.create({
      data: { id: 'singleton', draftSnapshot: emptySnapshot() },
    });
  }

  /** Read the current draft for the editor: categories + revisions + dirty flag. */
  async getDraft(): Promise<CatalogDraftView> {
    const d = await this.ensureDraft();
    const snap = d.draftSnapshot as { categories?: any[] };
    return {
      draftRevision: d.draftRevision,
      lastPublishedRevision: d.lastPublishedRevision,
      dirty: d.draftRevision !== d.lastPublishedRevision,
      categories: Array.isArray(snap?.categories) ? snap.categories : [],
    };
  }

  /**
   * Optimistic-lock guard on the singleton: a single CONDITIONAL atomic bump.
   * Only the row still at `expectedDraftRevision` is touched — a concurrent
   * writer that committed first moves the revision, so the predicate no longer
   * matches and this affects 0 rows → 409 STALE_DRAFT instead of a lost update.
   */
  async guardAndBumpCatalog(
    tx: Prisma.TransactionClient,
    expectedDraftRevision: number,
  ): Promise<number> {
    const res = await tx.catalogDraft.updateMany({
      where: { id: 'singleton', draftRevision: expectedDraftRevision },
      data: { draftRevision: { increment: 1 } },
    });

    if (res.count === 0) {
      const exists = await tx.catalogDraft.findUnique({
        where: { id: 'singleton' },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('catalog draft not found');
      throw new ConflictException('STALE_DRAFT');
    }

    return expectedDraftRevision + 1;
  }

  /**
   * Core catalog-draft mutation — ONE transaction that:
   *   1. guardAndBumpCatalog (optimistic-lock)
   *   2. clones draftSnapshot (normalizes shape)
   *   3. calls mutate(snap, tx) — any throw → propagates, no persist
   *   4. CatalogSnapshotSchema backstop (fail → 422 INVALID_SNAPSHOT)
   *   5. persists { draftSnapshot, draftRevision, updatedById }
   *   6. writes audit entry
   */
  async applyCatalogMutation(
    actor: AuthedUser,
    expectedDraftRevision: number,
    mutate: (snap: any, tx: Prisma.TransactionClient) => void | Promise<void>,
    auditMeta: ApplyCatalogAuditMeta,
  ): Promise<{ draftRevision: number }> {
    // Ensure the singleton exists before the guard so a fresh system bumps from 0.
    await this.ensureDraft();

    return this.prisma.client.$transaction(async (tx) => {
      // 1. Optimistic-lock bump — throws 409 STALE_DRAFT on mismatch.
      const rev = await this.guardAndBumpCatalog(tx, expectedDraftRevision);

      // 2. Fetch + clone the current draft snapshot; normalize its shape.
      const draft = await tx.catalogDraft.findUniqueOrThrow({
        where: { id: 'singleton' },
        select: { draftSnapshot: true },
      });
      const snap: any = structuredClone(draft.draftSnapshot);
      if (snap.catalogSchemaVersion == null) {
        snap.catalogSchemaVersion = CATALOG_SCHEMA_VERSION;
      }
      if (!Array.isArray(snap.categories)) snap.categories = [];

      // 3. Apply the caller's mutation. Any throw aborts (no persist, no bump committed).
      await mutate(snap, tx);

      // 4. Schema backstop — the draft must stay a valid CatalogSnapshot.
      const parsed = CatalogSnapshotSchema.safeParse(snap);
      if (!parsed.success) {
        throw new UnprocessableEntityException({
          code: 'INVALID_SNAPSHOT',
          issues: parsed.error.issues,
        });
      }

      // 5. Persist snapshot + revision + author atomically.
      await tx.catalogDraft.update({
        where: { id: 'singleton' },
        data: {
          draftSnapshot: snap as unknown as Prisma.InputJsonValue,
          draftRevision: rev,
          updatedById: actor.id,
        },
      });

      // 6. Audit trail.
      await this.audit.record(tx, {
        userId: actor.id,
        action: auditMeta.action,
        entityType: 'catalog',
        entityId: 'singleton',
        meta: auditMeta.meta,
      });

      return { draftRevision: rev };
    });
  }
}

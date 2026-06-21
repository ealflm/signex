import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma, User } from '@signex/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RevalidationService } from '../revalidation/revalidation.service';
import { SnapshotSerializer } from './snapshot.serializer';
import type { PublishInput } from './dto/release.dto';

const SCHEMA_VERSION = 1;

export type PublishResult =
  | { status: 'noop' }
  | { status: 'published'; version: number; releaseId: string };

@Injectable()
export class ReleaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly serializer: SnapshotSerializer,
    private readonly revalidation: RevalidationService,
    private readonly audit: AuditService,
  ) {}

  private assertMediaBaseConfigured(): void {
    const base = process.env.MEDIA_PUBLIC_BASE;
    if (!base || base.includes('r2.dev')) {
      throw new ServiceUnavailableException(
        'MEDIA_PUBLIC_BASE not configured for publish',
      );
    }
  }

  async publish(actor: User, input: PublishInput): Promise<PublishResult> {
    // 0. GATE
    this.assertMediaBaseConfigured();

    // 1. Serialize OUTSIDE the tx
    const { snapshot, checksum, assetIds, fromRevision } =
      await this.serializer.serialize(this.prisma.client);

    if (input.expectedRevision !== fromRevision) {
      throw new ConflictException('STALE_DRAFT');
    }

    // 2. Soft no-op: if live release has the same checksum, nothing changed
    const live = await this.prisma.client.publishedPointer.findUnique({
      where: { id: 'singleton' },
      include: { release: { select: { checksum: true } } },
    });
    if (live?.release.checksum === checksum) {
      return { status: 'noop' };
    }

    // 3. SHORT tx — revision guard + sequence version + writes
    const result = await this.prisma.client.$transaction(
      async (tx) => {
        // TOCTOU guard: re-read WorkingState inside tx
        const ws = await tx.workingState.findUniqueOrThrow({
          where: { id: 'singleton' },
        });
        if (ws.revision !== fromRevision) {
          throw new ConflictException('STALE_DRAFT');
        }

        // Monotonic version from Postgres sequence (NEVER max+1)
        const seq = await tx.$queryRaw<Array<{ nextval: bigint }>>`
          SELECT nextval('release_version_seq')`;
        const version = Number(seq[0].nextval);

        // Demote current published release → ARCHIVED
        await tx.release.updateMany({
          where: { status: 'PUBLISHED' },
          data: { status: 'ARCHIVED' },
        });

        // Create the new Release
        const release = await tx.release.create({
          data: {
            version,
            status: 'PUBLISHED',
            label: null,
            note: input.note ?? null,
            snapshot: snapshot as unknown as Prisma.InputJsonValue,
            checksum,
            schemaVersion: SCHEMA_VERSION,
            fromRevision,
            createdById: actor.id,
            publishedById: actor.id,
            publishedAt: new Date(),
          },
        });

        // Repoint the PublishedPointer singleton
        await tx.publishedPointer.upsert({
          where: { id: 'singleton' },
          create: {
            id: 'singleton',
            releaseId: release.id,
            publishedVersion: version,
            publishedById: actor.id,
          },
          update: {
            releaseId: release.id,
            publishedVersion: version,
            publishedById: actor.id,
            publishedAt: new Date(),
          },
        });

        // Pin the assets referenced by this release (GC safety)
        if (assetIds.length > 0) {
          await tx.releaseAssetRef.createMany({
            data: assetIds.map((assetId) => ({
              releaseId: release.id,
              assetId,
            })),
            skipDuplicates: true,
          });
        }

        // Record that the working state has been published at this revision
        await tx.workingState.update({
          where: { id: 'singleton' },
          data: { lastPublishedRevision: fromRevision },
        });

        // Audit
        await this.audit.record(tx as unknown as Prisma.TransactionClient, {
          userId: actor.id,
          action: 'release.publish',
          entityType: 'release',
          entityId: release.id,
          meta: { version },
        });

        return { version, releaseId: release.id };
      },
      { timeout: 10000, maxWait: 5000 },
    );

    // 4. AFTER commit — non-fatal revalidation (failure must NOT roll back)
    await this.revalidation.revalidate({});

    return {
      status: 'published',
      version: result.version,
      releaseId: result.releaseId,
    };
  }
}

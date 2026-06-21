import type { Prisma } from '@signex/db';
import type { CollectedRef } from '../content/asset-ref.util';

/**
 * Rebuild the derived AssetRef cache for one owner. Delete-then-insert inside
 * the caller's tx (AssetRef is a derived cache rebuilt on every edit, §9).
 */
export async function reconcileAssetRefs(
  tx: Prisma.TransactionClient,
  ownerType: string,
  ownerId: string,
  refs: CollectedRef[],
): Promise<void> {
  await tx.assetRef.deleteMany({ where: { ownerType, ownerId } });
  if (refs.length === 0) return;
  await tx.assetRef.createMany({
    data: refs.map((r) => ({
      ownerType,
      ownerId,
      field: r.field,
      assetId: r.assetId,
      alt: r.alt as Prisma.InputJsonValue | undefined,
    })),
  });
}

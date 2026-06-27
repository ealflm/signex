import { Injectable } from '@nestjs/common';

export { freezeAsset, collectAssetIds } from './snapshot-assets';
export type { AssetRow, FrozenAsset } from './snapshot-assets';

/**
 * SnapshotSerializer — kept as an Injectable shell so NestJS DI registrations
 * in release.module and preview.module continue to compile while those modules
 * are being rewritten (later tasks).  The actual serialization logic now lives
 * in the new ThemeRelease pipeline; asset helpers are in snapshot-assets.ts.
 */
@Injectable()
export class SnapshotSerializer {}

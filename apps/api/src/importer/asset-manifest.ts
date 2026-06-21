import type { AssetKind } from '@signex/db';

export interface AssetManifestEntry {
  logicalId: string;
  relPath: string; // relative to apps/web/public/assets
  kind: AssetKind;
  mime: string;
}

const SVG = (logicalId: string, file: string): AssetManifestEntry => ({
  logicalId,
  relPath: `images/${file}`,
  kind: 'SVG',
  mime: 'image/svg+xml',
});
const AVIF = (logicalId: string, file: string): AssetManifestEntry => ({
  logicalId,
  relPath: `images/${file}`,
  kind: 'IMAGE',
  mime: 'image/avif',
});
const PNG = (logicalId: string, file: string): AssetManifestEntry => ({
  logicalId,
  relPath: `images/${file}`,
  kind: 'IMAGE',
  mime: 'image/png',
});
const JPG = (logicalId: string, file: string): AssetManifestEntry => ({
  logicalId,
  relPath: `images/${file}`,
  kind: 'IMAGE',
  mime: 'image/jpeg',
});
const MP4 = (logicalId: string, file: string): AssetManifestEntry => ({
  logicalId,
  relPath: `videos/${file}`,
  kind: 'VIDEO',
  mime: 'video/mp4',
});
const WEBM = (logicalId: string, file: string): AssetManifestEntry => ({
  logicalId,
  relPath: `videos/${file}`,
  kind: 'VIDEO',
  mime: 'video/webm',
});

// 4 category images (1:1 to dict.products.categories) — verified against product-images.ts CATEGORY_IMAGES.
const CATEGORY_IMAGE_FILES = [
  '69b049a16076b1b2188d012d_rumman-amin-s3o2rkTkF7I-unsplash.avif',
  '69b037b7b9f0bc0f27d8889d_dinuka-lankaloka-HKr5cn6S0q0-unsplash.avif',
  '69b03783cb355b95794c522e_pexels-roman-odintsov-5667901.avif',
  '69aff4da51c27aa9c99aba98_pexels-keeganjchecks-14524361.avif',
];

// 6 product images (decoupled from the i%6 cycle) — verified against product-images.ts PRODUCT_IMAGES.
const PRODUCT_IMAGE_FILES = [
  '69a9a5725487307243a72031_pexels-adriendrj-33980501.avif',
  '69a9a51013e52d8aa1532730_pexels-alohaphotostudio-6961666.avif',
  '69a9a43eeca7b6045e93b8cd_pexels-freestockpro-1007657.avif',
  '69a9a3f79f4956225122393e_pexels-shameel-mukkath-3421394-15059057__1_.avif',
  '69a9a296fd1002040c1e9240_pexels-brett-sayles-2126124.avif',
  '69a9a01bdb6ad07ce787019a_pexels-slimmars-13-197677686-13801311.avif',
];

export const categoryImageLogicalId = (i: number): string =>
  `category.image.${i}`;
export const productImageLogicalId = (j: number): string =>
  `product.image.${j}`;

export const ASSET_MANIFEST: ReadonlyArray<AssetManifestEntry> = [
  // --- brand / chrome ---
  // signex-logo.svg is used in TWO places: the navbar brand link (CSS mask) and the
  // footer brand column (<img>). Both logicalIds point at the same relPath so the
  // importer dedup collapses them to ONE upload / ONE Asset row.
  SVG('logo', 'signex-logo.svg'),
  SVG('logoFooter', 'signex-logo.svg'),
  SVG('lotus', 'lotus.svg'),
  SVG('lotusFooter', 'lotus-footer.svg'),
  PNG('og', 'signex-og.png'),
  PNG('favicon32', 'favicon-32x32.png'),
  PNG('favicon16', 'favicon-16x16.png'),
  PNG('appleTouch', 'apple-touch-icon.png'),
  PNG('androidChrome192', 'android-chrome-192x192.png'),
  PNG('androidChrome512', 'android-chrome-512x512.png'),
  // --- shared pexels surfaces (hero, contact parallax, 404/error) ---
  AVIF(
    'hero',
    '69b04fc10fe79a2becaf38a8_Contemporary_Cliffside_House_at_Twilight.avif',
  ),
  AVIF(
    'contactParallax',
    '69aeefb3f6044f0563d94f4b_sara-dubler-Koei_7yYtIo-unsplash.avif',
  ),
  AVIF(
    'notFound',
    '69ac691927961ac98c560fe2_pexels-stephanlouis-19119918.avif',
  ),
  AVIF(
    'featuresStill',
    '69a9746c7ab6e4371c4aae70_pexels-saeb-mahajna-14125913-6297105.avif',
  ),
  // --- home features video (poster + mp4 + webm) ---
  JPG(
    'homeVideoPoster',
    '69ac9062c7d860e7441b1f36_6168566-hd_1920_1080_30fps_poster.0000000.jpg',
  ),
  MP4(
    'homeVideoMp4',
    '69ac9062c7d860e7441b1f36_6168566-hd_1920_1080_30fps_mp4.mp4',
  ),
  WEBM(
    'homeVideoWebm',
    '69ac9062c7d860e7441b1f36_6168566-hd_1920_1080_30fps_webm.webm',
  ),
  // --- about page video (poster + mp4 + webm) ---
  JPG(
    'aboutVideoPoster',
    '69b06b4bfbdb2da284a4ec5e_8440992-uhd_2732_1440_25fps_poster.0000000.jpg',
  ),
  MP4(
    'aboutVideoMp4',
    '69b06b4bfbdb2da284a4ec5e_8440992-uhd_2732_1440_25fps_mp4.mp4',
  ),
  WEBM(
    'aboutVideoWebm',
    '69b06b4bfbdb2da284a4ec5e_8440992-uhd_2732_1440_25fps_webm.webm',
  ),
  // --- catalog: 4 category + 6 product images ---
  ...CATEGORY_IMAGE_FILES.map((f, i) => AVIF(categoryImageLogicalId(i), f)),
  ...PRODUCT_IMAGE_FILES.map((f, j) => AVIF(productImageLogicalId(j), f)),
];

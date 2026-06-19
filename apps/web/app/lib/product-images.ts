// Single source of truth for the product/category placeholder images (stock .avif in
// public/assets/images; swap to real photos later). Shared by the home product grid, the
// category-detail page, and the product-detail page so the same product shows the same image
// everywhere. INDEX-ALIGNMENT CONTRACT:
//   • CATEGORY_IMAGES — index-aligned to dict.products.categories (1→4 = grid order)
//   • PRODUCT_IMAGES  — cycled by an item's index within its category
export const CATEGORY_IMAGES = [
  "/assets/images/69b049a16076b1b2188d012d_rumman-amin-s3o2rkTkF7I-unsplash.avif",
  "/assets/images/69b037b7b9f0bc0f27d8889d_dinuka-lankaloka-HKr5cn6S0q0-unsplash.avif",
  "/assets/images/69b03783cb355b95794c522e_pexels-roman-odintsov-5667901.avif",
  "/assets/images/69aff4da51c27aa9c99aba98_pexels-keeganjchecks-14524361.avif",
];
export const PRODUCT_IMAGES = [
  "/assets/images/69a9a5725487307243a72031_pexels-adriendrj-33980501.avif",
  "/assets/images/69a9a51013e52d8aa1532730_pexels-alohaphotostudio-6961666.avif",
  "/assets/images/69a9a43eeca7b6045e93b8cd_pexels-freestockpro-1007657.avif",
  "/assets/images/69a9a3f79f4956225122393e_pexels-shameel-mukkath-3421394-15059057__1_.avif",
  "/assets/images/69a9a296fd1002040c1e9240_pexels-brett-sayles-2126124.avif",
  "/assets/images/69a9a01bdb6ad07ce787019a_pexels-slimmars-13-197677686-13801311.avif",
];

// Wrap by index so adding a category/product never produces an undefined src.
export const categoryImage = (i: number) => CATEGORY_IMAGES[i % CATEGORY_IMAGES.length];
export const productImage = (i: number) => PRODUCT_IMAGES[i % PRODUCT_IMAGES.length];

// app/lib/crop-image.ts
// Canvas helper for react-easy-crop. Given the source image URL (an object URL), the pixel crop rect
// from onCropComplete, and a rotation in degrees, it paints the rotated source onto a scratch canvas,
// extracts the crop rectangle, and resolves a Blob ready to upload via uploadAsset(). Adapted from the
// react-easy-crop docs example. PNG/WebP sources keep their format (transparency preserved); anything
// else (JPEG/AVIF/…) is exported as JPEG for broad toBlob support.

export interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", () => reject(new Error("Could not load the image to crop.")));
    img.src = src;
  });
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

function rotatedSize(width: number, height: number, rotation: number) {
  const r = toRad(rotation);
  return {
    width: Math.abs(Math.cos(r) * width) + Math.abs(Math.sin(r) * height),
    height: Math.abs(Math.sin(r) * width) + Math.abs(Math.cos(r) * height),
  };
}

/** Output mime: preserve PNG/WebP (alpha), else JPEG. */
export function outputMime(sourceMime: string): string {
  if (sourceMime === "image/png") return "image/png";
  if (sourceMime === "image/webp") return "image/webp";
  return "image/jpeg";
}

export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: PixelCrop,
  rotation = 0,
  sourceMime = "image/jpeg",
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const { width: bw, height: bh } = rotatedSize(image.width, image.height, rotation);

  // 1) Draw the (rotated) source centered on a scratch canvas the size of its rotated bounding box.
  const scratch = document.createElement("canvas");
  scratch.width = Math.round(bw);
  scratch.height = Math.round(bh);
  const sctx = scratch.getContext("2d");
  if (!sctx) throw new Error("Canvas 2D context unavailable.");
  sctx.translate(bw / 2, bh / 2);
  sctx.rotate(toRad(rotation));
  sctx.drawImage(image, -image.width / 2, -image.height / 2);

  // 2) Copy just the crop rectangle to the output canvas.
  const w = Math.max(1, Math.round(pixelCrop.width));
  const h = Math.max(1, Math.round(pixelCrop.height));
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d");
  if (!octx) throw new Error("Canvas 2D context unavailable.");
  octx.drawImage(scratch, Math.round(pixelCrop.x), Math.round(pixelCrop.y), w, h, 0, 0, w, h);

  const mime = outputMime(sourceMime);
  return new Promise<Blob>((resolve, reject) => {
    out.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not export the cropped image."))),
      mime,
      mime === "image/jpeg" ? 0.92 : undefined,
    );
  });
}

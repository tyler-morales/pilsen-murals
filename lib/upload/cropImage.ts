/**
 * Client-side crop and rotation for mural image editor.
 * getCroppedImg: pixel crop of the image (no rotation; rotation applied before crop in UI).
 * rotateImage: returns object URL of image rotated by 90° steps (caller must revoke URL when done).
 */

const JPEG_QUALITY = 0.9;

export interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = src;
  });
}

function rotatedSize(
  naturalWidth: number,
  naturalHeight: number,
  rotation: number
): { width: number; height: number } {
  const deg = ((rotation % 360) + 360) % 360;
  if (deg === 90 || deg === 270) {
    return { width: naturalHeight, height: naturalWidth };
  }
  return { width: naturalWidth, height: naturalHeight };
}

function drawRotated(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  rotation: number
): void {
  const { width: rw, height: rh } = rotatedSize(
    img.naturalWidth,
    img.naturalHeight,
    rotation
  );
  ctx.save();
  ctx.translate(rw / 2, rh / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(-img.naturalWidth / 2, -img.naturalHeight / 2);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/**
 * Returns an object URL of the image rotated by the given degrees (0, 90, 180, 270).
 * Caller must revoke the URL when no longer needed (e.g. when replacing with a new rotation).
 */
export async function rotateImage(
  imageSrc: string,
  degrees: number
): Promise<string> {
  const img = await loadImage(imageSrc);
  const { width, height } = rotatedSize(
    img.naturalWidth,
    img.naturalHeight,
    degrees
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2d context unavailable");
  drawRotated(ctx, img, degrees);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      JPEG_QUALITY
    );
  });
  return URL.createObjectURL(blob);
}

/**
 * Produces a JPEG Blob of the cropped region.
 * imageSrc: blob URL or same-origin image URL (expected to be already rotated if rotation was applied in UI).
 * pixelCrop: crop rectangle in image pixel coordinates.
 */
export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: PixelCrop
): Promise<Blob> {
  const img = await loadImage(imageSrc);
  const { x, y, width, height } = pixelCrop;
  const outCanvas = document.createElement("canvas");
  outCanvas.width = Math.round(width);
  outCanvas.height = Math.round(height);
  const outCtx = outCanvas.getContext("2d");
  if (!outCtx) throw new Error("Canvas 2d context unavailable");
  outCtx.drawImage(
    img,
    Math.round(x),
    Math.round(y),
    Math.round(width),
    Math.round(height),
    0,
    0,
    Math.round(width),
    Math.round(height)
  );
  return new Promise((resolve, reject) => {
    outCanvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

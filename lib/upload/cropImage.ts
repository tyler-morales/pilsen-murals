/**
 * Client-side crop + rotation for mural image editor.
 * Takes image URL, pixel crop area (from react-easy-crop onCropComplete), and rotation in degrees;
 * returns a JPEG Blob of the cropped region.
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

/**
 * Returns the width and height of the image after applying rotation (90° increments).
 */
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

/**
 * Draws the image onto the canvas with rotation applied (rotation in degrees, 0/90/180/270).
 */
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
 * Produces a JPEG Blob of the cropped (and rotated) image.
 * imageSrc: blob URL or same-origin image URL.
 * pixelCrop: crop rectangle in the rotated image's coordinate system (from react-easy-crop croppedAreaPixels).
 * rotation: rotation in degrees (0, 90, 180, 270).
 */
export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: PixelCrop,
  rotation: number
): Promise<Blob> {
  const img = await loadImage(imageSrc);
  const { width: rotW, height: rotH } = rotatedSize(
    img.naturalWidth,
    img.naturalHeight,
    rotation
  );

  const rotateCanvas = document.createElement("canvas");
  rotateCanvas.width = rotW;
  rotateCanvas.height = rotH;
  const rotateCtx = rotateCanvas.getContext("2d");
  if (!rotateCtx) throw new Error("Canvas 2d context unavailable");
  drawRotated(rotateCtx, img, rotation);

  const { x, y, width, height } = pixelCrop;
  const outCanvas = document.createElement("canvas");
  outCanvas.width = Math.round(width);
  outCanvas.height = Math.round(height);
  const outCtx = outCanvas.getContext("2d");
  if (!outCtx) throw new Error("Canvas 2d context unavailable");
  outCtx.drawImage(
    rotateCanvas,
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

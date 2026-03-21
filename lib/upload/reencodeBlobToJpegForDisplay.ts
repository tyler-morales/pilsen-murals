/**
 * Decode a camera/file Blob and re-encode as JPEG so `<img>` and the crop UI can display it.
 * HEIC/HEIF from ImageCapture often fails to render in Chromium; this path fails fast so callers
 * can fall back (e.g. canvas frame from video).
 */

const JPEG_QUALITY = 0.9;

function loadImageFromObjectUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image decode failed"));
    img.src = url;
  });
}

/**
 * Loads the blob in an Image, draws to canvas, returns a JPEG Blob. Rejects if decode or encode fails.
 */
export async function reencodeBlobToJpegForDisplay(blob: Blob): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImageFromObjectUrl(url);
    if (img.naturalWidth === 0 || img.naturalHeight === 0) {
      throw new Error("Image has zero dimensions");
    }
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2d context unavailable");
    ctx.drawImage(img, 0, 0);
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        "image/jpeg",
        JPEG_QUALITY
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

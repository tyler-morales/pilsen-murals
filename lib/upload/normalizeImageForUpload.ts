/**
 * Client-side image normalization for /api/search uploads.
 * Downscales and re-encodes to JPEG so gallery images stay under server body limits (e.g. Vercel 4.5MB).
 */

const NORMALIZE_MAX_LONG_EDGE = 1600;
const JPEG_QUALITY = 0.9;

/**
 * Load file as image, draw to canvas (max long edge 1600px), re-encode as JPEG.
 * Rejects if the image cannot be decoded.
 */
export function normalizeImageForUpload(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const scale =
        w > h
          ? Math.min(1, NORMALIZE_MAX_LONG_EDGE / w)
          : Math.min(1, NORMALIZE_MAX_LONG_EDGE / h);
      const cw = Math.round(w * scale);
      const ch = Math.round(h * scale);
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("No canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0, cw, ch);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
        "image/jpeg",
        JPEG_QUALITY
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };
    img.src = url;
  });
}

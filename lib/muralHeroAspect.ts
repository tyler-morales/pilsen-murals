/**
 * Modal hero image aspect ratio utilities.
 * Clamps aspect ratios to reasonable bounds for the modal display.
 */
import { parsePx } from "@/lib/imageMetadata";
import type { Mural } from "@/types/mural";

export const MODAL_ASPECT_MIN = 9 / 16;
export const MODAL_ASPECT_MAX = 2;
export const MODAL_ASPECT_DEFAULT = 4 / 5;

/**
 * Clamp an aspect ratio to the modal's allowed range.
 */
export function clampModalAspectRatio(ratio: number): number {
  return Math.max(MODAL_ASPECT_MIN, Math.min(MODAL_ASPECT_MAX, ratio));
}

/**
 * Get modal hero aspect ratio from mural metadata.
 * Falls back to default if metadata is missing or invalid.
 */
export function getModalImageAspectRatio(mural: Mural): number {
  const w = parsePx(mural.imageMetadata?.Width);
  const h = parsePx(mural.imageMetadata?.Height);
  if (w != null && h != null && h > 0) {
    const ratio = w / h;
    return clampModalAspectRatio(ratio);
  }
  return MODAL_ASPECT_DEFAULT;
}

/**
 * Compute clamped aspect ratio from natural image dimensions.
 * Returns null if dimensions are invalid.
 */
export function aspectRatioFromDimensions(
  width: number,
  height: number
): number | null {
  if (width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  return clampModalAspectRatio(width / height);
}

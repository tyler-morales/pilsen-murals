/**
 * Marker entrance animation: delay/stagger math and transform helpers.
 * Used by MuralMarker for drop+fade reveal; constants shared with MuralMap for stagger.
 */

export const REVEAL_DURATION_MS = 220;
export const DIM_LIFT_DURATION_MS = 180;
export const LIFT_TRANSLATE_PX = -8;
/** Vertical offset (px) for entrance: marker starts 10px lower then animates to final position. */
export const DROP_OFFSET_PX = 10;

export const REVEAL_STAGGER_MS = 28;
export const MARKER_CHUNK_SIZE = 8;

export interface CardOffset {
  rotationDeg: number;
  translateX: number;
  translateY: number;
}

/**
 * Staggered delay in ms for the i-th marker (per-chunk stagger so not all animate at once).
 */
export function getRevealDelay(
  index: number,
  chunkSize: number = MARKER_CHUNK_SIZE,
  staggerMs: number = REVEAL_STAGGER_MS
): number {
  return (index % chunkSize) * staggerMs;
}

/**
 * CSS transform for the marker wrapper: rotation + card nudge, plus optional drop (translateY) when not yet visible.
 */
export function getEntranceTransform(
  offset: CardOffset,
  visible: boolean,
  dropPx: number = DROP_OFFSET_PX
): string {
  const { rotationDeg, translateX, translateY } = offset;
  const base = `rotate(${rotationDeg}deg) translate(${translateX}px, ${translateY}px)`;
  if (visible) return base;
  return `translateY(${dropPx}px) ${base}`;
}

/**
 * Lift transform for hover/focus (slight raise). Returns "none" when not lifted or when reduced motion.
 */
export function getLiftTransform(
  isLifted: boolean,
  prefersReducedMotion: boolean
): string {
  if (!isLifted || prefersReducedMotion) return "none";
  return `translateY(${LIFT_TRANSLATE_PX}px)`;
}

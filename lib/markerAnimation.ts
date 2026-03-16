/**
 * Marker entrance animation: delay/stagger math and transform helpers.
 * Used by MuralMarker for drop+fade reveal; constants shared with MuralMap for stagger.
 */

export const REVEAL_DURATION_MS = 220;
export const EXIT_DURATION_MS = 200;
export const DIM_LIFT_DURATION_MS = 180;
export const LIFT_TRANSLATE_PX = -8;
/** Vertical offset (px) for entrance: marker starts 10px lower then animates to final position. */
export const DROP_OFFSET_PX = 10;
/** Scale at start of entrance (bounce-in). */
export const ENTRANCE_SCALE_MIN = 0.92;

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
 * CSS transform for the marker wrapper: rotation + card nudge, plus optional drop (translateY) and scale when not yet visible (bounce-in).
 * When prefersReducedMotion is true, scale is omitted so only opacity/drop animate.
 */
export function getEntranceTransform(
  offset: CardOffset,
  visible: boolean,
  dropPx: number = DROP_OFFSET_PX,
  prefersReducedMotion: boolean = false
): string {
  const { rotationDeg, translateX, translateY } = offset;
  const base = `rotate(${rotationDeg}deg) translate(${translateX}px, ${translateY}px)`;
  if (visible) return base;
  const scale = prefersReducedMotion ? "" : `scale(${ENTRANCE_SCALE_MIN}) `;
  return `${scale}translateY(${dropPx}px) ${base}`;
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

/**
 * Scale transform for exit animation (fade-out + slight shrink). Use with opacity transition.
 */
export function getExitScale(prefersReducedMotion: boolean): number {
  return prefersReducedMotion ? 1 : 0.96;
}

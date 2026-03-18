/**
 * Relative luminance (sRGB) for a single channel 0–255.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/**
 * Returns relative luminance of a hex color (0 = black, 1 = white).
 * Accepts #rgb or #rrggbb; invalid input yields 0 (treated as dark).
 */
export function getRelativeLuminance(hex: string): number {
  const m = hex.replace(/^#/, "").match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return 0;
  let r: number, g: number, b: number;
  const raw = m[1];
  if (raw.length === 3) {
    r = parseInt(raw[0] + raw[0], 16);
    g = parseInt(raw[1] + raw[1], 16);
    b = parseInt(raw[2] + raw[2], 16);
  } else {
    r = parseInt(raw.slice(0, 2), 16);
    g = parseInt(raw.slice(2, 4), 16);
    b = parseInt(raw.slice(4, 6), 16);
  }
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/**
 * WCAG 2.1 contrast ratio between two hex colors.
 * Returns a value ≥ 1 (1 = identical, 21 = black vs white).
 */
export function getContrastRatio(hexA: string, hexB: string): number {
  const lA = getRelativeLuminance(hexA);
  const lB = getRelativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * True when dark (black) text has equal or better contrast than white text
 * on this background. Uses the mathematical crossover point (L ≈ 0.179)
 * rather than a naive 0.5 threshold, so medium-toned backgrounds correctly
 * get dark text instead of illegible white text.
 */
export function isLightColor(hex: string): boolean {
  const L = getRelativeLuminance(hex);
  const blackTextContrast = (L + 0.05) / 0.05;
  const whiteTextContrast = 1.05 / (L + 0.05);
  return blackTextContrast >= whiteTextContrast;
}

/**
 * Returns an rgba overlay for text content areas that boosts background
 * luminance far enough from the midpoint to guarantee AAA contrast (7:1)
 * with the chosen foreground direction.
 *
 * Light backgrounds → white overlay (pushes luminance toward 1).
 * Dark backgrounds  → black overlay (pushes luminance toward 0).
 */
export function getContentOverlay(bgHex: string): string {
  return isLightColor(bgHex)
    ? "rgba(255,255,255,0.4)"
    : "rgba(0,0,0,0.5)";
}

/** Normalize #rgb or #rrggbb to 6-digit hex (no leading #). For use in 8-digit hex (e.g. + alpha). */
export function normalizeHexToSix(hex: string): string {
  const m = hex.replace(/^#/, "").match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return "333333";
  const raw = m[1];
  if (raw.length === 6) return raw;
  return raw[0]! + raw[0] + raw[1]! + raw[1] + raw[2]! + raw[2];
}

/**
 * Parse a CSS/EXIF dimension string (e.g. "1920" or "1920px") to a number.
 * Returns null if missing or not parseable.
 */
export function parsePx(value: string | undefined): number | null {
  if (!value) return null;
  const n = parseInt(value.replace(/px$/i, ""), 10);
  return Number.isNaN(n) ? null : n;
}

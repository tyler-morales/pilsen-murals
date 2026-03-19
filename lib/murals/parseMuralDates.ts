/**
 * Date parsing for mural submit form: dateCaptured (ISO), datePainted (YYYY-MM-DD).
 * Used by POST /api/murals/submit and tests.
 */
export function parseDateCaptured(value: unknown): string {
  if (value == null || typeof value !== "string" || !value.trim()) return new Date().toISOString();
  const trimmed = value.trim();
  const date = new Date(trimmed);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

export function parseDatePainted(value: unknown): string | null {
  if (value == null || typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(parseInt(y!, 10), parseInt(m!, 10) - 1, parseInt(d!, 10));
  return Number.isFinite(date.getTime()) ? trimmed : null;
}

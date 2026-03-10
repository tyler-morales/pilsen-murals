/**
 * Group search hits by mural id (payload.id), keep best score per mural, return top N murals.
 * Used by POST /api/search so each returned item is one mural with its best score.
 */
export function groupByMuralId(
  points: Array<{ id: unknown; score: number; payload?: Record<string, unknown> | null }>,
  topK: number
): Array<{ id: string; score: number; payload: Record<string, unknown> }> {
  const byId = new Map<string, { score: number; payload: Record<string, unknown> }>();
  for (const point of points) {
    const muralId =
      typeof point.payload?.id === "string"
        ? (point.payload.id as string)
        : String(point.id);
    const existing = byId.get(muralId);
    if (!existing || point.score > existing.score) {
      byId.set(muralId, {
        score: point.score,
        payload: (point.payload ?? {}) as Record<string, unknown>,
      });
    }
  }
  return Array.from(byId.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, topK)
    .map(([id, { score, payload }]) => ({ id, score, payload }));
}

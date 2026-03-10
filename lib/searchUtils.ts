export interface SearchResultPoint {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

/**
 * Group search hits by mural id (payload.id), keep best score per mural, return top N murals.
 * Used when a single representative per mural is needed (e.g. legacy or other consumers).
 */
export function groupByMuralId(
  points: Array<{ id: unknown; score: number; payload?: Record<string, unknown> | null }>,
  topK: number
): SearchResultPoint[] {
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

/**
 * Bucket results by mural id for stack/single card UI. Each bucket is ordered by score desc.
 * Single = one item; stack = two or more items (same mural id).
 */
export function bucketResultsByMuralId<T extends { id: string; score: number }>(
  results: T[],
  options?: { maxBuckets?: number }
): Array<{ muralId: string; items: T[] }> {
  const maxBuckets = options?.maxBuckets ?? results.length;
  const byId = new Map<string, T[]>();
  for (const r of results) {
    const list = byId.get(r.id) ?? [];
    list.push(r);
    byId.set(r.id, list);
  }
  return Array.from(byId.entries())
    .map(([muralId, items]) => ({
      muralId,
      items: items.slice().sort((a, b) => b.score - a.score),
    }))
    .sort((a, b) => (b.items[0]?.score ?? 0) - (a.items[0]?.score ?? 0))
    .slice(0, maxBuckets);
}

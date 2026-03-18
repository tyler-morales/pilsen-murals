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

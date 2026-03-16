import type { Mural } from "@/types/mural";

/** GeoJSON point feature for supercluster; properties.muralId links back to Mural. */
export function muralToPoint(
  mural: Mural
): GeoJSON.Feature<GeoJSON.Point, { muralId: string }> {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: mural.coordinates },
    properties: { muralId: mural.id },
  };
}

export interface Placement {
  center: [number, number];
  murals: Mural[];
}

/** One placement per leaf (one marker per mural). Overlapping placements are spread via spreadOverlappingPlacements. */
export function groupLeavesIntoPlacements(
  leaves: { mural: Mural; coordinates: [number, number] }[]
): Placement[] {
  if (leaves.length === 0) return [];
  return leaves.map((l) => ({ center: l.coordinates, murals: [l.mural] }));
}

/** When zoomed in, placements with the same or very close center are spread in a circle (screen space) so each marker is clickable. */
export function spreadOverlappingPlacements(
  placements: Placement[],
  project: (coords: [number, number]) => { x: number; y: number },
  unproject: (point: { x: number; y: number }) => [number, number],
  spreadRadiusPx: number = 55
): void {
  const key = (c: [number, number]) =>
    `${Math.round(c[0] * 1e5)}_${Math.round(c[1] * 1e5)}`;
  const byKey = new Map<string, Placement[]>();
  for (const p of placements) {
    const k = key(p.center);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(p);
  }
  for (const group of byKey.values()) {
    if (group.length <= 1) continue;
    const center = group[0].center;
    const screen = project(center);
    group.forEach((p, i) => {
      const angle = (2 * Math.PI * i) / group.length;
      const x = screen.x + spreadRadiusPx * Math.cos(angle);
      const y = screen.y + spreadRadiusPx * Math.sin(angle);
      p.center = unproject({ x, y });
    });
  }
}

/** Group leaves by same/similar map position into stacked placements (one marker per location, multiple murals). */
export function groupLeavesIntoStackedPlacements(
  leaves: { mural: Mural; coordinates: [number, number] }[],
  project: (coords: [number, number]) => { x: number; y: number },
  _unproject: (point: { x: number; y: number }) => [number, number],
  _stackRadiusPx: number = 55
): Placement[] {
  if (leaves.length === 0) return [];
  const key = (c: [number, number]) =>
    `${Math.round(c[0] * 1e5)}_${Math.round(c[1] * 1e5)}`;
  const byKey = new Map<string, { center: [number, number]; murals: Mural[] }>();
  for (const l of leaves) {
    const k = key(l.coordinates);
    if (!byKey.has(k)) {
      byKey.set(k, { center: l.coordinates, murals: [] });
    }
    byKey.get(k)!.murals.push(l.mural);
  }
  return Array.from(byKey.values()).map(({ center, murals }) => ({
    center,
    murals,
  }));
}

/** Screen-space offsets (px) for fanout layout: n items on a circle. Used when a stack is expanded (hover/focus). */
export function getFanoutScreenOffsets(
  count: number,
  radiusPx: number
): { x: number; y: number }[] {
  if (count <= 0) return [];
  if (count === 1 || radiusPx <= 0) return Array(count).fill({ x: 0, y: 0 });
  const result: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count;
    result.push({
      x: Math.round(radiusPx * Math.cos(angle)),
      y: Math.round(radiusPx * Math.sin(angle)),
    });
  }
  return result;
}

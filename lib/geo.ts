import type { Mural } from "@/types/mural";

/** Earth radius in meters for Haversine. */
const R = 6_371_000;

/**
 * Haversine distance between two [lng, lat] points in meters.
 */
export function haversineDistanceMeters(
  a: [number, number],
  b: [number, number]
): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const x =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

/** Default radius (meters) for mural geofence. */
export const GEOFENCE_RADIUS_M = 80;

/**
 * Returns murals whose center is within radiusM meters of userCoords, sorted by distance (closest first).
 */
export function getMuralsWithinRadius(
  userCoords: [number, number],
  murals: Mural[],
  radiusM: number = GEOFENCE_RADIUS_M
): Mural[] {
  const withDist = murals
    .map((m) => ({ mural: m, dist: haversineDistanceMeters(userCoords, m.coordinates) }))
    .filter(({ dist }) => dist <= radiusM)
    .sort((a, b) => a.dist - b.dist);
  return withDist.map(({ mural }) => mural);
}

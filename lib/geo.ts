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
export const GEOFENCE_RADIUS_M = 100;

/**
 * Destination point from start [lng, lat], bearing in degrees (0 = north, 90 = east), distance in meters.
 * Uses spherical Earth (same R as Haversine).
 */
export function destinationPoint(
  start: [number, number],
  bearingDeg: number,
  distanceM: number
): [number, number] {
  const [lng1, lat1] = start;
  const φ1 = (lat1 * Math.PI) / 180;
  const λ1 = (lng1 * Math.PI) / 180;
  const θ = (bearingDeg * Math.PI) / 180;
  const δ = distanceM / R;
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
    );
  return [(λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI];
}

/**
 * GeoJSON Polygon approximating a circle in meters around center [lng, lat].
 * Single ring, first point repeated at end. segments defaults to 64.
 */
export function circlePolygon(
  center: [number, number],
  radiusM: number,
  segments = 64
): GeoJSON.Polygon {
  const ring: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const bearingDeg = (i / segments) * 360;
    ring.push(destinationPoint(center, bearingDeg, radiusM));
  }
  return { type: "Polygon", coordinates: [ring] };
}

export interface MuralWithDistance {
  mural: Mural;
  distanceM: number;
}

/**
 * Returns murals whose center is within radiusM meters of userCoords, sorted by distance (closest first).
 */
export function getMuralsWithinRadius(
  userCoords: [number, number],
  murals: Mural[],
  radiusM: number = GEOFENCE_RADIUS_M
): Mural[] {
  return getMuralsWithinRadiusWithDistance(userCoords, murals, radiusM).map(
    (entry) => entry.mural
  );
}

/**
 * Like getMuralsWithinRadius but returns mural + distanceM for each entry.
 */
export function getMuralsWithinRadiusWithDistance(
  userCoords: [number, number],
  murals: Mural[],
  radiusM: number = GEOFENCE_RADIUS_M
): MuralWithDistance[] {
  return murals
    .map((m) => ({
      mural: m,
      distanceM: haversineDistanceMeters(userCoords, m.coordinates),
    }))
    .filter(({ distanceM }) => distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM);
}

const M_TO_FT = 3.28084;

/**
 * Format distance for display: "~25 m away" or "~80 ft away".
 * Uses locale to prefer feet for US (en-US), meters otherwise.
 */
export function formatDistance(meters: number, locale?: string): string {
  const m = Math.max(0, meters);
  const loc = locale ?? (typeof navigator !== "undefined" ? navigator.language : "en");
  const useFeet = /^en-US$/i.test(loc);
  if (useFeet) {
    const ft = Math.round(m * M_TO_FT);
    const rounded = ft < 50 ? Math.round(ft / 10) * 10 : Math.round(ft / 25) * 25;
    return `~${rounded} ft away`;
  }
  const rounded = m < 50 ? Math.round(m / 5) * 5 : Math.round(m / 10) * 10;
  return `~${rounded} m away`;
}

const CARDINAL_NAMES = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
] as const;

/**
 * Convert bearing in degrees (0 = north, 90 = east) to "Face north", "Face east", etc.
 */
export function bearingToDirectionText(degrees: number): string {
  const normalized = ((Math.round(degrees) % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % 8;
  const dir = CARDINAL_NAMES[index];
  return `Face ${dir.replace("-", " ")}`;
}

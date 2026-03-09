import type { Mural } from "@/types/mural";

/**
 * Google Maps URL for directions using mural coordinates (lat,lng).
 * Opens in browser; on mobile often opens the Maps app.
 */
export function getDirectionsUrl(mural: Mural): string {
  const [lng, lat] = mural.coordinates;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/**
 * geo: URI for opening the system map app (e.g. Apple Maps, Google Maps).
 * Use as href for a link; mobile OS may open native maps.
 */
export function getDirectionsGeoUri(mural: Mural): string {
  const [lng, lat] = mural.coordinates;
  return `geo:${lat},${lng}`;
}

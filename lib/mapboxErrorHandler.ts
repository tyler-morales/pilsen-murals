/**
 * Non-critical Mapbox layers that may 403 due to token scope; map works without them.
 */
const NON_CRITICAL_LAYER_PATTERNS = ["bathymetry"];

function isNonCritical403(error: { status?: number; url?: string }): boolean {
  if (error.status !== 403) return false;
  const url = typeof error.url === "string" ? error.url : "";
  return NON_CRITICAL_LAYER_PATTERNS.some((p) => url.toLowerCase().includes(p));
}

/**
 * Detects if a Mapbox error is a tile authentication failure (403 on tile/style URLs).
 * Returns true for 403s on api.mapbox.com/v4/... or styles.mapbox.com URLs, excluding
 * non-critical layers like bathymetry.
 */
export function isMapboxTileAuthFailure(error: {
  status?: number;
  url?: string;
}): boolean {
  if (error.status !== 403) return false;
  if (isNonCritical403(error)) return false;
  const url = typeof error.url === "string" ? error.url : "";
  return (
    url.includes("api.mapbox.com/v4/") ||
    url.includes("styles.mapbox.com") ||
    url.includes("api.mapbox.com/styles/")
  );
}

/**
 * Attach an error handler to a Mapbox Map that suppresses 403s for non-critical
 * layers (e.g. bathymetry) and logs all other errors.
 */
export function attachMapboxErrorHandler(
  map: import("mapbox-gl").Map
): void {
  map.on("error", (e: { error: { status?: number; url?: string; message?: string } }) => {
    const err = e.error;
    if (isNonCritical403(err)) return;
    console.error(err?.message || err);
  });
}

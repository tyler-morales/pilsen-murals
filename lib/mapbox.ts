const MAPBOX_CSS_HREF = "/mapbox-gl.css";

/** Mapbox style URLs shared by MuralMap, MuralModal minimap, and LocationConfirm. */
export const MAPBOX_STYLE_URLS = {
  standard: "mapbox://styles/mapbox/standard",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
} as const;

let mapboxCSSPromise: Promise<void> | null = null;

/**
 * Ensures Mapbox GL CSS is loaded once. Resolves when the stylesheet is ready.
 * Call before constructing a Mapbox Map to avoid the "missing CSS" warning.
 */
export function ensureMapboxCSS(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  const existing = document.querySelector(`link[href="${MAPBOX_CSS_HREF}"]`) as HTMLLinkElement | null;
  if (existing) {
    if (existing.sheet?.cssRules?.length) return Promise.resolve();
    return new Promise((resolve) => {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => resolve());
    });
  }
  if (mapboxCSSPromise) return mapboxCSSPromise;
  mapboxCSSPromise = new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = MAPBOX_CSS_HREF;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
  return mapboxCSSPromise;
}

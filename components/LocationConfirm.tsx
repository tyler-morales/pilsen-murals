"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { ensureMapboxCSS, MAPBOX_STYLE_URLS } from "@/lib/mapbox";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const STYLE_STANDARD = MAPBOX_STYLE_URLS.standard;
const STYLE_SATELLITE = MAPBOX_STYLE_URLS.satellite;
const INITIAL_ZOOM = 17;

export interface LocationConfirmProps {
  /** Initial center [lng, lat] (e.g. user GPS). */
  initialCenter: [number, number];
  /** Object URL of the captured photo for the pin preview. */
  photoPreviewUrl: string | null;
  /** When true, confirm button is disabled (submitting). */
  isSubmitting?: boolean;
  onConfirm: (coords: [number, number]) => void;
  onBack: () => void;
}

export function LocationConfirm({
  initialCenter,
  photoPreviewUrl,
  isSubmitting = false,
  onConfirm,
  onBack,
}: LocationConfirmProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("mapbox-gl").Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapStyle, setMapStyle] = useState<"standard" | "satellite">("satellite");

  useEffect(() => {
    if (!containerRef.current || !MAPBOX_TOKEN) return;
    const container = containerRef.current;
    let cancelled = false;

    void ensureMapboxCSS().then(() =>
      import("mapbox-gl").then((mapboxglModule) => {
        if (cancelled || !container) return;
        const mapboxgl = mapboxglModule.default;
        const styleUrl = mapStyle === "satellite" ? STYLE_SATELLITE : STYLE_STANDARD;
        const map = new mapboxgl.Map({
          container,
          style: styleUrl,
          center: initialCenter,
          zoom: INITIAL_ZOOM,
          pitch: 0,
          bearing: 0,
          accessToken: MAPBOX_TOKEN,
          interactive: true,
        });
        map.addControl(
          new mapboxgl.NavigationControl({ showZoom: true, showCompass: true, visualizePitch: false }),
          "top-right"
        );
        map.on("load", () => {
          if (cancelled) return;
          mapRef.current = map;
          setMapReady(true);
        });
      }));

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      setMapReady(false);
    };
  }, [initialCenter[0], initialCenter[1], mapStyle]);

  const handleConfirm = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const center = map.getCenter();
    onConfirm([center.lng, center.lat]);
  }, [onConfirm]);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-zinc-600" id="location-confirm-instruction">
        Drag the map to position the pin on the mural&apos;s location.
      </p>
      <div className="relative w-full overflow-hidden rounded-xl bg-zinc-100" style={{ minHeight: 320 }}>
        <div
          ref={containerRef}
          className="h-full w-full"
          style={{ minHeight: 320 }}
          aria-label="Map to adjust mural location"
        />
        {/* Fixed center pin with photo preview */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full"
          aria-hidden
        >
          <div className="flex flex-col items-center">
            <div className="h-12 w-12 overflow-hidden rounded-full border-2 border-white bg-zinc-200 shadow-lg ring-2 ring-amber-500">
              {photoPreviewUrl ? (
                <img
                  src={photoPreviewUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="block h-full w-full" />
              )}
            </div>
            <div className="mt-0.5 h-4 w-2 shrink-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-amber-500" />
          </div>
        </div>
        {/* Style toggle */}
        <div className="absolute right-2 top-2 z-10">
          <button
            type="button"
            onClick={() => setMapStyle((s) => (s === "satellite" ? "standard" : "satellite"))}
            className="rounded-lg border border-zinc-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
            aria-label={mapStyle === "satellite" ? "Switch to map view" : "Switch to satellite view"}
            aria-pressed={mapStyle === "satellite"}
          >
            {mapStyle === "satellite" ? "Map" : "Satellite"}
          </button>
        </div>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] flex-1 rounded-xl border-2 border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
          aria-label="Back to previous step"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!mapReady || isSubmitting}
          className="min-h-[44px] flex-1 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-green-600 bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={isSubmitting ? "Submitting mural…" : "Confirm this location and submit mural"}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              Submitting…
            </>
          ) : (
            "Confirm location"
          )}
        </button>
      </div>
    </div>
  );
}

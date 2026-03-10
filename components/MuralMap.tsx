"use client";

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import Supercluster from "supercluster";
import { MuralMarker } from "./MuralMarker";
import { ClusterMarker } from "./ClusterMarker";
import { useLocationStore } from "@/store/locationStore";
import { useMuralStore } from "@/store/muralStore";
import { useMapStore } from "@/store/mapStore";
import { useThemeStore } from "@/store/themeStore";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { getRevealDelay } from "@/lib/markerAnimation";
import {
  groupLeavesIntoPlacements,
  muralToPoint,
  spreadOverlappingPlacements,
  type Placement,
} from "@/lib/markerPlacement";
import { GEOFENCE_RADIUS_M, circlePolygon } from "@/lib/geo";
import pilsenBoundary from "@/data/pilsen-boundary.json";
import type { Mural } from "@/types/mural";
import type { MapLightPreset } from "@/store/themeStore";
import type { MapStyleKind } from "@/store/mapStore";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

const STYLE_URLS: Record<MapStyleKind, string> = {
  standard: "mapbox://styles/mapbox/standard",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
};

const FLY_OPTIONS = {
  zoom: 17,
  pitch: 60,
  duration: 2000,
  essential: true,
} as const;

/** Pitch when flying to user location (keep 3D perspective, not flat birds-eye). */
const ZOOM_TO_USER_PITCH = 50;

function applyLightPreset(
  map: import("mapbox-gl").Map,
  preset: MapLightPreset
): void {
  try {
    map.setConfigProperty("basemap", "lightPreset", preset);
  } catch {
    // Style may not support config (e.g. not loaded yet)
  }
}

/** Minimal fit-to-bounds icon (24×24 viewBox, 14px display). */
const FIT_ICON_SVG =
  '<svg class="mapboxgl-ctrl-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>';

/**
 * Custom Mapbox IControl: Fit map to murals (official icon, centered).
 */
function createFitMapControl(getCoords: () => [number, number][]) {
  return class FitMapControl {
    onAdd(_map: import("mapbox-gl").Map) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mapboxgl-ctrl-toolbar-btn mapboxgl-ctrl-fit-map";
      btn.setAttribute("aria-label", "Fit map to all murals");
      btn.setAttribute("title", "Fit map");
      btn.innerHTML = FIT_ICON_SVG;
      btn.addEventListener("click", () => {
        const coords = getCoords();
        if (coords.length) useMapStore.getState().requestFitBounds(coords);
      });
      const container = document.createElement("div");
      container.className = "mapboxgl-ctrl mapboxgl-ctrl-group";
      container.appendChild(btn);
      return container;
    }
    onRemove() { }
  };
}

/** Minimal satellite/globe icon (24×24 viewBox, 14px display). */
const SATELLITE_ICON_SVG =
  '<svg class="mapboxgl-ctrl-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><ellipse cx="12" cy="12" rx="10" ry="4"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';

/** Custom control: satellite/standard style toggle. Button label and active state sync with store. */
function createStyleControl() {
  return class StyleControl {
    private unsubscribe: (() => void) | null = null;

    private updateButton(btn: HTMLButtonElement) {
      const mapStyle = useMapStore.getState().mapStyle;
      const isSatellite = mapStyle === "satellite";
      btn.setAttribute(
        "aria-label",
        isSatellite ? "Switch to map view" : "Switch to satellite map"
      );
      btn.setAttribute("title", isSatellite ? "Map view" : "Satellite");
      btn.setAttribute("aria-pressed", String(isSatellite));
      btn.dataset.styleActive = isSatellite ? "satellite" : "";
    }

    onAdd(_map: import("mapbox-gl").Map) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mapboxgl-ctrl-toolbar-btn mapboxgl-ctrl-style-custom";
      btn.setAttribute("aria-pressed", "false");
      btn.innerHTML = SATELLITE_ICON_SVG;
      this.updateButton(btn);
      btn.addEventListener("click", () => {
        const { mapStyle, setMapStyle } = useMapStore.getState();
        setMapStyle(mapStyle === "standard" ? "satellite" : "standard");
      });
      this.unsubscribe = useMapStore.subscribe(() => this.updateButton(btn));
      const container = document.createElement("div");
      container.className = "mapboxgl-ctrl mapboxgl-ctrl-group";
      container.appendChild(btn);
      return container;
    }
    onRemove() {
      this.unsubscribe?.();
      this.unsubscribe = null;
    }
  };
}

/** Heatmap icon: gradient/blur circles (24×24 viewBox, 14px display). */
const HEATMAP_ICON_SVG =
  '<svg class="mapboxgl-ctrl-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="14" r="3" opacity="0.8"/><circle cx="14" cy="10" r="4" opacity="0.6"/><circle cx="18" cy="16" r="2.5" opacity="0.9"/><circle cx="12" cy="6" r="2" opacity="0.5"/></svg>';

/** Custom control: toggle mural density heatmap. */
function createHeatmapControl() {
  return class HeatmapControl {
    private unsubscribe: (() => void) | null = null;

    private updateButton(btn: HTMLButtonElement) {
      const heatmapVisible = useMapStore.getState().heatmapVisible;
      btn.setAttribute("aria-label", heatmapVisible ? "Hide heatmap" : "Show heatmap");
      btn.setAttribute("title", heatmapVisible ? "Hide heatmap" : "Show heatmap");
      btn.setAttribute("aria-pressed", String(heatmapVisible));
    }

    onAdd(_map: import("mapbox-gl").Map) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mapboxgl-ctrl-toolbar-btn mapboxgl-ctrl-heatmap";
      btn.setAttribute("aria-pressed", "false");
      btn.innerHTML = HEATMAP_ICON_SVG;
      this.updateButton(btn);
      btn.addEventListener("click", () => {
        const { heatmapVisible, setHeatmapVisible } = useMapStore.getState();
        setHeatmapVisible(!heatmapVisible);
      });
      this.unsubscribe = useMapStore.subscribe(() => this.updateButton(btn));
      const container = document.createElement("div");
      container.className = "mapboxgl-ctrl mapboxgl-ctrl-group";
      container.appendChild(btn);
      return container;
    }
    onRemove() {
      this.unsubscribe?.();
      this.unsubscribe = null;
    }
  };
}

interface AllMarkersProps {
  wrappers: HTMLDivElement[];
  murals: Mural[];
  zoom: number;
  onClick: (mural: Mural) => void;
  prefersReducedMotion: boolean;
  showTourNumbers: boolean;
  nearbyMuralId: string | null;
}

function AllMarkers({
  wrappers,
  murals,
  zoom,
  onClick,
  prefersReducedMotion,
  showTourNumbers,
  nearbyMuralId,
}: AllMarkersProps) {
  return (
    <>
      {murals.map((mural, i) => {
        const wrapper = wrappers[i];
        if (!wrapper) return null;
        const revealDelay = getRevealDelay(i);
        const tourRole =
          showTourNumbers && murals.length > 1
            ? i === 0
              ? "start"
              : i === murals.length - 1
                ? "end"
                : undefined
            : undefined;
        return createPortal(
          <MuralMarker
            mural={mural}
            zoom={zoom}
            onClick={onClick}
            revealDelay={revealDelay}
            prefersReducedMotion={prefersReducedMotion}
            tourIndex={showTourNumbers ? i + 1 : undefined}
            tourRole={tourRole}
            isNearby={mural.id === nearbyMuralId}
          />,
          wrapper,
          mural.id
        );
      })}
    </>
  );
}

interface MarkerInstance {
  marker: import("mapbox-gl").Marker;
  wrapperEl: HTMLDivElement;
  mural: Mural;
}

interface PlacementInstance {
  marker: import("mapbox-gl").Marker;
  wrapperEl: HTMLDivElement;
  murals: Mural[];
}

type LeafMarkerRef = MarkerInstance | PlacementInstance;

interface PlacementMarkersProps {
  wrappers: HTMLDivElement[];
  placements: Placement[];
  zoom: number;
  onClick: (mural: Mural) => void;
  prefersReducedMotion: boolean;
  nearbyMuralId: string | null;
  hoveredMuralId: string | null;
  onHover: (muralId: string | null) => void;
}

function PlacementMarkers({
  wrappers,
  placements,
  zoom,
  onClick,
  prefersReducedMotion,
  nearbyMuralId,
  hoveredMuralId,
  onHover,
}: PlacementMarkersProps) {
  return (
    <>
      {placements.map((placement, i) => {
        const wrapper = wrappers[i];
        if (!wrapper) return null;
        const mural = placement.murals[0];
        if (!mural) return null;
        const revealDelay = getRevealDelay(i);
        const isHovered = hoveredMuralId === mural.id;
        return createPortal(
          <MuralMarker
            mural={mural}
            zoom={zoom}
            onClick={onClick}
            revealDelay={revealDelay}
            prefersReducedMotion={prefersReducedMotion}
            isNearby={mural.id === nearbyMuralId}
            isDimmed={hoveredMuralId != null && !isHovered}
            isLifted={isHovered}
            onPointerEnter={() => onHover(mural.id)}
            onPointerLeave={() => onHover(null)}
          />,
          wrapper,
          mural.id
        );
      })}
    </>
  );
}

interface ClusterInstance {
  marker: import("mapbox-gl").Marker;
  root: ReturnType<typeof createRoot>;
}

const INITIAL_ZOOM = 14;

const CLUSTER_INDEX_OPTIONS = {
  radius: 100,
  maxZoom: 17,
  minPoints: 2,
};

const ROUTE_SOURCE_ID = "tour-route";
const ROUTE_LAYER_ID = "tour-route-line";

const USER_LOCATION_SOURCE_ID = "user-location";
const USER_LOCATION_LAYER_ID = "user-location-dot";

const GEOFENCE_SOURCE_ID = "geofence-radius";
const GEOFENCE_FILL_LAYER_ID = "geofence-radius-fill";
const GEOFENCE_LINE_LAYER_ID = "geofence-radius-line";

const PILSEN_BOUNDARY_SOURCE_ID = "pilsen-boundary";
const PILSEN_BOUNDARY_FILL_LAYER_ID = "pilsen-boundary-fill";
const PILSEN_BOUNDARY_LINE_LAYER_ID = "pilsen-boundary-line";

const MURALS_HEATMAP_SOURCE_ID = "murals-heatmap";
const MURALS_HEATMAP_LAYER_ID = "murals-heatmap-layer";

function muralsToHeatmapGeoJSON(murals: Mural[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: murals.map((m) => ({
      type: "Feature" as const,
      properties: {},
      geometry: { type: "Point" as const, coordinates: m.coordinates },
    })),
  };
}

/** Add or update heatmap source and layer; visibility driven by store. Call after addCustomSourcesAndLayers. */
function addHeatmapLayer(
  map: import("mapbox-gl").Map,
  murals: Mural[],
  heatmapVisible: boolean
): void {
  if (murals.length === 0) return;
  const data = muralsToHeatmapGeoJSON(murals);
  const existingSource = map.getSource(MURALS_HEATMAP_SOURCE_ID) as import("mapbox-gl").GeoJSONSource | undefined;
  if (existingSource) {
    existingSource.setData(data);
    if (map.getLayer(MURALS_HEATMAP_LAYER_ID)) {
      map.setLayoutProperty(
        MURALS_HEATMAP_LAYER_ID,
        "visibility",
        heatmapVisible ? "visible" : "none"
      );
    }
    return;
  }
  map.addSource(MURALS_HEATMAP_SOURCE_ID, { type: "geojson", data });
  map.addLayer({
    id: MURALS_HEATMAP_LAYER_ID,
    type: "heatmap",
    source: MURALS_HEATMAP_SOURCE_ID,
    paint: {
      "heatmap-weight": 1,
      "heatmap-intensity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        10,
        0.5,
        14,
        1.5,
        16,
        2,
        18,
        2,
      ],
      "heatmap-color": [
        "interpolate",
        ["linear"],
        ["heatmap-density"],
        0,
        "rgba(99, 102, 241, 0)",
        0.25,
        "rgba(99, 102, 241, 0.4)",
        0.5,
        "rgba(139, 92, 246, 0.5)",
        0.75,
        "rgba(217, 119, 6, 0.6)",
        1,
        "rgba(178, 24, 43, 0.7)",
      ],
      "heatmap-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        10,
        8,
        14,
        14,
        16,
        24,
        18,
        28,
      ],
      "heatmap-opacity": 0.65,
    },
    layout: { visibility: heatmapVisible ? "visible" : "none" },
  });
}

/** Re-apply custom sources and layers after map load or style change (e.g. Standard ↔ Satellite). */
function addCustomSourcesAndLayers(
  map: import("mapbox-gl").Map,
  routeCoordinates: [number, number][] | null,
  userCoords: [number, number] | null
): void {
  const emptyFC = { type: "FeatureCollection" as const, features: [] };
  if (map.getSource(GEOFENCE_SOURCE_ID)) return;

  map.addSource(PILSEN_BOUNDARY_SOURCE_ID, {
    type: "geojson",
    data: pilsenBoundary as GeoJSON.FeatureCollection,
  });
  map.addLayer({
    id: PILSEN_BOUNDARY_FILL_LAYER_ID,
    type: "fill",
    source: PILSEN_BOUNDARY_SOURCE_ID,
    paint: {
      "fill-color": "#6366f1",
      "fill-opacity": 0.08,
    },
  });
  map.addLayer({
    id: PILSEN_BOUNDARY_LINE_LAYER_ID,
    type: "line",
    source: PILSEN_BOUNDARY_SOURCE_ID,
    paint: {
      "line-color": "#4f46e5",
      "line-width": 2,
      "line-opacity": 0.7,
    },
  });

  map.addSource(GEOFENCE_SOURCE_ID, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: GEOFENCE_FILL_LAYER_ID,
    type: "fill",
    source: GEOFENCE_SOURCE_ID,
    paint: {
      "fill-color": "#22c55e",
      "fill-opacity": 0.18,
    },
  });
  map.addLayer({
    id: GEOFENCE_LINE_LAYER_ID,
    type: "line",
    source: GEOFENCE_SOURCE_ID,
    paint: {
      "line-color": "#16a34a",
      "line-width": 1.5,
      "line-opacity": 0.5,
    },
  });
  map.addSource(USER_LOCATION_SOURCE_ID, {
    type: "geojson",
    data: userCoords
      ? {
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: userCoords },
      }
      : emptyFC,
  });
  map.addLayer({
    id: USER_LOCATION_LAYER_ID,
    type: "circle",
    source: USER_LOCATION_SOURCE_ID,
    paint: {
      "circle-radius": 8,
      "circle-color": "#4285F4",
      "circle-stroke-width": 2,
      "circle-stroke-color": "#fff",
    },
  });
  if (routeCoordinates && routeCoordinates.length >= 2) {
    map.addSource(ROUTE_SOURCE_ID, {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: routeCoordinates },
      },
    });
    map.addLayer({
      id: ROUTE_LAYER_ID,
      type: "line",
      source: ROUTE_SOURCE_ID,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#d97706",
        "line-width": 4,
        "line-opacity": 0.9,
      },
    });
  }
  const geofenceSource = map.getSource(GEOFENCE_SOURCE_ID) as import("mapbox-gl").GeoJSONSource | undefined;
  if (geofenceSource && userCoords) {
    geofenceSource.setData({
      type: "Feature",
      properties: {},
      geometry: circlePolygon(userCoords, GEOFENCE_RADIUS_M),
    });
  }
}

export function MuralMap({
  murals,
  showTourNumbers = false,
  routeCoordinates = null,
  nearbyMuralId = null,
}: {
  murals: Mural[];
  showTourNumbers?: boolean;
  routeCoordinates?: [number, number][] | null;
  nearbyMuralId?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("mapbox-gl").Map | null>(null);
  const markerRefsRef = useRef<LeafMarkerRef[]>([]);
  const clusterRefsRef = useRef<ClusterInstance[]>([]);
  const clusterIndexRef = useRef<Supercluster | null>(null);
  const singleRootRef = useRef<ReturnType<typeof createRoot> | null>(null);
  const markersRootContainerRef = useRef<HTMLDivElement | null>(null);
  const unsubThemeRef = useRef<(() => void) | null>(null);
  const nearbyMuralIdRef = useRef<string | null>(null);
  const updateMarkersRef = useRef<(() => void) | null>(null);
  const hasFlownToUserFromStoreRef = useRef(false);
  const mapStyleRef = useRef<MapStyleKind>(useMapStore.getState().mapStyle);
  const muralsCoordsRef = useRef<[number, number][]>([]);
  const [hoveredMuralId, setHoveredMuralId] = useState<string | null>(null);
  const setHoveredMuralIdRef = useRef(setHoveredMuralId);
  setHoveredMuralIdRef.current = setHoveredMuralId;
  const hoveredMuralIdRef = useRef<string | null>(null);
  useEffect(() => {
    hoveredMuralIdRef.current = hoveredMuralId;
  }, [hoveredMuralId]);

  const placementRenderPropsRef = useRef<{
    wrappers: HTMLDivElement[];
    placements: Placement[];
    zoom: number;
    onClick: (mural: Mural) => void;
    prefersReducedMotion: boolean;
    nearbyMuralId: string | null;
  } | null>(null);

  useEffect(() => {
    const props = placementRenderPropsRef.current;
    const root = singleRootRef.current;
    if (!props || !root) return;
    markerRefsRef.current.forEach((ref) => {
      const murals = "murals" in ref ? ref.murals : [ref.mural];
      const isHovered = murals.some((m) => m.id === hoveredMuralId);
      const isNearby = murals.some((m) => m.id === nearbyMuralIdRef.current);
      (ref.wrapperEl as HTMLDivElement).style.zIndex =
        isHovered || isNearby ? "1000" : "10";
    });
    root.render(
      <PlacementMarkers
        {...props}
        nearbyMuralId={nearbyMuralIdRef.current}
        hoveredMuralId={hoveredMuralId}
        onHover={(id) => setHoveredMuralIdRef.current?.(id)}
      />
    );
  }, [hoveredMuralId]);
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const [mapReady, setMapReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);

  /** Simplified Pilsen boundary path for loading SVG (from GeoJSON first ring, sampled and normalized). */
  const pilsenOutlinePath = useMemo(() => {
    const fc = pilsenBoundary as GeoJSON.FeatureCollection<GeoJSON.MultiPolygon>;
    const ring = fc?.features?.[0]?.geometry?.coordinates?.[0]?.[0];
    if (!ring?.length) return "";
    const step = Math.max(1, Math.floor(ring.length / 28));
    const sampled = ring.filter((_, i) => i % step === 0);
    const lngs = sampled.map((p) => p[0]);
    const lats = sampled.map((p) => p[1]);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const w = maxLng - minLng;
    const h = maxLat - minLat;
    if (w <= 0 || h <= 0) return "";
    const pad = 8;
    const x = (lng: number) => ((lng - minLng) / w) * (100 - 2 * pad) + pad;
    const y = (lat: number) => (1 - (lat - minLat) / h) * (100 - 2 * pad) + pad;
    return "M " + sampled.map(([lng, lat]) => `${x(lng)} ${y(lat)}`).join(" L ") + " Z";
  }, []);

  useEffect(() => {
    muralsCoordsRef.current = murals.map((m) => m.coordinates);
  }, [murals]);
  const mapStyle = useMapStore((s) => s.mapStyle);
  const heatmapVisible = useMapStore((s) => s.heatmapVisible);
  const openModal = useMuralStore((s) => s.openModal);
  const pendingFlyTo = useMuralStore((s) => s.pendingFlyTo);
  const clearPendingFlyTo = useMuralStore((s) => s.clearPendingFlyTo);
  const prefersReducedMotion = usePrefersReducedMotion();
  const flyDuration = prefersReducedMotion ? 0 : FLY_OPTIONS.duration;

  /** Animate load progress 0→90 quickly, then slow crawl 90→99 so the line never appears stuck (map.on("load") jumps to 100). */
  const loadProgressRafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!MAPBOX_TOKEN || mapReady) return;
    const start = Date.now();
    const phase1Ms = 2200; // 0 → 90%
    const phase2Ms = 4000; // 90 → 99% over 4s so slow loads still show movement
    const targetCap = 99;
    const tick = () => {
      const elapsed = Date.now() - start;
      let p: number;
      if (elapsed < phase1Ms) {
        p = (elapsed / phase1Ms) * 90;
      } else {
        const phase2Elapsed = elapsed - phase1Ms;
        const crawl = Math.min(9, (phase2Elapsed / phase2Ms) * 9);
        p = 90 + crawl;
      }
      p = Math.min(targetCap, p);
      setLoadProgress(p);
      if (p < targetCap) {
        loadProgressRafRef.current = requestAnimationFrame(tick);
      }
    };
    loadProgressRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (loadProgressRafRef.current != null) {
        cancelAnimationFrame(loadProgressRafRef.current);
        loadProgressRafRef.current = null;
      }
    };
  }, [mapReady]);

  const handleMarkerClick = useCallback(
    (mural: Mural) => {
      const map = mapRef.current;
      if (!map) return;

      const bearing = typeof mural.bearing === "number" ? mural.bearing : 0;
      map.flyTo({
        center: mural.coordinates,
        zoom: FLY_OPTIONS.zoom,
        pitch: FLY_OPTIONS.pitch,
        bearing,
        duration: flyDuration,
        essential: FLY_OPTIONS.essential,
      });

      map.once("moveend", () => {
        map.setBearing(bearing);
        openModal(mural, murals);
      });
    },
    [openModal, murals, flyDuration]
  );

  useEffect(() => {
    if (!containerRef.current || !MAPBOX_TOKEN) return;
    setMapReady(false);
    setLoadProgress(0);

    const points = murals.map(muralToPoint);
    const index = new Supercluster(CLUSTER_INDEX_OPTIONS);
    index.load(points);
    clusterIndexRef.current = index;

    // Dynamic import so Mapbox (window-dependent) only runs on client
    import("mapbox-gl").then((mapboxglModule) => {
      // Load Mapbox CSS non-blocking so first paint is not delayed
      if (typeof document !== "undefined") {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "/mapbox-gl.css";
        document.head.appendChild(link);
      }
      const mapboxgl = mapboxglModule.default;
      const initialStyle = useMapStore.getState().mapStyle;
      const map = new mapboxgl.Map({
        container: containerRef.current!,
        style: STYLE_URLS[initialStyle],
        config: {
          basemap: { show3dBuildings: false },
        },
        center: [-87.657, 41.852],
        zoom: 14,
        pitch: 45,
        bearing: 0,
        accessToken: MAPBOX_TOKEN,
        antialias: true,
      });

      map.addControl(
        new mapboxgl.NavigationControl({ showZoom: true, showCompass: true, visualizePitch: true }),
        "top-right"
      );
      map.addControl(new (createFitMapControl(() => muralsCoordsRef.current))(), "top-right");
      map.addControl(new (createStyleControl())(), "top-right");
      map.addControl(new (createHeatmapControl())(), "top-right");

      // Merge fit and style into the NavigationControl group; keep heatmap as its own stacked group (compass stays in nav).
      // top-right order: [nav, fit, style, heatmap] -> merge fit, style into nav; heatmap remains separate.
      const topRight = containerRef.current?.querySelector(".mapboxgl-ctrl-top-right");
      if (topRight) {
        const groups = Array.from(topRight.querySelectorAll<HTMLElement>(":scope > .mapboxgl-ctrl-group"));
        if (groups.length === 4) {
          const [navGroup, fitGroup, styleGroup, heatmapGroup] = groups;
          const fitBtn = fitGroup.querySelector("button");
          const styleBtn = styleGroup.querySelector("button");
          if (fitBtn) navGroup.appendChild(fitBtn);
          if (styleBtn) navGroup.appendChild(styleBtn);
          fitGroup.remove();
          styleGroup.remove();
          // heatmapGroup stays as its own stacked group (north/compass remains in navGroup)
        }
      }

      map.on("load", () => {
        try {
          map.setConfigProperty("basemap", "show3dBuildings", false);
        } catch {
          // Style may not support this config
        }
        const preset = useThemeStore.getState().mapLightPreset;
        applyLightPreset(map, preset);
        try {
          map.setConfigProperty("basemap", "showPointOfInterestLabels", false);
        } catch {
          // Standard style may not support this config
        }
        unsubThemeRef.current = useThemeStore.subscribe(() => {
          const next = useThemeStore.getState().mapLightPreset;
          applyLightPreset(map, next);
        });

        mapRef.current = map;
        mapStyleRef.current = initialStyle;
        setZoom(map.getZoom());
        setLoadProgress(100);
        requestAnimationFrame(() => {
          setMapReady(true);
          useMapStore.getState().setMapReady(true);
        });

        // Progressive enhancement: load 3D buildings after initial paint so LCP stays fast
        const enable3dBuildings = () => {
          try {
            map.setConfigProperty("basemap", "show3dBuildings", true);
          } catch {
            // Style may not support this config (e.g. satellite)
          }
        };
        if (typeof requestIdleCallback !== "undefined") {
          requestIdleCallback(enable3dBuildings, { timeout: 500 });
        } else {
          setTimeout(enable3dBuildings, 300);
        }

        const userCoords = useLocationStore.getState().userCoords;
        addCustomSourcesAndLayers(map, routeCoordinates, userCoords);
        addHeatmapLayer(map, murals, useMapStore.getState().heatmapVisible);

        const rootContainer = document.createElement("div");
        rootContainer.className = "mural-markers-root";
        rootContainer.setAttribute("aria-hidden", "true");
        rootContainer.style.cssText =
          "position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;pointer-events:none;";
        containerRef.current?.appendChild(rootContainer);
        markersRootContainerRef.current = rootContainer;
        const root = createRoot(rootContainer);
        singleRootRef.current = root;

        function getBbox(): [number, number, number, number] {
          const bounds = map.getBounds();
          if (!bounds) return [-180, -90, 180, 90];
          const sw = bounds.getSouthWest();
          const ne = bounds.getNorthEast();
          return [sw.lng, sw.lat, ne.lng, ne.lat];
        }

        function updateMarkers() {
          const clustersToTeardown = clusterRefsRef.current;
          const markersToTeardown = markerRefsRef.current;
          clusterRefsRef.current = [];
          markerRefsRef.current = [];
          queueMicrotask(() => {
            clustersToTeardown.forEach(({ marker, root }) => {
              root.unmount();
              marker.remove();
            });
            markersToTeardown.forEach(({ marker }) => marker.remove());
          });

          const z = map.getZoom();
          setZoom(z);

          if (showTourNumbers) {
            const leafMurals = [...murals];
            const leafWrappers = leafMurals.map(() => {
              const el = document.createElement("div");
              el.className = "mural-marker-wrapper";
              return el;
            });
            leafMurals.forEach((mural, i) => {
              const marker = new mapboxgl.Marker({ element: leafWrappers[i], anchor: "bottom" })
                .setLngLat(mural.coordinates)
                .addTo(map);
              markerRefsRef.current.push({ marker, wrapperEl: leafWrappers[i], mural });
            });
            const nearbyId = nearbyMuralIdRef.current;
            leafWrappers.forEach((el, i) => {
              (el as HTMLDivElement).style.zIndex =
                leafMurals[i]?.id === nearbyId ? "1000" : "1";
            });
            root.render(
              <AllMarkers
                wrappers={leafWrappers}
                murals={leafMurals}
                zoom={z}
                onClick={handleMarkerClick}
                prefersReducedMotion={prefersReducedMotion}
                showTourNumbers={showTourNumbers}
                nearbyMuralId={nearbyMuralIdRef.current}
              />
            );
            updateMarkersRef.current = updateMarkers;
            return;
          }

          const idx = clusterIndexRef.current;
          if (!idx) return;

          const bbox = getBbox();
          const zoomFloor = Math.floor(z);
          const clustersAndLeaves = idx.getClusters(bbox, zoomFloor);

          const muralById = new Map(murals.map((m) => [m.id, m]));
          const leaves: { mural: Mural; coordinates: [number, number] }[] = [];

          for (const feature of clustersAndLeaves) {
            const props = feature.properties as { cluster?: boolean; point_count?: number; cluster_id?: number; muralId?: string };
            if (props.cluster && props.point_count != null && props.point_count > 1) {
              const [lng, lat] = feature.geometry.coordinates as [number, number];
              const el = document.createElement("div");
              el.className = "mural-marker-wrapper";
              const clusterRoot = createRoot(el);
              clusterRoot.render(
                <ClusterMarker
                  count={props.point_count}
                  onClick={() => {
                    const expZoom = idx.getClusterExpansionZoom(props.cluster_id!);
                    map.flyTo({
                      center: [lng, lat],
                      zoom: Math.min(expZoom, 17),
                      duration: flyDuration,
                      essential: true,
                    });
                  }}
                />
              );
const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
              .setLngLat([lng, lat])
              .addTo(map);
              clusterRefsRef.current.push({ marker, root: clusterRoot });
            } else {
              const muralId = props.muralId;
              const mural = muralId ? muralById.get(muralId) : null;
              if (!mural) continue;
              leaves.push({ mural, coordinates: mural.coordinates });
            }
          }

          const placements = groupLeavesIntoPlacements(leaves);
          spreadOverlappingPlacements(
            placements,
            (coords) => map.project(coords),
            (point) => {
              const ll = map.unproject([point.x, point.y]);
              return [ll.lng, ll.lat];
            }
          );
          const placementWrappers: HTMLDivElement[] = [];

          for (const placement of placements) {
            const el = document.createElement("div");
            el.className = "mural-marker-wrapper";
            const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
              .setLngLat(placement.center)
              .addTo(map);
            markerRefsRef.current.push({
              marker,
              wrapperEl: el,
              murals: placement.murals,
            });
            placementWrappers.push(el);
          }

          const nearbyId = nearbyMuralIdRef.current;
          placementRenderPropsRef.current = {
            wrappers: placementWrappers,
            placements,
            zoom: z,
            onClick: handleMarkerClick,
            prefersReducedMotion,
            nearbyMuralId: nearbyId,
          };
          placementWrappers.forEach((el, i) => {
            const placementMurals = placements[i]?.murals ?? [];
            const isNearby = placementMurals.some((m) => m.id === nearbyId);
            const isHovered = placementMurals.some(
              (m) => m.id === hoveredMuralIdRef.current
            );
            el.style.zIndex = isNearby || isHovered ? "1000" : "10";
          });

          root.render(
            <PlacementMarkers
              {...placementRenderPropsRef.current}
              hoveredMuralId={hoveredMuralIdRef.current}
              onHover={(id) => setHoveredMuralIdRef.current?.(id)}
            />
          );
          updateMarkersRef.current = updateMarkers;
        }

        updateMarkers();

        const onViewChange = () => {
          updateMarkers();
        };
        map.on("zoomend", onViewChange);
        map.on("moveend", onViewChange);
      });
    });

    return () => {
      useMapStore.getState().setMapReady(false);
      unsubThemeRef.current?.();
      unsubThemeRef.current = null;
      clusterIndexRef.current = null;
      const clusterRefs = clusterRefsRef.current;
      clusterRefsRef.current = [];
      const root = singleRootRef.current;
      singleRootRef.current = null;
      const markersContainer = markersRootContainerRef.current;
      markersRootContainerRef.current = null;
      const map = mapRef.current;
      mapRef.current = null;
      const markerRefs = markerRefsRef.current;
      markerRefsRef.current = [];

      const doUnmount = () => {
        clusterRefs.forEach(({ marker, root }) => {
          root.unmount();
          marker.remove();
        });
        if (root) {
          root.unmount();
          markersContainer?.remove();
        } else if (markersContainer) {
          markersContainer.remove();
        }
        markerRefs.forEach(({ marker }) => marker.remove());
        if (map?.getLayer(ROUTE_LAYER_ID)) {
          map.removeLayer(ROUTE_LAYER_ID);
        }
        if (map?.getSource(ROUTE_SOURCE_ID)) {
          map.removeSource(ROUTE_SOURCE_ID);
        }
        if (map?.getLayer(USER_LOCATION_LAYER_ID)) {
          map.removeLayer(USER_LOCATION_LAYER_ID);
        }
        if (map?.getSource(USER_LOCATION_SOURCE_ID)) {
          map.removeSource(USER_LOCATION_SOURCE_ID);
        }
        if (map?.getLayer(GEOFENCE_LINE_LAYER_ID)) {
          map.removeLayer(GEOFENCE_LINE_LAYER_ID);
        }
        if (map?.getLayer(GEOFENCE_FILL_LAYER_ID)) {
          map.removeLayer(GEOFENCE_FILL_LAYER_ID);
        }
        if (map?.getSource(GEOFENCE_SOURCE_ID)) {
          map.removeSource(GEOFENCE_SOURCE_ID);
        }
        if (map?.getLayer(PILSEN_BOUNDARY_LINE_LAYER_ID)) {
          map.removeLayer(PILSEN_BOUNDARY_LINE_LAYER_ID);
        }
        if (map?.getLayer(PILSEN_BOUNDARY_FILL_LAYER_ID)) {
          map.removeLayer(PILSEN_BOUNDARY_FILL_LAYER_ID);
        }
        if (map?.getSource(PILSEN_BOUNDARY_SOURCE_ID)) {
          map.removeSource(PILSEN_BOUNDARY_SOURCE_ID);
        }
        map?.remove();
      };

      queueMicrotask(doUnmount);
    };
  }, [murals, handleMarkerClick, prefersReducedMotion, flyDuration, showTourNumbers, routeCoordinates]);

  // Re-render markers when nearby mural changes (geofence) so the "You're near" styling updates
  useEffect(() => {
    nearbyMuralIdRef.current = nearbyMuralId;
    updateMarkersRef.current?.();
  }, [nearbyMuralId]);

  // Sync user location dot and geofence radius circle from locationStore.
  const userCoords = useLocationStore((s) => s.userCoords);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const userSource = map.getSource(USER_LOCATION_SOURCE_ID) as import("mapbox-gl").GeoJSONSource | undefined;
    const geofenceSource = map.getSource(GEOFENCE_SOURCE_ID) as import("mapbox-gl").GeoJSONSource | undefined;
    const empty = { type: "FeatureCollection" as const, features: [] };
    if (userSource) {
      userSource.setData(
        userCoords
          ? { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: userCoords } }
          : empty
      );
    }
    if (geofenceSource) {
      geofenceSource.setData(
        userCoords
          ? {
            type: "Feature",
            properties: {},
            geometry: circlePolygon(userCoords, GEOFENCE_RADIUS_M),
          }
          : empty
      );
    }
  }, [userCoords]);

  // When user enables location (e.g. via LocationPrompt), zoom map to their position once so they see themselves and nearby thumbnail context
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !userCoords || hasFlownToUserFromStoreRef.current) return;
    hasFlownToUserFromStoreRef.current = true;
    map.flyTo({
      center: userCoords,
      zoom: 16,
      pitch: ZOOM_TO_USER_PITCH,
      bearing: map.getBearing(),
      duration: prefersReducedMotion ? 0 : 1500,
      essential: true,
    });
  }, [userCoords, mapReady, prefersReducedMotion]);

  // When another part of the app requests a fly-to (e.g. Surprise me, list, nearby rotation), run flyTo; optionally open modal on moveend.
  useEffect(() => {
    if (!pendingFlyTo) return;
    const map = mapRef.current;
    if (!map) return;

    const { mural, openModalAfterFly } = pendingFlyTo;
    const bearing = typeof mural.bearing === "number" ? mural.bearing : 0;

    const onMoveEnd = () => {
      map.setBearing(bearing);
      if (openModalAfterFly) openModal(mural, murals);
      clearPendingFlyTo();
    };

    // Resize so the map repaints when modal was covering it (avoids black canvas).
    map.resize();
    map.flyTo({
      center: mural.coordinates,
      zoom: FLY_OPTIONS.zoom,
      pitch: FLY_OPTIONS.pitch,
      bearing,
      duration: flyDuration,
      essential: FLY_OPTIONS.essential,
    });
    map.once("moveend", onMoveEnd);
    return () => {
      map.off("moveend", onMoveEnd);
    };
  }, [pendingFlyTo, openModal, clearPendingFlyTo, murals, flyDuration, mapReady]);

  // Fit map to bounds when requested from header (Fit map / Fit tour).
  const pendingFitBounds = useMapStore((s) => s.pendingFitBounds);
  const clearPendingFitBounds = useMapStore((s) => s.clearPendingFitBounds);
  useEffect(() => {
    if (!pendingFitBounds || pendingFitBounds.length === 0) return;
    const map = mapRef.current;
    if (!map) return;
    import("mapbox-gl").then((mapboxglModule) => {
      const mapboxgl = mapboxglModule.default;
      const bounds = new mapboxgl.LngLatBounds();
      pendingFitBounds.forEach((c) => bounds.extend(c));
      map.fitBounds(bounds, { padding: 48, maxZoom: 16 });
      clearPendingFitBounds();
    });
  }, [pendingFitBounds, clearPendingFitBounds]);

  // When map style is toggled (Standard ↔ Satellite), setStyle and re-add custom layers.
  useEffect(() => {
    if (mapStyle === mapStyleRef.current) return;
    const map = mapRef.current;
    if (!map || !mapReady) return;
    unsubThemeRef.current?.();
    unsubThemeRef.current = null;
    map.setStyle(STYLE_URLS[mapStyle]);
    map.once("idle", () => {
      const userCoords = useLocationStore.getState().userCoords;
      addCustomSourcesAndLayers(map, routeCoordinates, userCoords);
      addHeatmapLayer(map, murals, useMapStore.getState().heatmapVisible);
      if (mapStyle === "standard") {
        const preset = useThemeStore.getState().mapLightPreset;
        applyLightPreset(map, preset);
        try {
          map.setConfigProperty("basemap", "showPointOfInterestLabels", false);
          map.setConfigProperty("basemap", "show3dBuildings", true);
        } catch {
          // Standard style only
        }
        unsubThemeRef.current = useThemeStore.subscribe(() => {
          const next = useThemeStore.getState().mapLightPreset;
          applyLightPreset(map, next);
        });
      }
      mapStyleRef.current = mapStyle;
    });
  }, [mapStyle, mapReady, routeCoordinates, murals]);

  // Sync heatmap layer visibility when user toggles the control.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(MURALS_HEATMAP_LAYER_ID)) return;
    map.setLayoutProperty(
      MURALS_HEATMAP_LAYER_ID,
      "visibility",
      heatmapVisible ? "visible" : "none"
    );
  }, [heatmapVisible]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" aria-hidden />
      {/* Map loading overlay — full viewport so header is hidden; fades out when ready */}
      {MAPBOX_TOKEN && (
        <div
          className={`fixed inset-0 z-[100] bg-white transition-opacity duration-500 ease-out ${mapReady ? "pointer-events-none opacity-0" : "opacity-100"
            }`}
          aria-hidden={mapReady}
        >
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-6 pointer-events-none"
            role="status"
            aria-live="polite"
            aria-label="Loading Pilsen murals"
          >
            {/* Pilsen boundary: full outline (track) + traced stroke as progress */}
            {pilsenOutlinePath && (
              <svg
                viewBox="0 0 100 100"
                width="160"
                height="160"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden
                className="text-zinc-300"
              >
                <path
                  d={pilsenOutlinePath}
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  fill="none"
                />
                <path
                  d={pilsenOutlinePath}
                  pathLength={100}
                  strokeDasharray={100}
                  strokeDashoffset={100 - loadProgress}
                  stroke="#006847"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  fill="none"
                  className="transition-[stroke-dashoffset] duration-300 ease-out"
                  aria-hidden
                />
              </svg>
            )}
            <div
              className="flex flex-col items-center gap-1.5"
              role="progressbar"
              aria-valuenow={Math.round(loadProgress)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Loading progress"
            >
              <p className="text-sm font-semibold text-zinc-700">
                Loading... Pilsen murals near you
              </p>
            </div>
          </div>
        </div>
      )}
      {!MAPBOX_TOKEN && (
        <div className="absolute inset-0 flex items-center justify-center bg-dynamic text-dynamic-muted">
          <p className="max-w-md text-center text-sm">
            Add your Mapbox Access Token: set <code className="rounded bg-dynamic-surface px-1">NEXT_PUBLIC_MAPBOX_TOKEN</code> in{" "}
            <code className="rounded bg-dynamic-surface px-1">.env.local</code> or in this file.
          </p>
        </div>
      )}
    </div>
  );
}

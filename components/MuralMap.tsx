"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { useRef, useEffect, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import Supercluster from "supercluster";
import { MuralMarker } from "./MuralMarker";
import { ClusterMarker } from "./ClusterMarker";
import { FannedMuralCards } from "./FannedMuralCards";
import { useLocationStore } from "@/store/locationStore";
import { useMuralStore } from "@/store/muralStore";
import { useMapStore } from "@/store/mapStore";
import { useThemeStore } from "@/store/themeStore";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
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

const REVEAL_STAGGER_MS = 28;
const MARKER_CHUNK_SIZE = 8;

/** GeoJSON point feature for supercluster; properties.muralId links back to Mural. */
function muralToPoint(mural: Mural): GeoJSON.Feature<GeoJSON.Point, { muralId: string }> {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: mural.coordinates },
    properties: { muralId: mural.id },
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
        const revealDelay = (i % MARKER_CHUNK_SIZE) * REVEAL_STAGGER_MS;
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
}

function PlacementMarkers({
  wrappers,
  placements,
  zoom,
  onClick,
  prefersReducedMotion,
  nearbyMuralId,
}: PlacementMarkersProps) {
  return (
    <>
      {placements.map((placement, i) => {
        const wrapper = wrappers[i];
        if (!wrapper) return null;
        const { murals } = placement;
        if (murals.length === 1) {
          const revealDelay = (i % MARKER_CHUNK_SIZE) * REVEAL_STAGGER_MS;
          return createPortal(
            <MuralMarker
              mural={murals[0]}
              zoom={zoom}
              onClick={onClick}
              revealDelay={revealDelay}
              prefersReducedMotion={prefersReducedMotion}
              isNearby={murals[0].id === nearbyMuralId}
            />,
            wrapper,
            murals[0].id
          );
        }
        return createPortal(
          <FannedMuralCards
            murals={murals}
            zoom={zoom}
            onClick={onClick}
            prefersReducedMotion={prefersReducedMotion}
            nearbyMuralId={nearbyMuralId}
          />,
          wrapper,
          `fan-${murals.map((m) => m.id).join("-")}`
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
  radius: 60,
  maxZoom: 16,
  minPoints: 2,
};

/** Pixel distance under which leaf markers are grouped into a fanned deck. */
const OVERLAP_GROUP_PX = 50;

interface Placement {
  center: [number, number];
  murals: Mural[];
}

/** Group leaves by screen proximity; each group becomes one placement (single marker or fanned deck). */
function groupLeavesIntoPlacements(
  leaves: { mural: Mural; coordinates: [number, number] }[],
  project: (coords: [number, number]) => { x: number; y: number }
): Placement[] {
  if (leaves.length === 0) return [];
  const points = leaves.map((l) => ({ ...l, point: project(l.coordinates) }));
  const n = points.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(i: number): number {
    if (parent[i] !== i) parent[i] = find(parent[i]);
    return parent[i];
  }
  function union(i: number, j: number): void {
    parent[find(i)] = find(j);
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = points[i].point.x - points[j].point.x;
      const dy = points[i].point.y - points[j].point.y;
      if (dx * dx + dy * dy < OVERLAP_GROUP_PX * OVERLAP_GROUP_PX) union(i, j);
    }
  }
  const byRoot = new Map<number, (typeof points)[0][]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r)!.push(points[i]);
  }
  return Array.from(byRoot.values()).map((group) => {
    const lngSum = group.reduce((s, p) => s + p.coordinates[0], 0);
    const latSum = group.reduce((s, p) => s + p.coordinates[1], 0);
    const center: [number, number] = [lngSum / group.length, latSum / group.length];
    const murals = group.map((p) => p.mural);
    return { center, murals };
  });
}

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
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const [mapReady, setMapReady] = useState(false);
  const mapStyle = useMapStore((s) => s.mapStyle);
  const requestCompassReset = useMapStore((s) => s.requestCompassReset);
  const clearPendingCompassReset = useMapStore((s) => s.clearPendingCompassReset);
  const setMapStyle = useMapStore((s) => s.setMapStyle);
  const openModal = useMuralStore((s) => s.openModal);
  const pendingFlyTo = useMuralStore((s) => s.pendingFlyTo);
  const clearPendingFlyTo = useMuralStore((s) => s.clearPendingFlyTo);
  const prefersReducedMotion = usePrefersReducedMotion();
  const flyDuration = prefersReducedMotion ? 0 : FLY_OPTIONS.duration;

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

    const points = murals.map(muralToPoint);
    const index = new Supercluster(CLUSTER_INDEX_OPTIONS);
    index.load(points);
    clusterIndexRef.current = index;

    // Dynamic import so Mapbox (window-dependent) only runs on client
    import("mapbox-gl").then((mapboxglModule) => {
      const mapboxgl = mapboxglModule.default;
      const initialStyle = useMapStore.getState().mapStyle;
      const map = new mapboxgl.Map({
        container: containerRef.current!,
        style: STYLE_URLS[initialStyle],
        center: [-87.657, 41.852],
        zoom: 14,
        pitch: 45,
        bearing: 0,
        accessToken: MAPBOX_TOKEN,
        antialias: true,
      });

      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
      const geolocateControl = new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true,
        showUserLocation: false,
        fitBoundsOptions: { maxZoom: 16 },
      });
      map.addControl(geolocateControl, "top-right");

      // When user grants location, zoom to them while keeping 3D perspective (pitch), not flat top-down.
      let hasFlownToUser = false;
      geolocateControl.on("geolocate", (e: { coords: { longitude: number; latitude: number } }) => {
        const { longitude, latitude } = e.coords;
        const source = map.getSource(USER_LOCATION_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
        if (source) {
          source.setData({
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: [longitude, latitude] },
          });
        }
        if (hasFlownToUser) return;
        hasFlownToUser = true;
        map.flyTo({
          center: [longitude, latitude],
          zoom: 16,
          pitch: ZOOM_TO_USER_PITCH,
          bearing: map.getBearing(),
          duration: prefersReducedMotion ? 0 : 1500,
          essential: true,
        });
      });

      map.on("load", () => {
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
        requestAnimationFrame(() => setMapReady(true));

        const userCoords = useLocationStore.getState().userCoords;
        addCustomSourcesAndLayers(map, routeCoordinates, userCoords);

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
              const marker = new mapboxgl.Marker({ element: leafWrappers[i] })
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
              const marker = new mapboxgl.Marker({ element: el })
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

          const placements = groupLeavesIntoPlacements(leaves, (coords) =>
            map.project(coords)
          );
          const placementWrappers: HTMLDivElement[] = [];

          for (const placement of placements) {
            const el = document.createElement("div");
            el.className = "mural-marker-wrapper";
            const marker = new mapboxgl.Marker({ element: el })
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
          placementWrappers.forEach((el, i) => {
            const placementMurals = placements[i]?.murals ?? [];
            const isNearby = placementMurals.some((m) => m.id === nearbyId);
            el.style.zIndex = isNearby ? "1000" : "1";
          });

          root.render(
            <PlacementMarkers
              wrappers={placementWrappers}
              placements={placements}
              zoom={z}
              onClick={handleMarkerClick}
              prefersReducedMotion={prefersReducedMotion}
              nearbyMuralId={nearbyMuralIdRef.current}
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
    map.flyTo({
      center: mural.coordinates,
      zoom: FLY_OPTIONS.zoom,
      pitch: FLY_OPTIONS.pitch,
      bearing,
      duration: flyDuration,
      essential: FLY_OPTIONS.essential,
    });

    const onMoveEnd = () => {
      map.setBearing(bearing);
      if (openModalAfterFly) openModal(mural, murals);
      clearPendingFlyTo();
    };
    map.once("moveend", onMoveEnd);
    return () => {
      map.off("moveend", onMoveEnd);
    };
  }, [pendingFlyTo, openModal, clearPendingFlyTo, murals, flyDuration]);

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

  // Compass reset: north-up.
  const pendingCompassReset = useMapStore((s) => s.pendingCompassReset);
  useEffect(() => {
    if (!pendingCompassReset) return;
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ bearing: 0 });
    clearPendingCompassReset();
  }, [pendingCompassReset, clearPendingCompassReset]);

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
      if (mapStyle === "standard") {
        const preset = useThemeStore.getState().mapLightPreset;
        applyLightPreset(map, preset);
        try {
          map.setConfigProperty("basemap", "showPointOfInterestLabels", false);
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
  }, [mapStyle, mapReady, routeCoordinates]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" aria-hidden />
      {/* Map controls: style toggle and compass reset (top-right, above Mapbox controls) */}
      {MAPBOX_TOKEN && mapReady && (
        <div
          className="absolute right-14 top-2 z-20 flex flex-col gap-1 sm:right-16"
          role="group"
          aria-label="Map controls"
        >
          <button
            type="button"
            onClick={() => setMapStyle(mapStyle === "standard" ? "satellite" : "standard")}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white/95 shadow-sm transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            aria-label={mapStyle === "standard" ? "Switch to satellite map" : "Switch to standard map"}
            title={mapStyle === "standard" ? "Satellite" : "Standard"}
          >
            <svg className="h-5 w-5 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={requestCompassReset}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white/95 shadow-sm transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            aria-label="Reset map to north"
            title="North up"
          >
            <svg className="h-5 w-5 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v18m0-18l-4 4m4-4l4 4M3 12h18" />
            </svg>
          </button>
        </div>
      )}
      {/* Seamless loading overlay: soft placeholder that fades out when map is ready */}
      {MAPBOX_TOKEN && (
        <div
          className={`absolute inset-0 z-10 bg-dynamic transition-opacity duration-500 ease-out ${mapReady ? "pointer-events-none opacity-0" : "opacity-100"
            }`}
        >
          <div className="loading-map-placeholder absolute inset-0" aria-hidden />
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            role="status"
            aria-live="polite"
          >
            <p className="text-sm text-dynamic-muted">Loading map...</p>
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

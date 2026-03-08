"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import { useRef, useEffect, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import Supercluster from "supercluster";
import { MuralMarker } from "./MuralMarker";
import { ClusterMarker } from "./ClusterMarker";
import { useMuralStore } from "@/store/muralStore";
import { useThemeStore } from "@/store/themeStore";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import type { Mural } from "@/types/mural";
import type { MapLightPreset } from "@/store/themeStore";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

// Standard style: sky, sun-based lighting, 3D buildings; lightPreset synced to Pilsen time
const MAP_STYLE = "mapbox://styles/mapbox/standard";

const FLY_OPTIONS = {
  zoom: 17,
  pitch: 60,
  duration: 2000,
  essential: true,
} as const;

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
}

function AllMarkers({
  wrappers,
  murals,
  zoom,
  onClick,
  prefersReducedMotion,
  showTourNumbers,
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

const ROUTE_SOURCE_ID = "tour-route";
const ROUTE_LAYER_ID = "tour-route-line";

export function MuralMap({
  murals,
  showTourNumbers = false,
  routeCoordinates = null,
}: {
  murals: Mural[];
  showTourNumbers?: boolean;
  routeCoordinates?: [number, number][] | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("mapbox-gl").Map | null>(null);
  const markerRefsRef = useRef<MarkerInstance[]>([]);
  const clusterRefsRef = useRef<ClusterInstance[]>([]);
  const clusterIndexRef = useRef<Supercluster | null>(null);
  const singleRootRef = useRef<ReturnType<typeof createRoot> | null>(null);
  const markersRootContainerRef = useRef<HTMLDivElement | null>(null);
  const unsubThemeRef = useRef<(() => void) | null>(null);
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
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
      const map = new mapboxgl.Map({
        container: containerRef.current!,
        style: MAP_STYLE,
        center: [-87.657, 41.852],
        zoom: 14,
        pitch: 45,
        bearing: 0,
        accessToken: MAPBOX_TOKEN,
        antialias: true,
      });

      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");

      map.on("load", () => {
        const preset = useThemeStore.getState().mapLightPreset;
        applyLightPreset(map, preset);
        unsubThemeRef.current = useThemeStore.subscribe(() => {
          const next = useThemeStore.getState().mapLightPreset;
          applyLightPreset(map, next);
        });

        mapRef.current = map;
        setZoom(map.getZoom());

        if (routeCoordinates && routeCoordinates.length >= 2) {
          map.addSource(ROUTE_SOURCE_ID, {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: routeCoordinates,
              },
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
          clusterRefsRef.current.forEach(({ marker, root }) => {
            root.unmount();
            marker.remove();
          });
          clusterRefsRef.current = [];
          markerRefsRef.current.forEach(({ marker }) => marker.remove());
          markerRefsRef.current = [];

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
            root.render(
              <AllMarkers
                wrappers={leafWrappers}
                murals={leafMurals}
                zoom={z}
                onClick={handleMarkerClick}
                prefersReducedMotion={prefersReducedMotion}
                showTourNumbers={showTourNumbers}
              />
            );
            return;
          }

          const idx = clusterIndexRef.current;
          if (!idx) return;

          const bbox = getBbox();
          const zoomFloor = Math.floor(z);
          const clustersAndLeaves = idx.getClusters(bbox, zoomFloor);

          const muralById = new Map(murals.map((m) => [m.id, m]));
          const leafMurals: Mural[] = [];
          const leafWrappers: HTMLDivElement[] = [];

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
              const el = document.createElement("div");
              el.className = "mural-marker-wrapper";
              const marker = new mapboxgl.Marker({ element: el })
                .setLngLat(mural.coordinates)
                .addTo(map);
              markerRefsRef.current.push({ marker, wrapperEl: el, mural });
              leafMurals.push(mural);
              leafWrappers.push(el);
            }
          }

          root.render(
            <AllMarkers
              wrappers={leafWrappers}
              murals={leafMurals}
              zoom={z}
              onClick={handleMarkerClick}
              prefersReducedMotion={prefersReducedMotion}
              showTourNumbers={showTourNumbers}
            />
          );
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
        map?.remove();
      };

      queueMicrotask(doUnmount);
    };
  }, [murals, handleMarkerClick, prefersReducedMotion, flyDuration, showTourNumbers, routeCoordinates]);

  // When another part of the app requests a fly-to (e.g. Surprise me, list), run flyTo then open modal.
  useEffect(() => {
    if (!pendingFlyTo) return;
    const map = mapRef.current;
    if (!map) return;

    const mural = pendingFlyTo;
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
      openModal(mural, murals);
      clearPendingFlyTo();
    };
    map.once("moveend", onMoveEnd);
    return () => {
      map.off("moveend", onMoveEnd);
    };
  }, [pendingFlyTo, openModal, clearPendingFlyTo, murals, flyDuration]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" aria-hidden />
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

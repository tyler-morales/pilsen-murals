import { create } from "zustand";

export type MapStyleKind = "standard" | "satellite";

interface MapState {
  pendingFitBounds: [number, number][] | null;
  mapStyle: MapStyleKind;
  mapReady: boolean;
  /** True after the initial load overlay and (if not reduced motion) 3D intro fly-in have finished. Used to avoid showing LocationPrompt over the "PILSEN MURALS" title. */
  introComplete: boolean;
  heatmapVisible: boolean;
  requestFitBounds: (coords: [number, number][]) => void;
  clearPendingFitBounds: () => void;
  setMapStyle: (style: MapStyleKind) => void;
  setMapReady: (ready: boolean) => void;
  setIntroComplete: (complete: boolean) => void;
  setHeatmapVisible: (visible: boolean) => void;
}

export const useMapStore = create<MapState>((set) => ({
  pendingFitBounds: null,
  mapStyle: "standard",
  mapReady: false,
  introComplete: false,
  heatmapVisible: false,
  requestFitBounds: (coords) => set({ pendingFitBounds: coords }),
  clearPendingFitBounds: () => set({ pendingFitBounds: null }),
  setMapStyle: (style) => set({ mapStyle: style }),
  setMapReady: (ready) => set({ mapReady: ready }),
  setIntroComplete: (complete) => set({ introComplete: complete }),
  setHeatmapVisible: (visible) => set({ heatmapVisible: visible }),
}));

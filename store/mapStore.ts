import { create } from "zustand";

export type MapStyleKind = "standard" | "satellite";

interface MapState {
  pendingFitBounds: [number, number][] | null;
  mapStyle: MapStyleKind;
  mapReady: boolean;
  requestFitBounds: (coords: [number, number][]) => void;
  clearPendingFitBounds: () => void;
  setMapStyle: (style: MapStyleKind) => void;
  setMapReady: (ready: boolean) => void;
}

export const useMapStore = create<MapState>((set) => ({
  pendingFitBounds: null,
  mapStyle: "standard",
  mapReady: false,
  requestFitBounds: (coords) => set({ pendingFitBounds: coords }),
  clearPendingFitBounds: () => set({ pendingFitBounds: null }),
  setMapStyle: (style) => set({ mapStyle: style }),
  setMapReady: (ready) => set({ mapReady: ready }),
}));

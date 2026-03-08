import { create } from "zustand";

export type MapStyleKind = "standard" | "satellite";

interface MapState {
  pendingFitBounds: [number, number][] | null;
  pendingCompassReset: boolean;
  mapStyle: MapStyleKind;
  requestFitBounds: (coords: [number, number][]) => void;
  clearPendingFitBounds: () => void;
  requestCompassReset: () => void;
  clearPendingCompassReset: () => void;
  setMapStyle: (style: MapStyleKind) => void;
}

export const useMapStore = create<MapState>((set) => ({
  pendingFitBounds: null,
  pendingCompassReset: false,
  mapStyle: "standard",
  requestFitBounds: (coords) => set({ pendingFitBounds: coords }),
  clearPendingFitBounds: () => set({ pendingFitBounds: null }),
  requestCompassReset: () => set({ pendingCompassReset: true }),
  clearPendingCompassReset: () => set({ pendingCompassReset: false }),
  setMapStyle: (style) => set({ mapStyle: style }),
}));

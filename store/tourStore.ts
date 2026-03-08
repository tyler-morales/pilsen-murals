import { create } from "zustand";
import type { Collection } from "@/types/collection";

interface TourState {
  /** When set, map and list show only this collection's murals in order. */
  activeTour: Collection | null;
  setActiveTour: (tour: Collection | null) => void;
}

export const useTourStore = create<TourState>((set) => ({
  activeTour: null,
  setActiveTour: (tour) => set({ activeTour: tour }),
}));

import { create } from "zustand";
import type { Mural } from "@/types/mural";

interface MuralState {
  activeMural: Mural | null;
  isModalOpen: boolean;
  /** When set, map should fly to this mural and open modal on moveend; cleared after open. */
  pendingFlyTo: Mural | null;
  /** Ordered list for prev/next navigation; set when opening modal. */
  muralsOrder: Mural[];
  activeIndex: number;
  openModal: (mural: Mural, allMurals: Mural[]) => void;
  closeModal: () => void;
  requestFlyTo: (mural: Mural) => void;
  clearPendingFlyTo: () => void;
  goPrev: () => void;
  goNext: () => void;
}

export const useMuralStore = create<MuralState>((set) => ({
  activeMural: null,
  isModalOpen: false,
  pendingFlyTo: null,
  muralsOrder: [],
  activeIndex: 0,
  openModal: (mural, allMurals) => {
    const index = allMurals.findIndex((m) => m.id === mural.id);
    set({
      activeMural: mural,
      isModalOpen: true,
      pendingFlyTo: null,
      muralsOrder: allMurals,
      activeIndex: index >= 0 ? index : 0,
    });
  },
  closeModal: () => set({ isModalOpen: false, activeMural: null }),
  requestFlyTo: (mural) => set({ pendingFlyTo: mural }),
  clearPendingFlyTo: () => set({ pendingFlyTo: null }),
  goPrev: () =>
    set((state) => {
      if (state.muralsOrder.length === 0 || state.activeIndex <= 0)
        return state;
      const newIndex = state.activeIndex - 1;
      return {
        activeIndex: newIndex,
        activeMural: state.muralsOrder[newIndex],
      };
    }),
  goNext: () =>
    set((state) => {
      if (
        state.muralsOrder.length === 0 ||
        state.activeIndex >= state.muralsOrder.length - 1
      )
        return state;
      const newIndex = state.activeIndex + 1;
      return {
        activeIndex: newIndex,
        activeMural: state.muralsOrder[newIndex],
      };
    }),
}));

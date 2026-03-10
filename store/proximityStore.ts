"use client";

import { create } from "zustand";
import type { Mural } from "@/types/mural";
import {
  getMuralsWithinRadiusWithDistance,
  GEOFENCE_RADIUS_M,
  type MuralWithDistance,
} from "@/lib/geo";

const SEEN_STORAGE_KEY = "pilsen-murals-seen-murals";

function getSeenIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(SEEN_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function persistSeenIds(ids: Set<string>): void {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore
  }
}

export type SwipeDirection = "left" | "right" | null;

interface ProximityState {
  /** Murals currently within radius with distance, sorted by distance (closest first). */
  nearbyQueue: MuralWithDistance[];
  /** Index into nearbyQueue for the mural currently shown in the card. */
  showIndex: number;
  /** The mural currently shown (nearbyQueue[showIndex] or null). */
  currentNearby: Mural | null;
  /** Distance in meters to current nearby mural, or null. */
  currentDistanceM: number | null;
  /** Direction for exit animation when swiping (set by showNext/showPrev). */
  exitDirection: SwipeDirection;
  /** User dismissed the nearby card entirely; card stays hidden until they leave and re-enter range. */
  dismissed: boolean;
  /**
   * Recompute nearby queue from user coords and murals; keep or reset shown mural.
   */
  setNearbyFromCoords: (murals: Mural[], coords: [number, number] | null) => void;
  /** Advance to the next mural in queue, or hide if none. */
  showNext: () => void;
  /** Go to the previous mural in queue. */
  showPrev: () => void;
  /** Dismiss the entire nearby card; hides until user leaves and re-enters geofence. */
  dismissAll: () => void;
  /** Mark a mural as seen (e.g. after Dismiss or View); stored for possible future use; does not affect queue order. */
  markSeen: (muralId: string) => void;
}

function getCurrent(queue: MuralWithDistance[], index: number): {
  mural: Mural | null;
  distanceM: number | null;
} {
  if (index < 0 || index >= queue.length) {
    return { mural: null, distanceM: null };
  }
  const entry = queue[index];
  return entry
    ? { mural: entry.mural, distanceM: entry.distanceM }
    : { mural: null, distanceM: null };
}

export const useProximityStore = create<ProximityState>((set, get) => ({
  nearbyQueue: [],
  showIndex: 0,
  currentNearby: null,
  currentDistanceM: null,
  exitDirection: null,
  dismissed: false,

  setNearbyFromCoords: (murals, coords) => {
    if (!coords) {
      set({
        nearbyQueue: [],
        showIndex: 0,
        currentNearby: null,
        currentDistanceM: null,
        exitDirection: null,
      });
      return;
    }
    const newQueue = getMuralsWithinRadiusWithDistance(
      coords,
      murals,
      GEOFENCE_RADIUS_M
    );
    const stateBefore = get();
    const { currentNearby, nearbyQueue: prevQueue } = stateBefore;
    let showIndex = 0;
    if (currentNearby && newQueue.length > 0) {
      const idx = newQueue.findIndex((e) => e.mural.id === currentNearby.id);
      if (idx >= 0) showIndex = idx;
    }
    const wasOutsideRange = prevQueue.length === 0;
    const nowInRange = newQueue.length > 0;
    const dismissed = stateBefore.dismissed && !(wasOutsideRange && nowInRange);
    const { mural, distanceM } = getCurrent(newQueue, showIndex);
    set({
      nearbyQueue: newQueue,
      showIndex,
      currentNearby: mural,
      currentDistanceM: distanceM,
      exitDirection: null,
      dismissed,
    });
  },

  showNext: () => {
    const { nearbyQueue, showIndex } = get();
    const nextIndex = showIndex + 1;
    const { mural, distanceM } = getCurrent(nearbyQueue, nextIndex);
    set({
      exitDirection: "left",
      showIndex: nextIndex,
      currentNearby: mural,
      currentDistanceM: distanceM,
    });
  },

  showPrev: () => {
    const { nearbyQueue, showIndex } = get();
    const prevIndex = Math.max(0, showIndex - 1);
    const { mural, distanceM } = getCurrent(nearbyQueue, prevIndex);
    set({
      exitDirection: "right",
      showIndex: prevIndex,
      currentNearby: mural,
      currentDistanceM: distanceM,
    });
  },

  dismissAll: () => {
    set({ dismissed: true });
  },

  markSeen: (muralId) => {
    const seen = getSeenIds();
    seen.add(muralId);
    persistSeenIds(seen);
  },
}));

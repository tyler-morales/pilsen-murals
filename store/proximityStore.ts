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
  /**
   * Recompute nearby queue from user coords and murals; keep or reset shown mural.
   */
  setNearbyFromCoords: (murals: Mural[], coords: [number, number] | null) => void;
  /** Advance to the next mural in queue, or hide if none. */
  showNext: () => void;
  /** Go to the previous mural in queue. */
  showPrev: () => void;
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
    const { currentNearby } = stateBefore;
    let showIndex = 0;
    if (currentNearby && newQueue.length > 0) {
      const idx = newQueue.findIndex((e) => e.mural.id === currentNearby.id);
      if (idx >= 0) showIndex = idx;
    }
    const { mural, distanceM } = getCurrent(newQueue, showIndex);
    // #region agent log
    if (typeof fetch !== "undefined") {
      fetch("http://127.0.0.1:7834/ingest/75c1fc41-3a14-4be5-8874-6f7c19a23dc4", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "2991a5" },
        body: JSON.stringify({
          sessionId: "2991a5",
          location: "proximityStore.ts:setNearbyFromCoords",
          message: "setNearbyFromCoords running",
          data: {
            currentNearbyIdBefore: stateBefore.currentNearby?.id ?? null,
            newQueueLen: newQueue.length,
            willSetCurrentNearbyId: mural?.id ?? null,
          },
          timestamp: Date.now(),
          hypothesisId: "H1",
        }),
      }).catch(() => {});
    }
    // #endregion
    set({
      nearbyQueue: newQueue,
      showIndex,
      currentNearby: mural,
      currentDistanceM: distanceM,
      exitDirection: null,
    });
  },

  showNext: () => {
    const { nearbyQueue, showIndex } = get();
    const nextIndex = showIndex + 1;
    const { mural, distanceM } = getCurrent(nearbyQueue, nextIndex);
    // #region agent log
    if (typeof fetch !== "undefined") {
      fetch("http://127.0.0.1:7834/ingest/75c1fc41-3a14-4be5-8874-6f7c19a23dc4", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "2991a5" },
        body: JSON.stringify({
          sessionId: "2991a5",
          location: "proximityStore.ts:showNext",
          message: "showNext result",
          data: {
            showIndex,
            queueLen: nearbyQueue.length,
            nextIndex,
            resultCurrentNearbyId: mural?.id ?? null,
          },
          timestamp: Date.now(),
          hypothesisId: "H3",
        }),
      }).catch(() => {});
    }
    // #endregion
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

  markSeen: (muralId) => {
    const seen = getSeenIds();
    seen.add(muralId);
    persistSeenIds(seen);
  },
}));

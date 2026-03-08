"use client";

import { useEffect } from "react";
import { useLocationStore } from "@/store/locationStore";
import { useProximityStore } from "@/store/proximityStore";
import type { Mural } from "@/types/mural";

/**
 * Syncs proximity store with location: when userCoords updates, recompute
 * nearby queue and current mural. Call from a component that has murals (e.g. MapContent).
 */
export function useProximity(murals: Mural[]) {
  const userCoords = useLocationStore((s) => s.userCoords);
  const setNearbyFromCoords = useProximityStore((s) => s.setNearbyFromCoords);

  useEffect(() => {
    setNearbyFromCoords(murals, userCoords);
  }, [murals, userCoords, setNearbyFromCoords]);
}

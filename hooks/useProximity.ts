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
    // #region agent log
    if (typeof fetch !== "undefined") {
      fetch("http://127.0.0.1:7834/ingest/75c1fc41-3a14-4be5-8874-6f7c19a23dc4", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "2991a5" },
        body: JSON.stringify({
          sessionId: "2991a5",
          location: "useProximity.ts:useEffect",
          message: "useProximity effect running",
          data: { hasCoords: !!userCoords, muralsLen: murals?.length },
          timestamp: Date.now(),
          hypothesisId: "H1",
        }),
      }).catch(() => {});
    }
    // #endregion
    setNearbyFromCoords(murals, userCoords);
  }, [murals, userCoords, setNearbyFromCoords]);
}

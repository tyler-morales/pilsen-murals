"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getMuralsWithinRadius, GEOFENCE_RADIUS_M } from "@/lib/geo";
import type { Mural } from "@/types/mural";

export type GeofencePermissionState = "prompt" | "granted" | "denied";

export interface UseGeofenceResult {
  /** Mural to show in the proximity banner (user just entered its geofence). Null after dismiss or when not near one. */
  nearbyMural: Mural | null;
  permissionState: GeofencePermissionState;
  error: string | null;
  /** Clear the current proximity alert (e.g. after View or Dismiss). */
  clearNearby: () => void;
}

const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 15_000,
  timeout: 10_000,
};

/**
 * Watches user position and detects when they enter a mural's geofence.
 * Only notifies once per mural per "visit" (removes from notified set when they leave so re-entry triggers again).
 */
export function useGeofence(
  murals: Mural[],
  radiusM: number = GEOFENCE_RADIUS_M
): UseGeofenceResult {
  const [nearbyMural, setNearbyMural] = useState<Mural | null>(null);
  const [permissionState, setPermissionState] =
    useState<GeofencePermissionState>("prompt");
  const [error, setError] = useState<string | null>(null);

  const notifiedIdsRef = useRef<Set<string>>(new Set());
  const watchIdRef = useRef<number | null>(null);

  const clearNearby = useCallback(() => setNearbyMural(null), []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation || murals.length === 0) {
      return;
    }

    function onPosition(position: GeolocationPosition) {
      setError(null);
      const coords: [number, number] = [
        position.coords.longitude,
        position.coords.latitude,
      ];
      const within = getMuralsWithinRadius(coords, murals, radiusM);
      const withinIds = new Set(within.map((m) => m.id));

      // Remove murals we're no longer near so re-entering triggers again.
      notifiedIdsRef.current.forEach((id) => {
        if (!withinIds.has(id)) notifiedIdsRef.current.delete(id);
      });

      const newEntry = within.find((m) => !notifiedIdsRef.current.has(m.id));
      if (newEntry) {
        notifiedIdsRef.current.add(newEntry.id);
        setNearbyMural(newEntry);
      }
    }

    function onError(err: GeolocationPositionError) {
      if (err.code === err.PERMISSION_DENIED) {
        setPermissionState("denied");
        setError(null);
      } else {
        setError(err.message || "Location unavailable");
      }
    }

    const id = navigator.geolocation.watchPosition(
      onPosition,
      onError,
      WATCH_OPTIONS
    );
    watchIdRef.current = id;

    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((status) => {
          setPermissionState(
            status.state === "granted" ? "granted" : status.state === "denied" ? "denied" : "prompt"
          );
          status.addEventListener("change", () => {
            setPermissionState(
              status.state === "granted" ? "granted" : status.state === "denied" ? "denied" : "prompt"
            );
          });
        })
        .catch(() => {});
    }

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [murals, radiusM]);

  return { nearbyMural, permissionState, error, clearNearby };
}

"use client";

import { create } from "zustand";

const STORAGE_KEY = "pilsen-murals-location-prompt-dismissed";

function getStoredDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function setStoredDismissed(value: boolean): void {
  try {
    if (value) {
      localStorage.setItem(STORAGE_KEY, "true");
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export type LocationPermission = "prompt" | "granted" | "denied";

interface LocationState {
  permission: LocationPermission;
  userCoords: [number, number] | null;
  error: string | null;
  promptDismissed: boolean;
  watchId: number | null;
  requestLocation: () => void;
  dismissPrompt: () => void;
  rehydrateFromStorage: () => void;
  setPosition: (coords: [number, number]) => void;
  setError: (error: string | null) => void;
  setPermission: (permission: LocationPermission) => void;
  clearWatch: () => void;
}

export const useLocationStore = create<LocationState>((set, get) => ({
  permission: "prompt",
  userCoords: null,
  error: null,
  promptDismissed: false,
  watchId: null,

  requestLocation: () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      set({ permission: "denied", error: "Geolocation not supported" });
      return;
    }

    set({ error: null });

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStoredDismissed(true);
        const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        set({ permission: "granted", userCoords: coords, error: null, promptDismissed: true });

        const watchId = navigator.geolocation.watchPosition(
          (p) => {
            get().setPosition([p.coords.longitude, p.coords.latitude]);
          },
          (err) => {
            get().setError(err.message || "Position unavailable");
          },
          { enableHighAccuracy: true, maximumAge: 30_000, timeout: 10_000 }
        );
        set({ watchId });
      },
      (err) => {
        const permission: LocationPermission = err.code === 1 ? "denied" : "prompt";
        set({
          permission,
          error: err.message || (err.code === 1 ? "Permission denied" : "Position unavailable"),
        });
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 15_000 }
    );
  },

  dismissPrompt: () => {
    setStoredDismissed(true);
    set({ promptDismissed: true });
  },

  rehydrateFromStorage: () => {
    set({ promptDismissed: getStoredDismissed() });
  },

  setPosition: (userCoords) => set({ userCoords, error: null }),
  setError: (error) => set({ error }),
  setPermission: (permission) => set({ permission }),
  clearWatch: () => {
    const { watchId } = get();
    if (watchId != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
    }
    set({ watchId: null });
  },
}));

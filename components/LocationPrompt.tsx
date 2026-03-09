"use client";

import { useEffect } from "react";
import { useLocationStore } from "@/store/locationStore";
import { useMapStore } from "@/store/mapStore";

/**
 * Small CTA shown on first load to enable location for proximity alerts.
 * Only rendered when permission is still "prompt", user has not dismissed, and the map has loaded.
 * Geolocation is only requested when user taps "Enable".
 * Choice (Enable or Not now) is persisted in localStorage and rehydrated on mount.
 */
export function LocationPrompt() {
  const { permission, promptDismissed, requestLocation, dismissPrompt, rehydrateFromStorage } =
    useLocationStore();
  const mapReady = useMapStore((s) => s.mapReady);

  useEffect(() => {
    rehydrateFromStorage();
  }, [rehydrateFromStorage]);

  const show = permission === "prompt" && !promptDismissed && mapReady;
  if (!show) return null;

  return (
    <section
      role="region"
      aria-label="Enable location for nearby mural alerts"
      className="fixed left-1/2 top-1/2 z-[40] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 sm:w-[min(100%-3rem,28rem)]"
    >
      <div className="flex flex-col gap-3 rounded-xl border border-white/20 bg-white/90 px-4 py-3 shadow-lg backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="min-w-0 text-center text-sm text-zinc-700 sm:text-left">
          Enable location to get alerts when you&apos;re near a mural.
        </p>
        <div className="flex shrink-0 justify-center gap-2 sm:justify-end">
          <button
            type="button"
            onClick={dismissPrompt}
            className="min-h-[44px] min-w-[44px] rounded-lg px-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
            aria-label="Not now"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={requestLocation}
            className="min-h-[44px] min-w-[44px] rounded-lg bg-[var(--color-enable)] px-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-enable-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-enable)] focus-visible:ring-offset-2"
            aria-label="Enable location for nearby mural alerts"
          >
            Enable
          </button>
        </div>
      </div>
    </section>
  );
}

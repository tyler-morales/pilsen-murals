"use client";

import type { Mural } from "@/types/mural";

interface ProximityBannerProps {
  mural: Mural;
  onView: (mural: Mural) => void;
  onDismiss: () => void;
}

/**
 * Accessible banner shown when the user has just entered a mural's geofence.
 * Uses aria-live so screen readers announce the message; View and Dismiss are focusable buttons.
 */
export function ProximityBanner({ mural, onView, onDismiss }: ProximityBannerProps) {
  const handleView = () => {
    onView(mural);
    onDismiss();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`You are near ${mural.title}. View or dismiss.`}
      className="proximity-banner fixed bottom-0 left-0 right-0 z-20 safe-bottom mx-2 mb-4 flex items-center gap-3 rounded-xl border border-amber-200/80 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-sm dark:border-amber-800/60 dark:bg-zinc-900/95"
    >
      <p className="min-w-0 flex-1 text-sm text-zinc-800 dark:text-zinc-200">
        <span className="font-medium">You&apos;re near </span>
        <span className="font-semibold">{mural.title}</span>
        {mural.artist && mural.artist !== "Unknown Artist" && (
          <span className="text-zinc-600 dark:text-zinc-400"> — {mural.artist}</span>
        )}
      </p>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm font-medium text-zinc-700 outline-none ring-2 ring-transparent transition focus:ring-2 focus:ring-amber-500 dark:border-zinc-600 dark:text-zinc-300"
          aria-label="Dismiss proximity alert"
        >
          Dismiss
        </button>
        <button
          type="button"
          onClick={handleView}
          className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-amber-950 outline-none ring-2 ring-transparent transition hover:bg-amber-600 focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900"
          aria-label={`View ${mural.title} on map`}
        >
          View
        </button>
      </div>
    </div>
  );
}

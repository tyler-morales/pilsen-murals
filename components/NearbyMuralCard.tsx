"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useMuralStore } from "@/store/muralStore";
import { useProximityStore } from "@/store/proximityStore";
import { useLocationStore } from "@/store/locationStore";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useHaptics } from "@/hooks/useHaptics";
import {
  formatDistance,
  haversineDistanceMeters,
  bearingToDirectionText,
} from "@/lib/geo";
import { getDirectionsUrl } from "@/lib/directions";
import { getArtistInstagramUrl } from "@/lib/instagram";
import type { Collection } from "@/types/collection";
import type { Mural } from "@/types/mural";

/** Parse "Date taken" (e.g. "2025:04:23 14:19:12") and return a short light tip or null. */
function getPhotoLightTip(dateTaken: string | undefined): string | null {
  if (!dateTaken?.trim()) return null;
  const parts = dateTaken.trim().split(" ");
  const timePart = parts[1];
  if (!timePart) return null;
  const [h] = timePart.split(":");
  const hour = parseInt(h ?? "12", 10);
  if (Number.isNaN(hour)) return null;
  if (hour < 12) return "Photo taken in morning — similar light now.";
  return "Photo taken in afternoon — similar light now.";
}

interface NearbyMuralCardProps {
  activeTour?: Collection | null;
  orderedMurals?: Mural[];
}

/**
 * Card shown when user is within radius of one or more murals. Shows the closest first;
 * View opens the modal and advances to the next nearby; Dismiss closes the entire card until user leaves and re-enters range.
 */
export function NearbyMuralCard({
  activeTour = null,
  orderedMurals = [],
}: NearbyMuralCardProps) {
  const {
    currentNearby,
    nearbyQueue,
    showIndex,
    showNext,
    showPrev,
    currentDistanceM,
    exitDirection,
    dismissed,
    dismissAll,
    markSeen,
  } = useProximityStore();
  const userCoords = useLocationStore((s) => s.userCoords);
  const requestFlyTo = useMuralStore((s) => s.requestFlyTo);
  const prefersReducedMotion = usePrefersReducedMotion();
  const haptics = useHaptics();
  const prevNearbyIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (currentNearby && currentNearby.id !== prevNearbyIdRef.current) {
      prevNearbyIdRef.current = currentNearby.id;
      haptics.pulse();
    }
    if (!currentNearby) prevNearbyIdRef.current = null;
  }, [currentNearby?.id, haptics]);

  const tourContext = useMemo(() => {
    if (!activeTour || !currentNearby || !orderedMurals.length) return null;
    const idx = activeTour.muralIds.indexOf(currentNearby.id);
    if (idx < 0) return null;
    const stopIndex = idx + 1;
    const totalStops = activeTour.muralIds.length;
    const nextMural =
      idx + 1 < orderedMurals.length ? orderedMurals[idx + 1] ?? null : null;
    const nextDistanceM =
      nextMural && userCoords
        ? haversineDistanceMeters(userCoords, nextMural.coordinates)
        : null;
    return {
      stopIndex,
      totalStops,
      tourName: activeTour.name,
      nextMural,
      nextDistanceM,
    };
  }, [activeTour, currentNearby, orderedMurals, userCoords]);

  const photoLightTip = currentNearby
    ? getPhotoLightTip(currentNearby.imageMetadata?.["Date taken"])
    : null;

  const handleView = () => {
    if (!currentNearby) return;
    markSeen(currentNearby.id);
    requestFlyTo(currentNearby);
    showNext();
  };

  const handleDismiss = () => {
    nearbyQueue.forEach(({ mural }) => markSeen(mural.id));
    dismissAll();
  };

  const handlePrev = () => {
    if (showIndex <= 0) return;
    const prevEntry = nearbyQueue[showIndex - 1];
    if (prevEntry) {
      requestFlyTo(prevEntry.mural, { openModalAfterFly: false });
      showPrev();
    }
  };

  const handleNext = () => {
    if (showIndex >= nearbyQueue.length - 1) return;
    const nextEntry = nearbyQueue[showIndex + 1];
    if (nextEntry) {
      requestFlyTo(nextEntry.mural, { openModalAfterFly: false });
      showNext();
    }
  };

  const [shareFeedback, setShareFeedback] = useState<"copied" | "failed" | null>(null);
  const handleShare = useCallback(async () => {
    if (!currentNearby) return;
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/?mural=${currentNearby.id}`;
    const title = currentNearby.title;
    const text = `${currentNearby.title}${currentNearby.artist ? ` by ${currentNearby.artist}` : ""}`;
    const scheduleClear = () => {
      setTimeout(() => setShareFeedback(null), 2000);
    };
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text, url });
        haptics.success();
        setShareFeedback("copied");
        scheduleClear();
        return;
      } catch {
        // fall through to copy
      }
    }
    try {
      await navigator.clipboard?.writeText(url);
      haptics.success();
      setShareFeedback("copied");
      scheduleClear();
    } catch {
      setShareFeedback("failed");
      scheduleClear();
    }
  }, [currentNearby, haptics]);

  const transition = prefersReducedMotion ? { duration: 0 } : { type: "spring" as const, damping: 25, stiffness: 300 };
  const exitX = exitDirection === "left" ? "-100%" : exitDirection === "right" ? "100%" : 0;

  return (
    <AnimatePresence mode="wait">
      {currentNearby && !dismissed && (
        <motion.section
          key={currentNearby.id}
          role="region"
          aria-label={
            nearbyQueue.length > 0
              ? `Nearby mural ${showIndex + 1} of ${nearbyQueue.length}: ${currentNearby.title}`
              : `Nearby mural: ${currentNearby.title}`
          }
          initial={{ opacity: 0, y: 16, x: exitDirection === "left" ? 80 : exitDirection === "right" ? -80 : 0 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          exit={{ opacity: 0, x: exitX }}
          transition={transition}
          className="safe-bottom absolute bottom-4 left-2 right-2 z-20 overflow-visible rounded-xl sm:left-4 sm:right-14 sm:max-w-sm"
        >
          <motion.div
            className="overflow-hidden rounded-xl border border-white/20 bg-white/95 shadow-xl backdrop-blur-sm border-t-4"
            style={{ borderTopColor: currentNearby.dominantColor }}
          >
            <div className="flex gap-3 p-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                <Image
                  src={currentNearby.thumbnail ?? currentNearby.imageUrl}
                  alt=""
                  width={56}
                  height={56}
                  sizes="56px"
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 flex items-center gap-1 flex-wrap">
                  <span>You&apos;re near</span>
                  {nearbyQueue.length > 1 ? (
                    <span className="normal-case font-normal flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={handlePrev}
                        disabled={showIndex === 0}
                        className="rounded p-0.5 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 disabled:opacity-40 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1"
                        aria-label="Previous nearby mural"
                      >
                        ←
                      </button>
                      <span className="min-w-[3.5rem] text-center" aria-live="polite">
                        {showIndex + 1} of {nearbyQueue.length}
                      </span>
                      <button
                        type="button"
                        onClick={handleNext}
                        disabled={showIndex === nearbyQueue.length - 1}
                        className="rounded p-0.5 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 disabled:opacity-40 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1"
                        aria-label="Next nearby mural"
                      >
                        →
                      </button>
                    </span>
                  ) : nearbyQueue.length === 1 ? (
                    <span className="normal-case font-normal">(1 nearby)</span>
                  ) : null}
                </p>
                {tourContext && (
                  <p className="text-xs text-zinc-500" aria-live="polite">
                    Stop {tourContext.stopIndex} of {tourContext.totalStops}
                    {tourContext.tourName ? ` · ${tourContext.tourName}` : ""}
                  </p>
                )}
                <p className="truncate text-sm font-semibold text-zinc-900">
                  {currentNearby.title}
                </p>
                {(currentNearby.artist ||
                  currentNearby.artistInstagramHandle) && (
                    <p className="truncate text-xs text-zinc-600">
                      {currentNearby.artistInstagramHandle &&
                        (!currentNearby.artist?.trim() ||
                          currentNearby.artist === "Unknown Artist") ? (
                        <a
                          href={getArtistInstagramUrl(currentNearby.artistInstagramHandle)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-[var(--color-accent)] underline decoration-[var(--color-accent)] underline-offset-2 transition-colors hover:text-[var(--color-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1 rounded"
                          aria-label="View artist on Instagram"
                        >
                          @{currentNearby.artistInstagramHandle.replace(/^@/, "")}
                        </a>
                      ) : (
                        <>
                          {currentNearby.artist}
                          {currentNearby.artistInstagramHandle && (
                            <>
                              {" "}
                              <a
                                href={getArtistInstagramUrl(currentNearby.artistInstagramHandle)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-[var(--color-accent)] underline decoration-[var(--color-accent)] underline-offset-2 transition-colors hover:text-[var(--color-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1 rounded"
                                aria-label={`View ${currentNearby.artist} on Instagram`}
                              >
                                @{currentNearby.artistInstagramHandle.replace(/^@/, "")}
                              </a>
                            </>
                          )}
                        </>
                      )}
                    </p>
                  )}
                {currentDistanceM != null && (
                  <p className="text-xs text-zinc-500">
                    {formatDistance(currentDistanceM)}
                  </p>
                )}
                {typeof currentNearby.bearing === "number" && (
                  <p className="text-xs text-zinc-500">
                    {bearingToDirectionText(currentNearby.bearing)}
                  </p>
                )}
                {tourContext?.nextMural && (
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Next: {tourContext.nextMural.title}
                    {tourContext.nextDistanceM != null &&
                      ` (${formatDistance(tourContext.nextDistanceM)})`}
                  </p>
                )}
                {photoLightTip && (
                  <p className="mt-0.5 text-xs italic text-zinc-500">
                    {photoLightTip}
                  </p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0">
                  <a
                    href={getDirectionsUrl(currentNearby)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-xs font-medium text-[var(--color-accent)] underline decoration-[var(--color-accent)] underline-offset-2 transition-colors hover:text-[var(--color-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1 rounded"
                    aria-label={`Get directions to ${currentNearby.title}`}
                  >
                    Get directions
                  </a>
                  <button
                    type="button"
                    onClick={handleShare}
                    className="text-xs font-medium text-[var(--color-accent)] underline decoration-[var(--color-accent)] underline-offset-2 transition-colors hover:text-[var(--color-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1 rounded bg-transparent border-0 p-0 cursor-pointer"
                    aria-label={`Share ${currentNearby.title}`}
                  >
                    {shareFeedback === "copied"
                      ? "Link copied"
                      : shareFeedback === "failed"
                        ? "Couldn't copy"
                        : "Share"}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex border-t border-zinc-100">
              <button
                type="button"
                onClick={handleDismiss}
                className="min-h-[44px] flex-1 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]"
                aria-label="Dismiss all nearby alerts"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={handleView}
                className="min-h-[44px] flex-1 border-l border-zinc-100 text-sm font-semibold text-[var(--color-accent)] transition-colors hover:bg-amber-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]"
                aria-label={`View ${currentNearby.title} on map`}
              >
                View
              </button>
            </div>
          </motion.div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Footprints, List, Map } from "lucide-react";
import { useMuralStore } from "@/store/muralStore";
import { useHaptics } from "@/hooks/useHaptics";
import type { Mural } from "@/types/mural";
import type { Collection } from "@/types/collection";

type TabId = "map" | "browse" | "tours";

interface MapHeaderProps {
  murals: Mural[];
  onMapClick?: () => void;
  onBrowseClick?: () => void;
  isListOpen?: boolean;
  /** When set, header shows "Leave tour" and optional tour name. */
  activeTour?: Collection | null;
  onToursClick?: () => void;
  onLeaveTour?: () => void;
  isTourListOpen?: boolean;
  /** Opens the "Check a mural" modal (camera/upload + search). */
  onCheckMuralClick?: () => void;
}

export function MapHeader({
  murals,
  onMapClick,
  onBrowseClick,
  isListOpen = false,
  activeTour = null,
  onToursClick,
  onLeaveTour,
  isTourListOpen = false,
  onCheckMuralClick,
}: MapHeaderProps) {
  const requestFlyTo = useMuralStore((s) => s.requestFlyTo);
  const activeMural = useMuralStore((s) => s.activeMural);
  const haptics = useHaptics();

  const activeTab: TabId =
    isListOpen ? "browse" : activeTour || isTourListOpen ? "tours" : "map";
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState({ left: 0, width: 0 });
  const measurePill = useCallback(() => {
    const idx = activeTab === "map" ? 0 : activeTab === "browse" ? 1 : 2;
    const el = tabRefs.current[idx];
    if (el) {
      setPill({ left: el.offsetLeft, width: el.offsetWidth });
    }
  }, [activeTab]);

  useEffect(() => {
    measurePill();
    const t = requestAnimationFrame(() => measurePill());
    return () => cancelAnimationFrame(t);
  }, [measurePill]);

  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measurePill);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measurePill]);

  const handleSurpriseMe = () => {
    if (murals.length === 0) return;
    haptics.success();
    const index = Math.floor(Math.random() * murals.length);
    requestFlyTo(murals[index]);
  };

  const tourCurrentIndex =
    activeTour && murals.length > 0 && activeMural
      ? murals.findIndex((m) => m.id === activeMural.id)
      : 0;
  const tourStopOneBased = tourCurrentIndex >= 0 ? tourCurrentIndex + 1 : 1;
  const nextMural =
    activeTour && murals.length > 0 && tourStopOneBased < murals.length
      ? murals[tourStopOneBased]
      : null;

  return (
    <header
      className="safe-top absolute left-2 right-2 top-2 z-30 flex min-w-0 flex-col gap-2 overflow-visible rounded-2xl border border-white/20 bg-white/85 px-3 pb-3 pt-3 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.08)] backdrop-blur-xl sm:left-4 sm:right-4 sm:flex-row sm:flex-nowrap sm:items-center sm:gap-x-3 sm:gap-y-0 sm:rounded-2xl sm:px-4 sm:pb-2 sm:pt-3 md:right-auto md:max-w-4xl md:border-white/30 md:shadow-lg"
      aria-label="Map header"
    >
      <div className="flex min-w-0 shrink items-center justify-between gap-2 sm:flex-1 sm:min-w-0 sm:justify-start">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
          <div className="flex min-w-0 w-full items-baseline justify-between gap-2">
            {activeTour ? (
              <h1 className="min-w-0 break-words text-2xl font-semibold leading-tight tracking-tight text-zinc-900 sm:text-3xl">
                {activeTour.name}
              </h1>
            ) : (
              <h1 className="min-w-0 break-words text-2xl font-semibold leading-tight tracking-tight text-zinc-900 sm:text-3xl">
                <button
                  type="button"
                  onClick={handleSurpriseMe}
                  disabled={murals.length === 0}
                  className="cursor-pointer text-left text-2xl font-semibold leading-tight tracking-tight text-zinc-900 transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-50 sm:text-3xl"
                  aria-label="The Pilsen Mural Project — click to show a random mural"
                >
                  The Pilsen Mural Project
                </button>
              </h1>
            )}
            <span className="shrink-0 text-sm text-zinc-500 sm:text-zinc-600" aria-label="Number of murals">
              {murals.length} mural{murals.length !== 1 ? "s" : ""}
            </span>
          </div>
          {activeTour && murals.length > 0 && (
            <span
              className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium text-amber-800"
              aria-label={`Tour progress: stop ${tourStopOneBased} of ${murals.length}`}
            >
              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5">
                Stop {tourStopOneBased} of {murals.length}
              </span>
              {nextMural && (
                <span className="truncate text-zinc-600" title={`Next: ${nextMural.title}`}>
                  Next: {nextMural.title}
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Tabs: Map | Browse | Tours — sliding fill indicates active */}
      <div className="flex w-full min-w-0 flex-1 shrink-0 items-center gap-2 sm:flex-1 sm:flex-nowrap">
        <div
          ref={containerRef}
          className="relative flex min-h-[44px] min-w-0 flex-1 flex-row overflow-hidden rounded-xl bg-zinc-100/90 p-1 sm:min-w-0 sm:flex-1"
          role="tablist"
          aria-label="Main navigation"
        >
          {/* Sliding pill — animates to active tab */}
          <div
            className="pointer-events-none absolute top-1 bottom-1 rounded-lg bg-[var(--color-accent)] shadow-sm transition-[left,width] duration-200 ease-out"
            style={{ left: pill.left + 4, width: pill.width - 8 }}
            aria-hidden
          />
          {onMapClick && (
            <button
              ref={(el) => { tabRefs.current[0] = el; }}
              type="button"
              role="tab"
              aria-selected={activeTab === "map"}
              aria-label="Map view"
              onClick={() => { haptics.nudge(); onMapClick(); }}
              className={`relative z-10 flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-100 disabled:pointer-events-none sm:flex-initial sm:px-4 ${activeTab === "map" ? "text-[var(--color-accent-foreground)]" : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"}`}
            >
              <Map className="h-4 w-4 shrink-0" aria-hidden />
              <span>Map</span>
            </button>
          )}
          {onBrowseClick && (
            <button
              ref={(el) => { tabRefs.current[1] = el; }}
              type="button"
              role="tab"
              aria-selected={activeTab === "browse"}
              aria-expanded={isListOpen}
              aria-label="Browse all murals"
              onClick={() => { haptics.nudge(); onBrowseClick(); }}
              className={`relative z-10 flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-100 disabled:pointer-events-none sm:flex-initial sm:px-4 ${activeTab === "browse" ? "text-[var(--color-accent-foreground)]" : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"}`}
            >
              <List className="h-4 w-4 shrink-0" aria-hidden />
              <span>Browse</span>
            </button>
          )}
          {activeTour && onLeaveTour ? (
            <button
              ref={(el) => { tabRefs.current[2] = el; }}
              type="button"
              role="tab"
              aria-selected={activeTab === "tours"}
              aria-label="Leave tour and show all murals"
              onClick={() => { haptics.nudge(); onLeaveTour(); }}
              className={`relative z-10 flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-100 sm:flex-initial sm:px-4 ${activeTab === "tours" ? "text-[var(--color-accent-foreground)]" : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"}`}
            >
              <Footprints className="h-4 w-4 shrink-0" aria-hidden />
              <span>Leave tour</span>
            </button>
          ) : onToursClick ? (
            <button
              ref={(el) => { tabRefs.current[2] = el; }}
              type="button"
              role="tab"
              aria-selected={activeTab === "tours"}
              aria-expanded={isTourListOpen}
              aria-label="Walking tours"
              onClick={() => { haptics.nudge(); onToursClick(); }}
              className={`relative z-10 flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-100 sm:flex-initial sm:px-4 ${activeTab === "tours" ? "text-[var(--color-accent-foreground)]" : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"}`}
            >
              <Footprints className="h-4 w-4 shrink-0" aria-hidden />
              <span>Tours</span>
            </button>
          ) : null}
        </div>
        {onCheckMuralClick && (
          <button
            type="button"
            onClick={onCheckMuralClick}
            className="flex h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-[var(--color-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            aria-label="Check a mural — take or upload a photo to see if it's in our database"
            title="Check a mural"
          >
            <Camera className="h-8 w-8 shrink-0" aria-hidden />
          </button>
        )}
      </div>
    </header>
  );
}

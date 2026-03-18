"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Footprints, LayoutGrid, Map, User } from "lucide-react";
import { useMuralStore } from "@/store/muralStore";
import { useAuthStore } from "@/store/authStore";
import { useHaptics } from "@/hooks/useHaptics";
import type { Mural } from "@/types/mural";
import type { Collection } from "@/types/collection";

type TabId = "map" | "muraldex" | "tours" | "auth";

interface MapHeaderProps {
  murals: Mural[];
  onMapClick?: () => void;
  /** Toggles the Muraldex tab content (collection progress view). */
  onMuraldexClick?: () => void;
  isMuraldexOpen?: boolean;
  /** When set, header shows "Leave tour" and optional tour name. */
  activeTour?: Collection | null;
  onToursClick?: () => void;
  onLeaveTour?: () => void;
  isTourListOpen?: boolean;
  /** Opens the "Check a mural" modal (camera/upload + search). */
  onCheckMuralClick?: () => void;
  /** Opens the sign-in / account drawer. */
  onSignInClick?: () => void;
  /** When true, the Sign in / Account tab shows as active. */
  isAuthDrawerOpen?: boolean;
}

export function MapHeader({
  murals,
  onMapClick,
  onMuraldexClick,
  isMuraldexOpen = false,
  activeTour = null,
  onToursClick,
  onLeaveTour,
  isTourListOpen = false,
  onCheckMuralClick,
  onSignInClick,
  isAuthDrawerOpen = false,
}: MapHeaderProps) {
  const requestFlyTo = useMuralStore((s) => s.requestFlyTo);
  const activeMural = useMuralStore((s) => s.activeMural);
  const user = useAuthStore((s) => s.user);
  const haptics = useHaptics();

  const activeTab: TabId = isAuthDrawerOpen
    ? "auth"
    : isMuraldexOpen
      ? "muraldex"
      : activeTour || isTourListOpen
        ? "tours"
        : "map";
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState({ left: 0, width: 0 });
  const measurePill = useCallback(() => {
    const idx =
      activeTab === "map"
        ? 0
        : activeTab === "muraldex"
          ? 1
          : activeTab === "tours"
            ? 2
            : 3;
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
      <div className="flex min-w-0 shrink items-center justify-between gap-2 sm:flex-initial sm:min-w-0 sm:justify-start">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
          <div className="flex min-w-0 w-full justify-between gap-4 items-center">
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

      {/* Tabs: Map | Muraldex | Tours — sliding fill indicates active */}
      <div className="flex w-full min-w-0 flex-1 shrink-0 items-center gap-3 sm:flex-1 sm:flex-nowrap sm:gap-2">
        <div
          ref={containerRef}
          className="relative flex min-h-[44px] min-w-0 flex-1 flex-row flex-nowrap gap-1.5 overflow-x-auto rounded-xl bg-zinc-100/90 p-2 sm:min-w-0 sm:flex-1 [-webkit-overflow-scrolling:touch]"
          role="tablist"
          aria-label="Main navigation"
        >
          {/* Sliding pill — animates to active tab (inset matches p-2 = 8px) */}
          <div
            className="pointer-events-none absolute top-2 bottom-2 rounded-lg bg-[var(--color-accent)] shadow-sm transition-[left,width] duration-200 ease-out"
            style={{ left: pill.left + 8, width: pill.width - 16 }}
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
              className={`relative z-10 flex min-h-[40px] min-w-[72px] flex-shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-100 disabled:pointer-events-none sm:flex-initial sm:px-4 ${activeTab === "map" ? "text-[var(--color-accent-foreground)]" : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"}`}
            >
              <Map className="h-4 w-4 shrink-0" aria-hidden />
              <span>Map</span>
            </button>
          )}
          {onMuraldexClick && (
            <button
              ref={(el) => { tabRefs.current[1] = el; }}
              type="button"
              role="tab"
              aria-selected={activeTab === "muraldex"}
              aria-expanded={isMuraldexOpen}
              aria-label="Muraldex — collection progress"
              onClick={() => { haptics.nudge(); onMuraldexClick(); }}
              className={`relative z-10 flex min-h-[40px] min-w-[72px] flex-shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-100 disabled:pointer-events-none sm:flex-initial sm:px-4 ${activeTab === "muraldex" ? "text-[var(--color-accent-foreground)]" : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"}`}
            >
              <LayoutGrid className="h-4 w-4 shrink-0" aria-hidden />
              <span>Muraldex</span>
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
              className={`relative z-10 flex min-h-[40px] min-w-[72px] flex-shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-100 sm:flex-initial sm:px-4 ${activeTab === "tours" ? "text-[var(--color-accent-foreground)]" : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"}`}
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
              className={`relative z-10 flex min-h-[40px] min-w-[72px] flex-shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-100 disabled:pointer-events-none sm:flex-initial sm:px-4 ${activeTab === "tours" ? "text-[var(--color-accent-foreground)]" : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"}`}
            >
              <Footprints className="h-4 w-4 shrink-0" aria-hidden />
              <span>Tours</span>
            </button>
          ) : null}
          {onSignInClick && (
            <button
              ref={(el) => { tabRefs.current[3] = el; }}
              type="button"
              role="tab"
              aria-selected={activeTab === "auth"}
              aria-expanded={isAuthDrawerOpen}
              aria-label={user ? "Account" : "Sign in to sync your captures"}
              onClick={() => {
                haptics.nudge();
                onSignInClick();
              }}
              className={`relative z-10 flex min-h-[40px] min-w-[72px] flex-shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-100 disabled:pointer-events-none sm:flex-initial sm:px-4 ${activeTab === "auth" ? "text-[var(--color-accent-foreground)]" : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"}`}
            >
              <User className="h-4 w-4 shrink-0" aria-hidden />
              <span className="whitespace-nowrap hidden sm:inline">{user ? "Account" : "Sign in"}</span>
            </button>
          )}
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

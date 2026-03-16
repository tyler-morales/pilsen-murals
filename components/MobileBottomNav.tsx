"use client";

import { Camera, Footprints, LayoutGrid } from "lucide-react";
import { useHaptics } from "@/hooks/useHaptics";
import type { Collection } from "@/types/collection";

type TabId = "muraldex" | "tours";

interface MobileBottomNavProps {
  onMuraldexClick?: () => void;
  isMuraldexOpen?: boolean;
  activeTour?: Collection | null;
  onToursClick?: () => void;
  onLeaveTour?: () => void;
  isTourListOpen?: boolean;
  onCheckMuralClick?: () => void;
}

const tabBase =
  "relative z-10 flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1 rounded-xl py-2 text-[11px] font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none";
const activeTabClass =
  "text-[var(--color-accent)] bg-[var(--color-accent)]/10";
const inactiveTabClass = "text-zinc-400 hover:text-zinc-600 active:scale-[0.98]";

export function MobileBottomNav({
  onMuraldexClick,
  isMuraldexOpen = false,
  activeTour = null,
  onToursClick,
  onLeaveTour,
  isTourListOpen = false,
  onCheckMuralClick,
}: MobileBottomNavProps) {
  const haptics = useHaptics();
  const activeTab: TabId | null =
    isMuraldexOpen ? "muraldex" : activeTour || isTourListOpen ? "tours" : null;

  return (
    <nav
      className="safe-bottom safe-left safe-right fixed bottom-0 left-0 right-0 z-30 flex flex-row items-stretch md:hidden"
      aria-label="Main navigation"
    >
      <div className="mx-3 mb-3 flex min-h-[64px] w-[calc(100%-1.5rem)] flex-1 items-center rounded-2xl border border-zinc-200/80 bg-white/85 px-2 py-2 shadow-[0_-2px_12px_rgba(0,0,0,0.06),0_4px_24px_-4px_rgba(0,0,0,0.08)] backdrop-blur-2xl"
      >
        <div
          className="grid w-full min-w-0 grid-cols-3 items-center gap-1"
          role="tablist"
        >
          {onMuraldexClick && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "muraldex"}
              aria-expanded={isMuraldexOpen}
              aria-label="Muraldex — collection progress"
              onClick={() => {
                haptics.nudge();
                onMuraldexClick();
              }}
              className={`${tabBase} ${activeTab === "muraldex" ? activeTabClass : inactiveTabClass}`}
            >
              <LayoutGrid className="h-[22px] w-[22px] shrink-0" strokeWidth={activeTab === "muraldex" ? 2.25 : 1.75} aria-hidden />
              <span>Murals</span>
            </button>
          )}

          {onCheckMuralClick && (
            <button
              type="button"
              onClick={() => {
                haptics.nudge();
                onCheckMuralClick();
              }}
              className="flex min-h-[48px] flex-col items-center justify-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-white active:scale-95"
              aria-label="Check a mural — take or upload a photo to see if it's in our database"
              title="Check a mural"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-accent-foreground)] shadow-[0_2px_8px_rgba(226,126,166,0.35)]">
                <Camera className="h-5 w-5 shrink-0" aria-hidden />
              </span>
              <span className="text-[11px] font-medium text-zinc-500">Check</span>
            </button>
          )}

          {activeTour && onLeaveTour ? (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "tours"}
              aria-label="Leave tour and show all murals"
              onClick={() => {
                haptics.nudge();
                onLeaveTour();
              }}
              className={`${tabBase} ${activeTab === "tours" ? activeTabClass : inactiveTabClass}`}
            >
              <Footprints className="h-[22px] w-[22px] shrink-0" strokeWidth={activeTab === "tours" ? 2.25 : 1.75} aria-hidden />
              <span>Leave tour</span>
            </button>
          ) : onToursClick ? (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "tours"}
              aria-expanded={isTourListOpen}
              aria-label="Walking tours"
              onClick={() => {
                haptics.nudge();
                onToursClick();
              }}
              className={`${tabBase} ${activeTab === "tours" ? activeTabClass : inactiveTabClass}`}
            >
              <Footprints className="h-[22px] w-[22px] shrink-0" strokeWidth={activeTab === "tours" ? 2.25 : 1.75} aria-hidden />
              <span>Tours</span>
            </button>
          ) : null}
        </div>
      </div>
    </nav>
  );
}

"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useHaptics } from "@/hooks/useHaptics";
import { useCaptureStore } from "@/store/captureStore";
import { useLocationStore } from "@/store/locationStore";
import {
  DRAWER_DRAG_PROPS,
  DRAG_HANDLE_ROW_CLASSES,
  MOBILE_SHEET_BASE_CLASSES,
  shouldCloseDrawerOnDragEnd,
} from "@/lib/drawerSheet";
import { computeRarity, type Rarity } from "@/lib/rarity";
import { getMuralsWithinRadius, formatDistance } from "@/lib/geo";
import type { Mural } from "@/types/mural";

const SHEET = {
  hidden: { opacity: 0, y: "100%" },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: "100%" },
};

const SIDEBAR = {
  hidden: { opacity: 0, x: "100%" },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: "100%" },
};

const NEARBY_RADIUS_M = 120;

type Filter = "all" | "captured" | "nearby" | "undiscovered";

interface MuraldexViewProps {
  murals: Mural[];
  isOpen: boolean;
  onClose: () => void;
  onSelectMural: (mural: Mural) => void;
}

function getRarityBorderClass(rarity: Rarity): string {
  switch (rarity) {
    case "common":
      return "border-2 border-zinc-300";
    case "uncommon":
      return "muraldex-shimmer";
    case "rare":
      return "border-2 border-amber-400 muraldex-glow";
    case "legendary":
      return "border-2 border-transparent muraldex-holographic";
    default:
      return "border-2 border-zinc-300";
  }
}

export function MuraldexView({
  murals,
  isOpen,
  onClose,
  onSelectMural,
}: MuraldexViewProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const dialogRef = useRef<HTMLDivElement>(null);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const haptics = useHaptics();
  const hasCaptured = useCaptureStore((s) => s.hasCaptured);
  const getCaptureFor = useCaptureStore((s) => s.getCaptureFor);
  const userCoords = useLocationStore((s) => s.userCoords);

  useFocusTrap(dialogRef, isOpen);

  const discoveredCount = useMemo(
    () => murals.filter((m) => hasCaptured(m.id)).length,
    [murals, hasCaptured]
  );

  const nearbyMurals = useMemo(() => {
    if (!userCoords) return [];
    return getMuralsWithinRadius(userCoords, murals, NEARBY_RADIUS_M);
  }, [murals, userCoords]);

  const filteredMurals = useMemo(() => {
    switch (filter) {
      case "captured":
        return murals.filter((m) => hasCaptured(m.id));
      case "undiscovered":
        return murals.filter((m) => !hasCaptured(m.id));
      case "nearby":
        return nearbyMurals;
      default:
        return murals;
    }
  }, [murals, filter, hasCaptured, nearbyMurals]);

  const dragControls = useDragControls();
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const handleDrawerDragEnd = useCallback(
    (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
      if (shouldCloseDrawerOnDragEnd(info)) {
        haptics.nudge();
        onClose();
      }
    },
    [haptics, onClose]
  );

  const handleSelect = (mural: Mural) => {
    haptics.tap();
    onSelectMural(mural);
    onClose();
  };

  const variants = isDesktop ? SIDEBAR : SHEET;

  const MURALDEX_DESKTOP_CLASSES =
    "md:left-auto md:right-0 md:top-0 md:bottom-0 md:max-h-none md:w-full md:max-w-[420px] md:rounded-l-2xl md:rounded-tr-none md:border-l md:border-t-0";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            role="presentation"
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Muraldex — collection progress"
            className={`${MOBILE_SHEET_BASE_CLASSES} ${MURALDEX_DESKTOP_CLASSES}`}
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            {...(!isDesktop && {
              ...DRAWER_DRAG_PROPS,
              dragControls,
              onDragEnd: handleDrawerDragEnd,
            })}
          >
            <div
              className={DRAG_HANDLE_ROW_CLASSES}
              aria-hidden
              onPointerDown={!isDesktop ? (e) => dragControls.start(e) : undefined}
            >
              <span className="h-[5px] w-10 shrink-0 rounded-full bg-zinc-300" aria-hidden />
            </div>
            <div className="flex shrink-0 flex-col gap-3 border-b border-zinc-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[22px] font-bold text-zinc-900">Muraldex</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                  aria-label="Close Muraldex"
                >
                  <span className="text-lg font-medium">×</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-200">
                  <motion.div
                    className="h-full rounded-full bg-amber-500"
                    initial={false}
                    animate={{
                      width: `${murals.length ? (discoveredCount / murals.length) * 100 : 0}%`,
                    }}
                    transition={{ type: "tween", duration: 0.4 }}
                  />
                </div>
                <span className="shrink-0 text-mobile-subhead font-medium text-zinc-600">
                  {discoveredCount} / {murals.length} discovered
                </span>
              </div>
              <div
                role="tablist"
                aria-label="Filter murals"
                className="flex flex-wrap gap-2"
              >
                {(
                  [
                    ["all", "All"],
                    ["captured", "Captured"],
                    ["nearby", "Nearby"],
                    ["undiscovered", "Undiscovered"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={filter === value}
                    onClick={() => {
                      haptics.tap();
                      setFilter(value);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${filter === value
                      ? "bg-amber-500 text-white"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                      }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div
              ref={scrollAreaRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 touch-pan-y"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {filteredMurals.map((mural) => {
                  const captured = hasCaptured(mural.id);
                  const capture = getCaptureFor(mural.id);
                  const rarity = computeRarity(mural);
                  const borderClass = getRarityBorderClass(rarity);
                  return (
                    <button
                      key={mural.id}
                      type="button"
                      onClick={() => handleSelect(mural)}
                      className={`group flex flex-col overflow-hidden rounded-xl bg-zinc-100 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 ${borderClass}`}
                    >
                      <div className="relative aspect-[3/4] w-full overflow-hidden bg-zinc-200">
                        <Image
                          src={mural.thumbnail ?? mural.imageUrl}
                          alt={captured ? mural.title : "Undiscovered mural"}
                          width={200}
                          height={267}
                          className={`h-full w-full object-cover transition group-hover:scale-105 ${captured ? "" : "grayscale opacity-50"
                            }`}
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        />
                        {!captured && (
                          <div
                            className="absolute inset-0 flex items-center justify-center bg-black/30"
                            aria-hidden
                          >
                            <span className="text-2xl font-bold text-white drop-shadow-lg">
                              ???
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col gap-0.5 p-2">
                        <span
                          className={`line-clamp-2 text-mobile-footnote font-semibold ${captured ? "text-zinc-900" : "text-zinc-500"
                            }`}
                        >
                          {captured ? mural.title : "???"}
                        </span>
                        {captured && capture && (
                          <span className="text-mobile-caption text-zinc-500">
                            {capture.capturedAt
                              ? new Date(capture.capturedAt).toLocaleDateString(
                                undefined,
                                { month: "short", day: "numeric" }
                              )
                              : null}
                            {capture.distanceMeters != null &&
                              ` · ${formatDistance(capture.distanceMeters)}`}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {filteredMurals.length === 0 && (
                <p className="py-8 text-center text-mobile-subhead text-zinc-500">
                  {filter === "nearby" && !userCoords
                    ? "Enable location to see nearby murals."
                    : filter === "nearby"
                      ? "No murals in range."
                      : filter === "captured"
                        ? "No murals captured yet. Use the camera to identify one!"
                        : "No murals to show."}
                </p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

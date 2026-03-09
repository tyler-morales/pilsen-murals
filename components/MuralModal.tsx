"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import { useMuralStore } from "@/store/muralStore";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import type { Mural } from "@/types/mural";
import { getDirectionsUrl } from "@/lib/directions";
import { getArtistInstagramUrl } from "@/lib/instagram";

const BACKDROP = { hidden: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0 } };
const PANEL_RIGHT = {
  hidden: { opacity: 0, x: "100%" },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: "100%" },
};
const DRAWER_UP = {
  hidden: { opacity: 0, y: "100%" },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: "100%" },
};

const ASPECT_MIN = 9 / 16;
const ASPECT_MAX = 2;
const ASPECT_DEFAULT = 4 / 5;

function parsePx(value: string | undefined): number | null {
  if (!value) return null;
  const n = parseInt(value.replace(/px$/i, ""), 10);
  return Number.isNaN(n) ? null : n;
}

function getModalImageAspectRatio(mural: Mural): number {
  const w = parsePx(mural.imageMetadata?.Width);
  const h = parsePx(mural.imageMetadata?.Height);
  if (w != null && h != null && h > 0) {
    const ratio = w / h;
    return Math.max(ASPECT_MIN, Math.min(ASPECT_MAX, ratio));
  }
  return ASPECT_DEFAULT;
}

/** Parse "2025:04:23 14:19:12" to "April 2025" or "Apr 23, 2025". */
function formatPhotoDate(dateTaken: string | undefined): string | null {
  if (!dateTaken || !dateTaken.trim()) return null;
  const [datePart] = dateTaken.split(" ");
  if (!datePart) return null;
  const [y, m, d] = datePart.split(":");
  const year = parseInt(y ?? "0", 10);
  const month = parseInt(m ?? "0", 10) - 1;
  const day = parseInt(d ?? "0", 10);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;
  const date = new Date(year, month, day);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function MuralModal() {
  const {
    activeMural,
    isModalOpen,
    closeModal,
    muralsOrder,
    activeIndex,
    goPrev,
    goNext,
    requestFlyTo,
  } = useMuralStore();
  const [isImageExpanded, setIsImageExpanded] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [isEnlargedImageLoaded, setIsEnlargedImageLoaded] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const dragControls = useDragControls();
  const panelRef = useRef<HTMLElement>(null);
  const enlargedRef = useRef<HTMLDivElement>(null);

  useFocusTrap(panelRef, isModalOpen && !!activeMural && !isImageExpanded);
  useFocusTrap(enlargedRef, isImageExpanded);
  const panelVariants = isDesktop ? PANEL_RIGHT : DRAWER_UP;
  const canGoPrev = muralsOrder.length > 0 && activeIndex > 0;

  const handleDrawerDragEnd = (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
    const threshold = 80;
    const velocityThreshold = 300;
    if (info.offset.y > threshold || info.velocity.y > velocityThreshold) closeModal();
  };
  const canGoNext =
    muralsOrder.length > 0 && activeIndex < muralsOrder.length - 1;
  const panelTransition = prefersReducedMotion
    ? { duration: 0 }
    : { type: "spring" as const, damping: 28, stiffness: 300 };
  const backdropTransition = prefersReducedMotion ? { duration: 0 } : { duration: 0.2 };

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (isImageExpanded) setIsImageExpanded(false);
      else closeModal();
    };
    if (isModalOpen) {
      document.addEventListener("keydown", onEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onEscape);
      document.body.style.overflow = "";
    };
  }, [isModalOpen, closeModal, isImageExpanded]);

  useEffect(() => {
    if (!isModalOpen) {
      setIsImageExpanded(false);
      setIsImageLoaded(false);
      setIsEnlargedImageLoaded(false);
    }
  }, [isModalOpen]);

  useEffect(() => {
    if (!isImageExpanded) setIsEnlargedImageLoaded(false);
  }, [isImageExpanded]);

  useEffect(() => {
    if (activeMural) {
      setIsImageLoaded(false);
      setIsEnlargedImageLoaded(false);
    }
  }, [activeMural?.id]);

  return (
    <AnimatePresence mode="wait">
      {isModalOpen && activeMural && (
        <>
          <motion.div
            role="presentation"
            className="fixed inset-0 z-40 bg-black/60"
            variants={BACKDROP}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={backdropTransition}
            onClick={closeModal}
            aria-hidden
          />
          <AnimatePresence>
            {isImageExpanded && (
              <>
                <motion.div
                  role="presentation"
                  className="fixed inset-0 z-[60] bg-black/90"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setIsImageExpanded(false)}
                  aria-hidden
                />
                <motion.div
                  ref={enlargedRef}
                  role="dialog"
                  aria-modal="true"
                  aria-label={`Enlarged view: ${activeMural.title}`}
                  className="safe-top safe-right safe-bottom safe-left fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 md:p-8"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setIsImageExpanded(false)}
                >
                  {!isEnlargedImageLoaded && (
                    <div
                      className="absolute inset-0 m-auto h-48 w-48 max-h-[60vh] max-w-[60vw] loading-skeleton-soft rounded-lg bg-white/15"
                      aria-hidden
                    />
                  )}
                  <div className="absolute inset-0">
                    <Image
                      src={activeMural.thumbnail ?? activeMural.imageUrl}
                      alt=""
                      fill
                      sizes="90vw"
                      className="object-contain blur-2xl scale-105"
                      aria-hidden
                    />
                  </div>
                  <div className="absolute inset-0">
                    <Image
                      src={activeMural.imageUrl}
                      alt={`${activeMural.title} — full size`}
                      fill
                      sizes="90vw"
                      className={`object-contain cursor-default transition-opacity duration-300 ease-out ${isEnlargedImageLoaded ? "opacity-100" : "opacity-0"}`}
                      onLoad={() => setIsEnlargedImageLoaded(true)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsImageExpanded(false)}
                    className="absolute right-4 top-4 min-h-[44px] min-w-[44px] rounded-full bg-white/10 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                    aria-label="Close enlarged image"
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mural-modal-title"
            aria-describedby="mural-modal-desc"
            className="safe-left safe-right fixed z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl bottom-0 left-0 right-0 max-h-[90vh] rounded-t-3xl border-t border-zinc-100 md:bottom-auto md:left-auto md:right-0 md:top-0 md:h-full md:max-h-none md:rounded-none md:border-t-0 md:border-l md:border-zinc-200 safe-top"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={panelTransition}
            onClick={(e) => e.stopPropagation()}
            {...(!isDesktop && {
              drag: "y",
              dragConstraints: { top: 0 },
              dragElastic: { top: 0, bottom: 0.25 },
              dragControls,
              onDragEnd: handleDrawerDragEnd,
            })}
          >
            <div
              className="flex min-h-[44px] cursor-grab active:cursor-grabbing flex-col items-center justify-center pt-3 pb-1 md:cursor-default md:min-h-0 md:pt-0 md:pb-0"
              aria-hidden
              onPointerDown={!isDesktop ? (e) => dragControls.start(e) : undefined}
            >
              <span className="h-1.5 w-12 shrink-0 rounded-full bg-zinc-300" aria-hidden />
            </div>
            <div
              className="h-1 w-full shrink-0"
              style={{ backgroundColor: activeMural.dominantColor }}
              aria-hidden
            />
            <div className="flex flex-1 flex-col overflow-y-auto">
              <div
                className="relative w-full shrink-0 overflow-hidden bg-zinc-100"
                style={{ aspectRatio: getModalImageAspectRatio(activeMural) }}
              >
                {!isImageLoaded && (
                  <div
                    className="absolute inset-0 loading-skeleton-soft bg-zinc-200/80"
                    aria-hidden
                  />
                )}
                <Image
                  src={activeMural.thumbnail ?? activeMural.imageUrl}
                  alt=""
                  fill
                  sizes="(max-width: 512px) 100vw, 512px"
                  className="object-cover blur-xl scale-105"
                  aria-hidden
                />
                <button
                  type="button"
                  onClick={() => setIsImageExpanded(true)}
                  className="relative h-full w-full cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-inset"
                  aria-label={`View larger image of ${activeMural.title}`}
                >
                  <Image
                    src={activeMural.imageUrl}
                    alt={`Mural: ${activeMural.title} by ${activeMural.artist}`}
                    fill
                    sizes="(max-width: 512px) 100vw, 512px"
                    className={`object-contain transition-opacity duration-300 ease-out ${isImageLoaded ? "opacity-100" : "opacity-0"}`}
                    onLoad={() => setIsImageLoaded(true)}
                    onError={() => setIsImageLoaded(true)}
                  />
                </button>
                <div
                  className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white to-transparent pointer-events-none"
                  aria-hidden
                />
              </div>
              <div className="flex flex-1 flex-col px-6 pb-8 pt-6">
                <h2
                  id="mural-modal-title"
                  className="font-serif text-3xl font-light tracking-tight text-zinc-900"
                >
                  {activeMural.title}
                </h2>
                <p className="mt-1 text-zinc-600">by {activeMural.artist}</p>
                {activeMural.artistInstagramHandle && (
                  <a
                    href={getArtistInstagramUrl(activeMural.artistInstagramHandle)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-block text-sm font-medium text-amber-700 underline decoration-amber-700/50 underline-offset-2 transition-colors hover:text-amber-800 hover:decoration-amber-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 rounded"
                    aria-label={`View ${activeMural.artist} on Instagram`}
                  >
                    View on Instagram
                  </a>
                )}
                {formatPhotoDate(activeMural.imageMetadata?.["Date taken"]) && (
                  <p className="mt-0.5 text-sm text-zinc-500" aria-label="Date photo was taken">
                    {formatPhotoDate(activeMural.imageMetadata?.["Date taken"])}
                  </p>
                )}
                <p id="mural-modal-desc" className="mt-4 text-sm text-zinc-600">
                  {activeMural.address || "Address not recorded"}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                <a
                  href={getDirectionsUrl(activeMural)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-fit items-center gap-2 text-sm font-medium text-amber-700 underline decoration-amber-700/50 underline-offset-2 transition-colors hover:text-amber-800 hover:decoration-amber-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 rounded"
                  aria-label="Get directions to this mural in Google Maps"
                >
                  Get directions
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    closeModal();
                    requestFlyTo(activeMural, { openModalAfterFly: false });
                  }}
                  className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700 underline decoration-zinc-400 underline-offset-2 transition-colors hover:text-zinc-900 hover:decoration-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 rounded"
                  aria-label="View this mural on the map"
                >
                  View on map
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                </div>
                <div className="mt-6 flex items-center gap-3">
                  <span className="text-xs uppercase tracking-wider text-zinc-500">
                    Dominant color
                  </span>
                  <div
                    className="h-8 w-20 rounded border border-zinc-200"
                    style={{ backgroundColor: activeMural.dominantColor }}
                    title={activeMural.dominantColor}
                  />
                  <span className="font-mono text-sm text-zinc-600">
                    {activeMural.dominantColor}
                  </span>
                </div>
                {activeMural.imageMetadata &&
                  Object.keys(activeMural.imageMetadata).length > 0 && (
                    <details
                      className="mt-6 border-t border-zinc-200 pt-6 group/details"
                      aria-labelledby="image-metadata-heading"
                    >
                      <summary
                        id="image-metadata-heading"
                        className="cursor-pointer list-none text-xs font-medium uppercase tracking-wider text-zinc-500 hover:text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 rounded"
                      >
                        Image metadata
                      </summary>
                      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                        {Object.entries(activeMural.imageMetadata).map(
                          ([label, value]) => (
                            <div key={label}>
                              <dt className="text-xs text-zinc-500">
                                {label}
                              </dt>
                              <dd className="mt-0.5 font-mono text-sm text-zinc-700">
                                {value}
                              </dd>
                            </div>
                          )
                        )}
                      </dl>
                    </details>
                  )}
              </div>
            </div>
            <div className="safe-bottom-footer border-t border-zinc-200 bg-zinc-50 p-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={!canGoPrev}
                  className="flex-1 min-h-[44px] rounded-lg border border-zinc-200 bg-white py-3 text-sm font-medium text-zinc-900 shadow-sm transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50"
                  aria-label="Previous mural"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!canGoNext}
                  className="flex-1 min-h-[44px] rounded-lg border border-zinc-200 bg-white py-3 text-sm font-medium text-zinc-900 shadow-sm transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50"
                  aria-label="Next mural"
                >
                  Next
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 min-h-[44px] rounded-lg border border-zinc-200 bg-white py-3 text-sm font-medium text-zinc-900 shadow-sm transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                >
                  Close
                </button>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import { useMuralStore } from "@/store/muralStore";
import { useMapStore } from "@/store/mapStore";
import { useLocationStore } from "@/store/locationStore";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useHaptics } from "@/hooks/useHaptics";
import type { Mural } from "@/types/mural";
import { getDirectionsUrl } from "@/lib/directions";
import { getArtistInstagramUrl } from "@/lib/instagram";

const MINIMAP_MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const MINIMAP_STYLE_STANDARD = "mapbox://styles/mapbox/standard";
const MINIMAP_STYLE_SATELLITE = "mapbox://styles/mapbox/satellite-streets-v12";
const MINIMAP_ZOOM = 15;
const MINIMAP_MURAL_SOURCE_ID = "minimap-mural";
const MINIMAP_MURAL_LAYER_ID = "minimap-mural-dot";
const MINIMAP_USER_SOURCE_ID = "minimap-user";
const MINIMAP_USER_LAYER_ID = "minimap-user-dot";

const BACKDROP = { hidden: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0 } };

/** Duration for fade from enlarged photo to map (matches map fly duration). */
const TRANSITION_TO_MAP_DURATION_MS = 2000;
const TRANSITION_TO_MAP_DURATION_REDUCED_MS = 400;
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
    goToIndex,
    requestFlyTo,
  } = useMuralStore();
  const mapStyle = useMapStore((s) => s.mapStyle);
  const [isImageExpanded, setIsImageExpanded] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [isEnlargedImageLoaded, setIsEnlargedImageLoaded] = useState(false);
  const [isTransitioningToMap, setIsTransitioningToMap] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const dragControls = useDragControls();
  const haptics = useHaptics();
  const panelRef = useRef<HTMLElement>(null);
  const enlargedRef = useRef<HTMLDivElement>(null);
  const touchStartXRef = useRef<number | null>(null);
  const swipeContainerRef = useRef<HTMLDivElement>(null);
  const minimapContainerRef = useRef<HTMLDivElement>(null);

  const [swipeOffset, setSwipeOffset] = useState(0);
  const [slideWidth, setSlideWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingTransition, setPendingTransition] = useState<"next" | "prev" | null>(null);
  const minimapRef = useRef<import("mapbox-gl").Map | null>(null);

  useFocusTrap(panelRef, isModalOpen && !!activeMural && !isImageExpanded);
  useFocusTrap(enlargedRef, isImageExpanded);
  const panelVariants = isDesktop ? PANEL_RIGHT : DRAWER_UP;
  const canGoPrev = muralsOrder.length > 0 && activeIndex > 0;

  const handleDrawerDragEnd = (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
    const threshold = 80;
    const velocityThreshold = 300;
    if (info.offset.y > threshold || info.velocity.y > velocityThreshold) {
      haptics.nudge();
      closeModal();
    }
  };
  const canGoNext =
    muralsOrder.length > 0 && activeIndex < muralsOrder.length - 1;
  const nextMural = canGoNext ? muralsOrder[activeIndex + 1] : null;
  const prevMural = canGoPrev ? muralsOrder[activeIndex - 1] : null;

  const handlePrev = () => {
    haptics.tap();
    if (prevMural) requestFlyTo(prevMural, { openModalAfterFly: false });
    goPrev();
  };
  const handleNext = () => {
    haptics.tap();
    if (nextMural) requestFlyTo(nextMural, { openModalAfterFly: false });
    goNext();
  };

  const handleEnlargedPrev = useCallback(() => {
    if (muralsOrder.length === 0) return;
    const newIndex =
      activeIndex === 0 ? muralsOrder.length - 1 : activeIndex - 1;
    goToIndex(newIndex);
    requestFlyTo(muralsOrder[newIndex], { openModalAfterFly: false });
  }, [muralsOrder, activeIndex, goToIndex, requestFlyTo]);
  const handleEnlargedNext = useCallback(() => {
    if (muralsOrder.length === 0) return;
    const newIndex =
      activeIndex === muralsOrder.length - 1 ? 0 : activeIndex + 1;
    goToIndex(newIndex);
    requestFlyTo(muralsOrder[newIndex], { openModalAfterFly: false });
  }, [muralsOrder, activeIndex, goToIndex, requestFlyTo]);

  const prevIndex =
    muralsOrder.length > 0 ? (activeIndex === 0 ? muralsOrder.length - 1 : activeIndex - 1) : 0;
  const nextIndex =
    muralsOrder.length > 0 ? (activeIndex === muralsOrder.length - 1 ? 0 : activeIndex + 1) : 0;
  const prevMuralEnlarged = muralsOrder[prevIndex] ?? null;
  const nextMuralEnlarged = muralsOrder[nextIndex] ?? null;

  useLayoutEffect(() => {
    if (!isImageExpanded || muralsOrder.length <= 1) return;
    const el = swipeContainerRef.current;
    if (!el) return;
    const update = () => setSlideWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isImageExpanded, muralsOrder.length]);

  useEffect(() => {
    if (!isImageExpanded) {
      setSwipeOffset(0);
      setPendingTransition(null);
    }
  }, [isImageExpanded]);

  const SWIPE_THRESHOLD_PX = 50;
  const handleEnlargedTouchStart = useCallback((e: React.TouchEvent) => {
    if (muralsOrder.length <= 1) return;
    touchStartXRef.current = e.touches[0].clientX;
    setIsDragging(true);
  }, [muralsOrder.length]);
  const handleEnlargedTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (muralsOrder.length <= 1 || touchStartXRef.current == null) return;
      const x = e.touches[0].clientX;
      const delta = x - touchStartXRef.current;
      const clamp = slideWidth > 0 ? Math.max(-slideWidth, Math.min(slideWidth, delta)) : 0;
      setSwipeOffset(clamp);
    },
    [muralsOrder.length, slideWidth]
  );
  const handleEnlargedTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (muralsOrder.length <= 1 || touchStartXRef.current == null) return;
      const endX = e.changedTouches[0].clientX;
      const deltaX = endX - touchStartXRef.current;
      touchStartXRef.current = null;
      setIsDragging(false);
      if (deltaX < -SWIPE_THRESHOLD_PX) {
        haptics.tap();
        setPendingTransition("next");
        setSwipeOffset(slideWidth);
      } else if (deltaX > SWIPE_THRESHOLD_PX) {
        haptics.tap();
        setPendingTransition("prev");
        setSwipeOffset(-slideWidth);
      } else {
        setSwipeOffset(0);
      }
    },
    [muralsOrder.length, slideWidth, haptics]
  );

  const handleEnlargedAnimationComplete = useCallback(() => {
    if (pendingTransition === "next") {
      handleEnlargedNext();
      setSwipeOffset(0);
      setPendingTransition(null);
    } else if (pendingTransition === "prev") {
      handleEnlargedPrev();
      setSwipeOffset(0);
      setPendingTransition(null);
    }
  }, [pendingTransition, handleEnlargedNext, handleEnlargedPrev]);

  const handleEnlargedPrevWithAnimation = useCallback(() => {
    haptics.tap();
    if (muralsOrder.length <= 1 || slideWidth <= 0) {
      handleEnlargedPrev();
      return;
    }
    setPendingTransition("prev");
    setSwipeOffset(-slideWidth);
  }, [muralsOrder.length, slideWidth, handleEnlargedPrev, haptics]);

  const handleEnlargedNextWithAnimation = useCallback(() => {
    haptics.tap();
    if (muralsOrder.length <= 1 || slideWidth <= 0) {
      handleEnlargedNext();
      return;
    }
    setPendingTransition("next");
    setSwipeOffset(slideWidth);
  }, [muralsOrder.length, slideWidth, handleEnlargedNext, haptics]);

  const handleMinimapClick = useCallback(() => {
    if (!activeMural) return;
    // Start map fly and fade modal so user sees smooth transition from photo to map.
    requestFlyTo(activeMural, { openModalAfterFly: false });
    setIsTransitioningToMap(true);
  }, [activeMural, requestFlyTo]);

  const transitionToMapDuration = prefersReducedMotion
    ? TRANSITION_TO_MAP_DURATION_REDUCED_MS / 1000
    : TRANSITION_TO_MAP_DURATION_MS / 1000;

  const handleTransitionToMapComplete = useCallback(() => {
    if (!isTransitioningToMap) return;
    setIsTransitioningToMap(false);
    setIsImageExpanded(false);
    closeModal();
  }, [isTransitioningToMap]);

  const panelTransition = prefersReducedMotion
    ? { duration: 0 }
    : { type: "spring" as const, damping: 28, stiffness: 300 };
  const backdropTransition = prefersReducedMotion ? { duration: 0 } : { duration: 0.2 };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isImageExpanded) setIsImageExpanded(false);
        else closeModal();
        return;
      }
      if (isImageExpanded && muralsOrder.length > 1) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          handleEnlargedPrevWithAnimation();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          handleEnlargedNextWithAnimation();
        }
        return;
      }
      if (!isImageExpanded && muralsOrder.length > 1) {
        if (e.key === "ArrowLeft" && canGoPrev) {
          e.preventDefault();
          handlePrev();
        } else if (e.key === "ArrowRight" && canGoNext) {
          e.preventDefault();
          handleNext();
        }
      }
    };
    if (isModalOpen) {
      document.addEventListener("keydown", onKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [
    isModalOpen,
    closeModal,
    isImageExpanded,
    muralsOrder.length,
    canGoPrev,
    canGoNext,
    handleEnlargedPrevWithAnimation,
    handleEnlargedNextWithAnimation,
    handlePrev,
    handleNext,
  ]);

  useEffect(() => {
    if (!isModalOpen) {
      setIsImageExpanded(false);
      setIsImageLoaded(false);
      setIsEnlargedImageLoaded(false);
    }
  }, [isModalOpen]);

  const prevModalOpenRef = useRef(false);
  useEffect(() => {
    const justOpened = isModalOpen && !prevModalOpenRef.current;
    prevModalOpenRef.current = isModalOpen;
    if (justOpened && activeMural) haptics.tapMedium();
  }, [isModalOpen, activeMural?.id, haptics]);

  useEffect(() => {
    if (!isImageExpanded) setIsEnlargedImageLoaded(false);
  }, [isImageExpanded]);

  useEffect(() => {
    if (activeMural) {
      setIsImageLoaded(false);
      setIsEnlargedImageLoaded(false);
    }
  }, [activeMural?.id]);

  useEffect(() => {
    if (!isImageExpanded && minimapRef.current) {
      minimapRef.current.remove();
      minimapRef.current = null;
    }
    return () => {
      if (minimapRef.current) {
        minimapRef.current.remove();
        minimapRef.current = null;
      }
    };
  }, [isImageExpanded]);

  useEffect(() => {
    const container = minimapContainerRef.current;
    const hasToken = !!MINIMAP_MAPBOX_TOKEN;
    if (!isImageExpanded || !activeMural || !container || !hasToken) return;
    const coords = activeMural.coordinates;
    const styleUrl =
      mapStyle === "satellite" ? MINIMAP_STYLE_SATELLITE : MINIMAP_STYLE_STANDARD;

    let cancelled = false;
    import("mapbox-gl").then((mapboxglModule) => {
      if (cancelled || !container) return;
      if (typeof document !== "undefined") {
        const existing = document.querySelector('link[href="/mapbox-gl.css"]');
        if (!existing) {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = "/mapbox-gl.css";
          document.head.appendChild(link);
        }
      }
      const mapboxgl = mapboxglModule.default;
      const existingMap = minimapRef.current;
      if (existingMap) {
        existingMap.setCenter(coords);
        existingMap.setZoom(MINIMAP_ZOOM);
        const muralSource = existingMap.getSource(
          MINIMAP_MURAL_SOURCE_ID
        ) as import("mapbox-gl").GeoJSONSource | undefined;
        if (muralSource) {
          muralSource.setData({
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: coords },
          });
        }
        const userCoords = useLocationStore.getState().userCoords;
        const userSource = existingMap.getSource(
          MINIMAP_USER_SOURCE_ID
        ) as import("mapbox-gl").GeoJSONSource | undefined;
        if (userSource) {
          userSource.setData(
            userCoords
              ? {
                type: "Feature",
                properties: {},
                geometry: { type: "Point", coordinates: userCoords },
              }
              : { type: "FeatureCollection", features: [] }
          );
        }
        return;
      }
      const map = new mapboxgl.Map({
        container,
        style: styleUrl,
        center: coords,
        zoom: MINIMAP_ZOOM,
        pitch: 0,
        bearing: 0,
        accessToken: MINIMAP_MAPBOX_TOKEN,
        interactive: false,
      });
      map.on("load", () => {
        if (cancelled) return;
        const emptyFC = { type: "FeatureCollection" as const, features: [] };
        map.addSource(MINIMAP_MURAL_SOURCE_ID, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: coords },
          },
        });
        map.addLayer({
          id: MINIMAP_MURAL_LAYER_ID,
          type: "circle",
          source: MINIMAP_MURAL_SOURCE_ID,
          paint: {
            "circle-radius": 8,
            "circle-color": "#d97706",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#fff",
          },
        });
        map.addSource(MINIMAP_USER_SOURCE_ID, {
          type: "geojson",
          data: emptyFC,
        });
        map.addLayer({
          id: MINIMAP_USER_LAYER_ID,
          type: "circle",
          source: MINIMAP_USER_SOURCE_ID,
          paint: {
            "circle-radius": 6,
            "circle-color": "#4285F4",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#fff",
          },
        });
        const userCoords = useLocationStore.getState().userCoords;
        const userSource = map.getSource(
          MINIMAP_USER_SOURCE_ID
        ) as import("mapbox-gl").GeoJSONSource | undefined;
        if (userSource && userCoords) {
          userSource.setData({
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: userCoords },
          });
        }
        minimapRef.current = map;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [
    isImageExpanded,
    activeMural?.id,
    activeMural?.coordinates,
    mapStyle,
  ]);

  return (
    <AnimatePresence mode="wait">
      {isModalOpen && activeMural && (
        <motion.div
          className="fixed inset-0 z-40"
          initial={{ opacity: 1 }}
          animate={{ opacity: isTransitioningToMap ? 0 : 1 }}
          transition={{
            duration: transitionToMapDuration,
            ease: "easeInOut",
          }}
          onAnimationComplete={handleTransitionToMapComplete}
          style={{ pointerEvents: isTransitioningToMap ? "none" : "auto" }}
        >
          <motion.div
            role="presentation"
            className="fixed inset-0 z-0 bg-black/60"
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
                  onClick={() => {
                    haptics.tapMedium();
                    setIsImageExpanded(false);
                  }}
                  aria-hidden
                />
                <motion.div
                  ref={enlargedRef}
                  role="dialog"
                  aria-modal="true"
                  aria-label={`Enlarged view: ${activeMural.title}`}
                  className="safe-top-padding safe-right safe-bottom safe-left fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 md:p-8 touch-pan-y"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => {
                    haptics.tapMedium();
                    setIsImageExpanded(false);
                  }}
                  onTouchStart={handleEnlargedTouchStart}
                  onTouchMove={handleEnlargedTouchMove}
                  onTouchEnd={handleEnlargedTouchEnd}
                >
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
                  {muralsOrder.length > 1 ? (
                    <div
                      ref={swipeContainerRef}
                      className="absolute inset-0 overflow-hidden flex items-center justify-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <motion.div
                        className="flex absolute inset-0 items-center"
                        style={{ width: "300%" }}
                        animate={{ x: `calc(-33.333% + ${swipeOffset}px)` }}
                        transition={{
                          duration: isDragging ? 0 : 0.25,
                          ease: "easeOut",
                        }}
                        onAnimationComplete={handleEnlargedAnimationComplete}
                      >
                        {[prevMuralEnlarged, activeMural, nextMuralEnlarged].map((mural) => (
                          <div
                            key={mural.id}
                            className="relative flex-shrink-0"
                            style={{ width: "33.333%", height: "100%" }}
                          >
                            <div className="absolute inset-0">
                              <Image
                                src={mural.imageUrl}
                                alt={mural.id === activeMural.id ? `${mural.title} — full size` : ""}
                                fill
                                sizes="90vw"
                                className="object-contain pointer-events-none"
                              />
                            </div>
                          </div>
                        ))}
                      </motion.div>
                    </div>
                  ) : (
                    <>
                      {!isEnlargedImageLoaded && (
                        <div
                          className="absolute inset-0 m-auto h-48 w-48 max-h-[60vh] max-w-[60vw] loading-skeleton-soft rounded-lg bg-white/15"
                          aria-hidden
                        />
                      )}
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
                    </>
                  )}
                  {muralsOrder.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEnlargedPrevWithAnimation();
                        }}
                        className="absolute left-2 top-1/2 z-10 hidden min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-full bg-white/10 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent md:left-4 md:flex"
                        aria-label="Previous mural"
                        aria-hidden={!isDesktop}
                      >
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEnlargedNextWithAnimation();
                        }}
                        className="absolute right-2 top-1/2 z-10 hidden min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-full bg-white/10 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent md:right-4 md:flex"
                        aria-label="Next mural"
                        aria-hidden={!isDesktop}
                      >
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      haptics.tapMedium();
                      setIsImageExpanded(false);
                    }}
                    className="absolute right-4 top-4 z-10 min-h-[44px] min-w-[44px] rounded-full bg-white/10 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                    aria-label="Close enlarged image"
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </motion.div>
                {MINIMAP_MAPBOX_TOKEN && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMinimapClick();
                    }}
                    className="fixed left-3 bottom-3 z-[80] h-[88px] w-[128px] overflow-hidden rounded-lg border border-white/20 bg-zinc-900/80 shadow-lg backdrop-blur-sm cursor-pointer transition-[border-color,box-shadow] hover:border-amber-400/50 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent sm:left-4 sm:bottom-4 sm:h-[140px] sm:w-[200px]"
                    aria-label="View this mural on the main map"
                    title="View on map"
                  >
                    <div
                      ref={minimapContainerRef}
                      className="h-full w-full pointer-events-none"
                    />
                  </button>
                )}
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
              dragListener: false,
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
                  onClick={() => {
                    haptics.tapMedium();
                    setIsImageExpanded(true);
                  }}
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
                  className="font-serif text-3xl font-light leading-tight tracking-tight text-zinc-900"
                >
                  {activeMural.title}
                </h2>
                <p className="mt-1 text-zinc-600">
                  by{" "}
                  {activeMural.artistInstagramHandle &&
                    (!activeMural.artist?.trim() || activeMural.artist === "Unknown Artist") ? (
                    <a
                      href={getArtistInstagramUrl(activeMural.artistInstagramHandle)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-amber-700 underline decoration-amber-700/50 underline-offset-2 transition-colors hover:text-amber-800 hover:decoration-amber-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 rounded"
                      aria-label="View artist on Instagram"
                    >
                      @{activeMural.artistInstagramHandle.replace(/^@/, "")}
                    </a>
                  ) : (
                    <>
                      {activeMural.artist}
                      {activeMural.artistInstagramHandle && (
                        <>
                          {" "}
                          <a
                            href={getArtistInstagramUrl(activeMural.artistInstagramHandle)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-amber-700 underline decoration-amber-700/50 underline-offset-2 transition-colors hover:text-amber-800 hover:decoration-amber-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 rounded"
                            aria-label={`View ${activeMural.artist} on Instagram`}
                          >
                            @{activeMural.artistInstagramHandle.replace(/^@/, "")}
                          </a>
                        </>
                      )}
                    </>
                  )}
                </p>
                {formatPhotoDate(activeMural.imageMetadata?.["Date taken"]) && (
                  <p className="mt-2 text-sm font-medium text-zinc-700" aria-label="Date photo was captured">
                    Photo captured: {formatPhotoDate(activeMural.imageMetadata?.["Date taken"])}
                  </p>
                )}
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
                <details
                  id="mural-modal-desc"
                  className="mt-6 border-t border-zinc-200 pt-6 group/details"
                  aria-labelledby="image-metadata-heading"
                >
                  <summary
                    id="image-metadata-heading"
                    className="cursor-pointer list-none text-sm font-medium uppercase tracking-wider text-zinc-500 hover:text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 rounded"
                  >
                    Image metadata
                  </summary>
                  <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div>
                      <dt className="text-sm text-zinc-500">Coordinates</dt>
                      <dd className="mt-0.5 font-mono text-sm text-zinc-700" aria-label="Mural location coordinates">
                        {activeMural.coordinates[1].toFixed(5)}°, {activeMural.coordinates[0].toFixed(5)}°
                      </dd>
                    </div>
                    {activeMural.imageMetadata &&
                      Object.entries(activeMural.imageMetadata).map(([label, value]) => (
                        <div key={label}>
                          <dt className="text-sm text-zinc-500">{label}</dt>
                          <dd className="mt-0.5 font-mono text-sm text-zinc-700">{value}</dd>
                        </div>
                      ))}
                  </dl>
                </details>
              </div>
            </div>
            <div className="safe-bottom-footer border-t border-zinc-200 bg-zinc-50 p-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handlePrev}
                  disabled={!canGoPrev}
                  className="flex-1 min-h-[44px] rounded-lg border border-zinc-200 bg-white py-3 text-base font-medium text-zinc-900 shadow-sm transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50"
                  aria-label="Previous mural"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!canGoNext}
                  className="flex-1 min-h-[44px] rounded-lg border border-zinc-200 bg-white py-3 text-base font-medium text-zinc-900 shadow-sm transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50"
                  aria-label="Next mural"
                >
                  Next
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 min-h-[44px] rounded-lg border border-zinc-200 bg-white py-3 text-base font-medium text-zinc-900 shadow-sm transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                >
                  Close
                </button>
              </div>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

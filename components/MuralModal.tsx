"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import useEmblaCarousel from "embla-carousel-react";
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
import { ZoomableImage, type ZoomableImageHandle } from "@/components/ZoomableImage";
import { getArtistInstagramUrl } from "@/lib/instagram";
import { isLightColor, normalizeHexToSix, getContentOverlay } from "@/lib/colorUtils";
import { ensureMapboxCSS, MAPBOX_STYLE_URLS } from "@/lib/mapbox";
import { parsePx } from "@/lib/imageMetadata";
import { ImageEditor } from "@/components/ImageEditor";
import { MuralTimeline } from "@/components/MuralTimeline";
import { ArtistCombobox, type ArtistComboboxValue } from "@/components/ArtistCombobox";
import { useAuthStore } from "@/store/authStore";
import { useCaptureStore } from "@/store/captureStore";
import { haversineDistanceMeters } from "@/lib/geo";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Star used in enlarged view save button
import { ensureTurnstileScript } from "@/lib/turnstile-loader";
import { ExternalLink, Map, Minus, Pencil, Star, X } from "lucide-react";

const MURAL_EDIT_TURNSTILE_ID = "mural-edit-turnstile";
const MURAL_EDIT_TURNSTILE_SELECTOR = `#${MURAL_EDIT_TURNSTILE_ID}`;

const MINIMAP_MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const MINIMAP_STYLE_STANDARD = MAPBOX_STYLE_URLS.standard;
const MINIMAP_STYLE_SATELLITE = MAPBOX_STYLE_URLS.satellite;
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

function getModalImageAspectRatio(mural: Mural): number {
  const w = parsePx(mural.imageMetadata?.Width);
  const h = parsePx(mural.imageMetadata?.Height);
  if (w != null && h != null && h > 0) {
    const ratio = w / h;
    return Math.max(ASPECT_MIN, Math.min(ASPECT_MAX, ratio));
  }
  return ASPECT_DEFAULT;
}

/** Parse "2025:04:23 14:19:12" to "Apr 23, 2025". */
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

/** Format ISO date string for display. */
function formatIsoDate(iso: string | undefined): string | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(d)
    : null;
}

/** Mural painted date: year only (YYYY-01-01 or year_painted) or full date. */
function formatMuralDate(
  datePainted: string | null | undefined,
  yearPainted?: number | null
): string | null {
  if (datePainted) {
    const parts = datePainted.split("-").map(Number);
    const [y, m, d] = [parts[0], parts[1], parts[2]];
    if (m === 1 && d === 1) return String(y);
    const date = new Date(y, m - 1, d);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date)
      : String(y);
  }
  if (yearPainted != null) return String(yearPainted);
  return null;
}

interface MuralModalProps {
  onRequestAuth?: (title: string, message: string) => void;
}

export function MuralModal({ onRequestAuth }: MuralModalProps = {}) {
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
    updateActiveMural,
  } = useMuralStore();
  const user = useAuthStore((s) => s.user);
  const addCapture = useCaptureStore((s) => s.addCapture);
  const hasCaptured = useCaptureStore((s) => s.hasCaptured);
  const getCaptureFor = useCaptureStore((s) => s.getCaptureFor);
  const userCoords = useLocationStore((s) => s.userCoords);
  const mapStyle = useMapStore((s) => s.mapStyle);
  const [isImageExpanded, setIsImageExpanded] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [isEnlargedImageLoaded, setIsEnlargedImageLoaded] = useState(false);
  const [isEnlargedZoomed, setIsEnlargedZoomed] = useState(false);
  const zoomableRef = useRef<ZoomableImageHandle>(null);
  const [isTransitioningToMap, setIsTransitioningToMap] = useState(false);
  const [isMinimapMinimized, setIsMinimapMinimized] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const dragControls = useDragControls();
  const haptics = useHaptics();
  const panelRef = useRef<HTMLElement>(null);
  const enlargedRef = useRef<HTMLDivElement>(null);
  const minimapContainerRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<import("mapbox-gl").Map | null>(null);
  const minimapConstraintsRef = useRef<HTMLDivElement>(null);
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    startIndex: activeIndex,
    duration: prefersReducedMotion ? 0 : 25,
    align: "center",
  });

  const [isEditMode, setIsEditMode] = useState(false);
  const [isCropMode, setIsCropMode] = useState(false);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [croppedPreviewUrl, setCroppedPreviewUrl] = useState<string | null>(null);
  const [cropImageUrl, setCropImageUrl] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editArtistValue, setEditArtistValue] = useState<ArtistComboboxValue>({
    id: null,
    name: "",
  });
  const [editInstagramHandle, setEditInstagramHandle] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  const [shareFeedback, setShareFeedback] = useState<"copied" | "failed" | null>(null);

  useFocusTrap(panelRef, isModalOpen && !!activeMural && !isImageExpanded && !isEditMode);
  useFocusTrap(enlargedRef, isImageExpanded);

  const startEditMode = useCallback(() => {
    if (!activeMural) return;
    setEditTitle(activeMural.title);
    setEditArtistValue({
      id: activeMural.artistId ?? null,
      name: activeMural.artist ?? "",
    });
    setEditInstagramHandle(activeMural.artistInstagramHandle?.replace(/^@/, "") ?? "");
    setEditError(null);
    setCroppedBlob(null);
    setCropImageUrl(null);
    setIsCropMode(false);
    setIsEditMode(true);
  }, [activeMural]);

  const cropImageUrlRef = useRef<string | null>(null);
  useEffect(() => {
    cropImageUrlRef.current = cropImageUrl;
  }, [cropImageUrl]);

  const cancelEditMode = useCallback(() => {
    if (cropImageUrlRef.current) {
      URL.revokeObjectURL(cropImageUrlRef.current);
      cropImageUrlRef.current = null;
      setCropImageUrl(null);
    }
    setCroppedBlob(null);
    setIsCropMode(false);
    setIsEditMode(false);
    setEditError(null);
    if (turnstileWidgetIdRef.current) {
      const win = window as unknown as { turnstile?: { remove: (id: string) => void } };
      win.turnstile?.remove(turnstileWidgetIdRef.current);
      turnstileWidgetIdRef.current = null;
    }
  }, []);

  const startCropMode = useCallback(async () => {
    if (!activeMural?.imageUrl) return;
    setEditError(null);
    try {
      const res = await fetch(activeMural.imageUrl);
      if (!res.ok) throw new Error("Fetch failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setCropImageUrl(url);
      setIsCropMode(true);
    } catch {
      setEditError("Could not load image for cropping. Try again.");
    }
  }, [activeMural?.imageUrl]);

  const handleCropComplete = useCallback((blob: Blob) => {
    if (cropImageUrl) {
      URL.revokeObjectURL(cropImageUrl);
      setCropImageUrl(null);
    }
    setCroppedBlob(blob);
    setIsCropMode(false);
  }, [cropImageUrl]);

  const handleCropBack = useCallback(() => {
    if (cropImageUrl) {
      URL.revokeObjectURL(cropImageUrl);
      setCropImageUrl(null);
    }
    setIsCropMode(false);
  }, [cropImageUrl]);

  useEffect(() => {
    if (!croppedBlob) {
      setCroppedPreviewUrl(null);
      return;
    }
    setIsImageLoaded(false);
    const url = URL.createObjectURL(croppedBlob);
    setCroppedPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [croppedBlob]);

  const handleShare = useCallback(async () => {
    if (!activeMural) return;
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/?mural=${activeMural.id}`;
    const title = activeMural.title;
    const text = `${activeMural.title}${activeMural.artist ? ` by ${activeMural.artist}` : ""}`;
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
  }, [activeMural, haptics]);

  const saveEdit = useCallback(() => {
    if (!activeMural || !turnstileSiteKey) {
      setEditError("Captcha is not configured. Please try again later.");
      return;
    }
    const win = window as unknown as {
      turnstile?: { execute: (container: string, params: object) => void };
    };
    if (!win.turnstile?.execute) {
      setEditError("Still loading — give it a moment and try again.");
      return;
    }
    try {
      win.turnstile.execute(MURAL_EDIT_TURNSTILE_SELECTOR, {});
    } catch {
      setEditError("Something went wrong. Please try again.");
    }
  }, [activeMural, turnstileSiteKey]);

  const submitEditWithToken = useCallback(
    async (token: string) => {
      if (!activeMural) return;
      setEditSaving(true);
      setEditError(null);
      try {
        let currentMural = activeMural;
        if (croppedBlob) {
          const formData = new FormData();
          formData.append("image", croppedBlob);
          formData.append("turnstileToken", token);
          const imageRes = await fetch(`/api/murals/${activeMural.id}/image`, {
            method: "PATCH",
            body: formData,
          });
          const imageData = await imageRes.json();
          if (!imageRes.ok) {
            setEditError(imageData?.error ?? "We couldn't save the new image. Please try again.");
            return;
          }
          haptics.tapMedium();
          updateActiveMural(imageData as Mural);
          currentMural = imageData as Mural;
          setCroppedBlob(null);
        }
        const metadataChanged =
          (editTitle.trim() || "") !== (currentMural.title || "") ||
          (editArtistValue.name.trim() || "") !== (currentMural.artist || "") ||
          (editArtistValue.id ?? "") !== ((currentMural as Mural).artistId ?? "") ||
          (editInstagramHandle.trim().replace(/^@/, "") || "") !== (currentMural.artistInstagramHandle?.replace(/^@/, "") || "");
        if (metadataChanged) {
          const res = await fetch(`/api/murals/${activeMural.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              turnstileToken: token,
              title: editTitle.trim() || undefined,
              artistId: editArtistValue.id ?? undefined,
              artist: editArtistValue.name.trim() || undefined,
              artistInstagramHandle: editInstagramHandle.trim() ? editInstagramHandle.trim().replace(/^@/, "") : null,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            setEditError(data?.error ?? "We couldn't save your changes. Please try again.");
            return;
          }
          haptics.tapMedium();
          updateActiveMural(data as Mural);
        }
        cancelEditMode();
      } catch {
        setEditError("We couldn't save your changes. Please try again.");
      } finally {
        setEditSaving(false);
      }
    },
    [activeMural, croppedBlob, editTitle, editArtistValue, editInstagramHandle, updateActiveMural, cancelEditMode, haptics]
  );

  const submitEditWithTokenRef = useRef(submitEditWithToken);
  submitEditWithTokenRef.current = submitEditWithToken;

  useEffect(() => {
    if (!isEditMode || !turnstileSiteKey || !activeMural) return;
    type TurnstileWin = {
      turnstile?: {
        render: (container: string, options: { sitekey: string; callback: (token: string) => void; execution: string; "error-callback"?: (errorCode?: number) => boolean }) => string;
        remove: (id: string) => void;
      };
    };
    const win = window as unknown as TurnstileWin;
    const renderOptions = {
      sitekey: turnstileSiteKey,
      callback: (token: string) => submitEditWithTokenRef.current?.(token),
      execution: "execute" as const,
      "error-callback": () => {
        setEditError("Captcha verification failed. Please try again.");
        return true;
      },
    };
    let cancelled = false;
    void ensureTurnstileScript().then(() => {
      if (cancelled) return;
      const container = document.querySelector(MURAL_EDIT_TURNSTILE_SELECTOR);
      if (container && win.turnstile?.render && !turnstileWidgetIdRef.current) {
        turnstileWidgetIdRef.current = win.turnstile.render(MURAL_EDIT_TURNSTILE_SELECTOR, renderOptions);
      }
    });
    return () => {
      cancelled = true;
      if (turnstileWidgetIdRef.current && win.turnstile?.remove) {
        win.turnstile.remove(turnstileWidgetIdRef.current);
        turnstileWidgetIdRef.current = null;
      }
    };
  }, [isEditMode, turnstileSiteKey, activeMural?.id]);
  const panelVariants = isDesktop ? PANEL_RIGHT : DRAWER_UP;
  const isLight = activeMural ? isLightColor(activeMural.dominantColor) : true;
  const contentOverlay = activeMural ? getContentOverlay(activeMural.dominantColor) : undefined;
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

  useEffect(() => {
    if (!emblaApi || muralsOrder.length === 0) return;
    const onSelect = () => {
      const idx = emblaApi.selectedScrollSnap();
      if (idx !== activeIndex && muralsOrder[idx]) {
        goToIndex(idx);
        requestFlyTo(muralsOrder[idx], { openModalAfterFly: false });
      }
    };
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, muralsOrder, activeIndex, goToIndex, requestFlyTo]);

  useEffect(() => {
    if (isImageExpanded && emblaApi && muralsOrder.length > 0) {
      emblaApi.scrollTo(activeIndex, true);
    }
  }, [isImageExpanded, emblaApi, activeIndex, muralsOrder.length]);

  useEffect(() => {
    if (!emblaApi || muralsOrder.length <= 1) return;
    emblaApi.reInit({ watchDrag: !isEnlargedZoomed });
  }, [emblaApi, muralsOrder.length, isEnlargedZoomed]);

  const handleMinimapClick = useCallback(() => {
    if (!activeMural) return;
    // Start map fly and fade modal so user sees smooth transition from photo to map.
    requestFlyTo(activeMural, { openModalAfterFly: false });
    setIsTransitioningToMap(true);
  }, [activeMural, requestFlyTo]);

  const scrollPrev = useCallback(() => {
    haptics.tap();
    emblaApi?.scrollPrev();
  }, [emblaApi, haptics]);
  const scrollNext = useCallback(() => {
    haptics.tap();
    emblaApi?.scrollNext();
  }, [emblaApi, haptics]);

  const transitionToMapDuration = prefersReducedMotion
    ? TRANSITION_TO_MAP_DURATION_REDUCED_MS / 1000
    : TRANSITION_TO_MAP_DURATION_MS / 1000;

  const handleTransitionToMapComplete = useCallback(() => {
    if (!isTransitioningToMap) return;
    setIsTransitioningToMap(false);
    setIsImageExpanded(false);
    closeModal();
  }, [isTransitioningToMap]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- used in enlarged view save button JSX
  const handleStarClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!activeMural) return;
      if (hasCaptured(activeMural.id)) return;
      haptics.tap();
      if (!user) {
        onRequestAuth?.("Sign in", "Create an account to save this mural to your account.");
        return;
      }
      const lat = userCoords != null ? userCoords[1] : null;
      const lng = userCoords != null ? userCoords[0] : null;
      const distanceMeters =
        userCoords && activeMural
          ? haversineDistanceMeters(userCoords, activeMural.coordinates)
          : null;
      addCapture({
        muralId: activeMural.id,
        capturedAt: new Date().toISOString(),
        lat,
        lng,
        distanceMeters,
      });
    },
    [activeMural, user, userCoords, hasCaptured, addCapture, onRequestAuth, haptics]
  );

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
          scrollPrev();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          scrollNext();
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
    scrollPrev,
    scrollNext,
    handlePrev,
    handleNext,
  ]);

  useEffect(() => {
    if (!isModalOpen) {
      setIsImageExpanded(false);
      setIsImageLoaded(false);
      setIsEnlargedImageLoaded(false);
      setIsEditMode(false);
    }
  }, [isModalOpen]);

  const prevModalOpenRef = useRef(false);
  useEffect(() => {
    const justOpened = isModalOpen && !prevModalOpenRef.current;
    prevModalOpenRef.current = isModalOpen;
    if (justOpened && activeMural) haptics.tapMedium();
  }, [isModalOpen, activeMural?.id, haptics]);

  useEffect(() => {
    if (!isImageExpanded) {
      setIsEnlargedImageLoaded(false);
      setIsEnlargedZoomed(false);
    }
  }, [isImageExpanded]);

  useEffect(() => {
    if (activeMural) {
      setIsImageLoaded(false);
      setIsEnlargedImageLoaded(false);
      setIsEditMode(false);
    }
  }, [activeMural?.id]);

  useEffect(() => {
    if (isImageExpanded) setIsMinimapMinimized(false);
  }, [isImageExpanded]);

  useEffect(() => {
    if ((!isImageExpanded || isMinimapMinimized) && minimapRef.current) {
      minimapRef.current.remove();
      minimapRef.current = null;
    }
    return () => {
      if (minimapRef.current) {
        minimapRef.current.remove();
        minimapRef.current = null;
      }
    };
  }, [isImageExpanded, isMinimapMinimized]);

  useEffect(() => {
    const container = minimapContainerRef.current;
    const hasToken = !!MINIMAP_MAPBOX_TOKEN;
    if (!isImageExpanded || isMinimapMinimized || !activeMural || !container || !hasToken) return;
    const coords = activeMural.coordinates;
    const styleUrl =
      mapStyle === "satellite" ? MINIMAP_STYLE_SATELLITE : MINIMAP_STYLE_STANDARD;

    let cancelled = false;
    void ensureMapboxCSS().then(() =>
      import("mapbox-gl").then((mapboxglModule) => {
        if (cancelled || !container) return;
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
      })
    );

    return () => {
      cancelled = true;
    };
  }, [
    isImageExpanded,
    isMinimapMinimized,
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
                    if (isEnlargedZoomed) {
                      zoomableRef.current?.resetTransform(0.2);
                    } else {
                      haptics.tapMedium();
                      setIsImageExpanded(false);
                    }
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
                    if (isEnlargedZoomed) {
                      zoomableRef.current?.resetTransform(0.2);
                    } else {
                      haptics.tapMedium();
                      setIsImageExpanded(false);
                    }
                  }}
                >
                  {muralsOrder.length > 1 ? (
                    <div
                      ref={emblaRef}
                      role="region"
                      aria-roledescription="carousel"
                      aria-label="Mural gallery"
                      className="absolute inset-0 overflow-hidden"
                      onClick={(e) => e.stopPropagation()}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowLeft") {
                          e.preventDefault();
                          scrollPrev();
                        } else if (e.key === "ArrowRight") {
                          e.preventDefault();
                          scrollNext();
                        }
                      }}
                    >
                      <div className="embla__container flex h-full flex-row touch-pan-y">
                        {muralsOrder.map((mural, idx) => (
                          <div
                            key={mural.id}
                            className="embla__slide relative min-w-0 flex-[0_0_100%] flex items-center justify-center"
                            role="group"
                            aria-roledescription="slide"
                            aria-label={`Mural ${idx + 1} of ${muralsOrder.length}: ${mural.title}`}
                          >
                            <div className="absolute inset-0">
                              <ZoomableImage
                                ref={mural.id === activeMural.id ? zoomableRef : undefined}
                                src={mural.imageUrl}
                                alt={mural.id === activeMural.id ? `${mural.title} — full size` : ""}
                                fill
                                sizes="90vw"
                                resetKey={activeIndex}
                                onZoomChange={
                                  mural.id === activeMural.id ? setIsEnlargedZoomed : undefined
                                }
                              />
                            </div>
                          </div>
                        ))}
                      </div>
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
                        <ZoomableImage
                          ref={zoomableRef}
                          src={activeMural.imageUrl}
                          alt={`${activeMural.title} — full size`}
                          fill
                          sizes="90vw"
                          isLoaded={isEnlargedImageLoaded}
                          onLoad={() => setIsEnlargedImageLoaded(true)}
                          onError={() => setIsEnlargedImageLoaded(true)}
                          onZoomChange={setIsEnlargedZoomed}
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
                          scrollPrev();
                        }}
                        className="absolute left-2 top-1/2 z-10 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-full bg-white/10 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent md:left-4"
                        aria-label="Previous mural"
                      >
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          scrollNext();
                        }}
                        className="absolute right-2 top-1/2 z-10 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-full bg-white/10 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent md:right-4"
                        aria-label="Next mural"
                      >
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </>
                  )}
                  <div
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                    className="sr-only"
                  >
                    {activeMural.title} — mural {activeIndex + 1} of {muralsOrder.length}
                  </div>
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
                  <>
                    <div
                      ref={minimapConstraintsRef}
                      className="fixed inset-0 z-[79] pointer-events-none"
                      aria-hidden
                    />
                    <AnimatePresence>
                      {isMinimapMinimized ? (
                        <motion.button
                          key="minimap-pill"
                          type="button"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ duration: 0.15 }}
                          onClick={() => setIsMinimapMinimized(false)}
                          className="fixed left-3 bottom-3 z-[80] flex items-center gap-1.5 rounded-full border border-white/20 bg-zinc-900/80 px-3 py-1.5 text-xs text-white/90 shadow-lg backdrop-blur-sm transition-colors hover:border-amber-400/50 hover:bg-zinc-800/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent sm:left-4 sm:bottom-4"
                          aria-label="Show mini map"
                        >
                          <Map className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          Mini Map
                        </motion.button>
                      ) : (
                        <motion.div
                          key="minimap-expanded"
                          drag
                          dragMomentum={false}
                          dragConstraints={minimapConstraintsRef}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ duration: 0.15 }}
                          className="fixed left-3 bottom-3 z-[80] h-[88px] w-[128px] overflow-visible rounded-lg border border-white/20 bg-zinc-900/80 shadow-lg backdrop-blur-sm sm:left-4 sm:bottom-4 sm:h-[140px] sm:w-[200px]"
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsMinimapMinimized(true);
                            }}
                            className="absolute -right-1.5 -top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-zinc-800 text-white/80 shadow transition-colors hover:bg-zinc-700 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
                            aria-label="Minimize mini map"
                          >
                            <Minus className="h-3 w-3" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMinimapClick();
                            }}
                            className="h-full w-full cursor-pointer overflow-hidden rounded-lg transition-[border-color,box-shadow] hover:border-amber-400/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                            aria-label="View this mural on the main map"
                            title="View on map"
                          >
                            <div
                              ref={minimapContainerRef}
                              className="h-full w-full pointer-events-none"
                            />
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
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
            className="safe-left safe-right fixed z-50 flex w-full max-w-lg flex-col shadow-2xl bottom-0 left-0 right-0 max-h-[90vh] rounded-t-3xl border-t md:bottom-auto md:left-auto md:right-0 md:top-0 md:h-full md:max-h-none md:rounded-none md:border-t-0 md:border-l safe-top"
            style={{ backgroundColor: activeMural.dominantColor, borderColor: isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.15)" }}
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={panelTransition}
            onClick={(e) => e.stopPropagation()}
            {...(!isDesktop && {
              drag: "y",
              dragConstraints: { top: 0 },
              dragElastic: { top: 0.05, bottom: 0.4 },
              dragControls,
              dragListener: false,
              onDragEnd: handleDrawerDragEnd,
              dragTransition: { bounceStiffness: 300, bounceDamping: 30 },
            })}
          >
            <div
              className="flex min-h-[44px] cursor-grab active:cursor-grabbing flex-col items-center justify-center pt-3 pb-1 touch-none md:cursor-default md:min-h-0 md:pt-0 md:pb-0"
              aria-hidden
              onPointerDown={!isDesktop ? (e) => dragControls.start(e) : undefined}
            >
              <span className={`h-[5px] w-10 shrink-0 rounded-full ${isLight ? "bg-black/25" : "bg-white/40"}`} aria-hidden />
            </div>
            <div className="flex flex-1 flex-col overflow-y-auto overscroll-contain">
              <div
                className={`relative w-full shrink-0 overflow-hidden ${getCaptureFor(activeMural.id)?.photoUrl ? "ring-2 ring-amber-400 ring-inset" : ""}`}
                style={{
                  aspectRatio: isEditMode && isCropMode && cropImageUrl ? undefined : getModalImageAspectRatio(activeMural),
                  backgroundColor: activeMural.dominantColor,
                  minHeight: isEditMode && isCropMode && cropImageUrl ? "280px" : undefined,
                }}
              >
                {isEditMode && isCropMode && cropImageUrl ? (
                  <div className="p-4">
                    <ImageEditor
                      imageUrl={cropImageUrl}
                      onComplete={handleCropComplete}
                      onBack={handleCropBack}
                    />
                  </div>
                ) : (
                  <>
                    {!isImageLoaded && (
                      <div
                        className="absolute inset-0 loading-skeleton-soft bg-zinc-200/80"
                        aria-hidden
                      />
                    )}
                    {getCaptureFor(activeMural.id)?.photoUrl && (
                      <span
                        className="absolute right-3 bottom-3 z-10 rounded bg-amber-400/95 px-2 py-1 text-xs font-medium text-amber-950 shadow-sm"
                        aria-hidden
                      >
                        Your photo
                      </span>
                    )}
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
                        src={isEditMode && croppedPreviewUrl ? croppedPreviewUrl : (getCaptureFor(activeMural.id)?.photoUrl ?? activeMural.imageUrl)}
                        alt={`Mural: ${activeMural.title} by ${activeMural.artist}`}
                        fill
                        sizes="(max-width: 512px) 100vw, 512px"
                        className={`object-contain transition-opacity duration-300 ease-out ${isImageLoaded ? "opacity-100" : "opacity-0"}`}
                        onLoad={() => setIsImageLoaded(true)}
                        onError={() => setIsImageLoaded(true)}
                      />
                    </button>
                    <motion.button
                      type="button"
                      onClick={handleStarClick}
                      className="absolute left-4 top-4 z-10 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-black/20 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                      aria-label={hasCaptured(activeMural.id) ? "Saved to your account" : "Save mural to your account"}
                      initial={false}
                      animate={{
                        scale: hasCaptured(activeMural.id) ? 1.1 : 1,
                      }}
                      transition={prefersReducedMotion ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 25 }}
                    >
                      <Star
                        className={`h-6 w-6 ${hasCaptured(activeMural.id) ? "fill-amber-400 stroke-amber-400" : "fill-transparent stroke-white"} stroke-[2.5] ${!prefersReducedMotion ? "transition-colors duration-200" : ""}`}
                        aria-hidden
                      />
                    </motion.button>
                    {isEditMode && !isCropMode && (
                      <div className="absolute bottom-4 left-4 right-4 z-10 flex justify-center pointer-events-none">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            haptics.tapMedium();
                            startCropMode();
                          }}
                          className="pointer-events-auto rounded-lg border border-white/40 bg-black/50 px-4 py-2.5 text-sm font-medium text-white/95 backdrop-blur-sm transition-opacity hover:bg-black/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
                          aria-label="Re-crop mural image"
                        >
                          Re-crop image
                        </button>
                      </div>
                    )}
                    <div
                      className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none"
                      style={{
                        background: (() => {
                          const hex = normalizeHexToSix(activeMural.dominantColor);
                          return `linear-gradient(to top, #${hex}, #${hex}cc 40%, #${hex}66 70%, transparent)`;
                        })(),
                      }}
                      aria-hidden
                    />
                  </>
                )}
              </div>
              <div className="flex flex-1 flex-col px-6 pb-8 pt-5" style={{ backgroundColor: contentOverlay }}>
                {isEditMode ? (
                  <>
                    {croppedBlob && !isCropMode && (
                      <p className={`mb-2 text-sm ${isLight ? "text-zinc-600" : "text-white/80"}`} role="status">
                        Cropped image ready — tap Save to apply.
                      </p>
                    )}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-3">
                        <label htmlFor="mural-edit-title" className="sr-only">Mural name</label>
                        <input
                          id="mural-edit-title"
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          placeholder="Mural name"
                          className={`w-full rounded-lg border px-3 py-2 font-serif text-xl focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${isLight ? "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400" : "border-white/30 bg-white/10 text-white placeholder:text-white/50"}`}
                          aria-label="Mural name"
                          autoFocus
                        />
                        <label htmlFor="mural-edit-artist" className="sr-only">Artist</label>
                        <ArtistCombobox
                          id="mural-edit-artist"
                          value={editArtistValue}
                          onChange={setEditArtistValue}
                          placeholder="Artist name"
                          isLight={isLight}
                          aria-label="Artist"
                        />
                        <div className="space-y-1">
                          <label htmlFor="mural-edit-instagram" className={`block text-xs font-medium uppercase tracking-wide ${isLight ? "text-zinc-800" : "text-white/85"}`}>
                            Instagram username (optional)
                          </label>
                          <input
                            id="mural-edit-instagram"
                            type="text"
                            value={editInstagramHandle}
                            onChange={(e) => setEditInstagramHandle(e.target.value)}
                            placeholder="username (no @ needed)"
                            className={`w-full rounded-lg border px-3 py-2 text-mobile-body focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${isLight ? "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400" : "border-white/30 bg-white/10 text-white placeholder:text-white/50"}`}
                            aria-label="Artist Instagram username"
                          />
                          <p className={`text-xs ${isLight ? "text-zinc-800" : "text-white/85"}`}>
                            Instagram only for now. If you paste @username, we&apos;ll clean it up.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={cancelEditMode}
                        className={`shrink-0 rounded-lg p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 ${isLight ? "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900" : "text-white/85 hover:bg-white/15 hover:text-white"}`}
                        aria-label="Cancel edit"
                      >
                        <X className="h-5 w-5" aria-hidden />
                      </button>
                    </div>
                    {editError && (
                      <p className="mt-2 text-sm text-red-600" role="alert">
                        {editError}
                      </p>
                    )}
                    <div id={MURAL_EDIT_TURNSTILE_ID} className="mt-2 min-h-[1px]" aria-hidden />
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={cancelEditMode}
                        className={`flex-1 min-h-[44px] rounded-lg border py-3 text-base font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 ${isLight ? "border-zinc-200 bg-white text-zinc-700" : "border-white/25 bg-white/15 text-white hover:bg-white/25"}`}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={saveEdit}
                        disabled={editSaving}
                        className="flex-1 min-h-[44px] rounded-lg border border-amber-600 bg-amber-600 py-3 text-base font-medium text-white shadow-sm transition-colors hover:bg-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 disabled:opacity-50"
                      >
                        {editSaving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <h2
                        id="mural-modal-title"
                        className={`font-serif text-2xl font-light leading-tight tracking-tight md:text-3xl ${isLight ? "text-zinc-900" : "text-white"}`}
                      >
                        {activeMural.title}
                      </h2>
                      {turnstileSiteKey && (
                        <button
                          type="button"
                          onClick={startEditMode}
                          className={`shrink-0 rounded-lg p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 ${isLight ? "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900" : "text-white/85 hover:bg-white/15 hover:text-white"}`}
                          aria-label="Edit mural details"
                        >
                          <Pencil className="h-5 w-5" aria-hidden />
                        </button>
                      )}
                    </div>
                    <p className={`mt-1 text-mobile-body ${isLight ? "text-zinc-800" : "text-white/90"}`}>
                      by {activeMural.artist || "Unknown Artist"}
                    </p>
                    {(() => {
                      const artistName = (activeMural.artist || "").trim();
                      const showMoreByArtist =
                        artistName &&
                        artistName.toLowerCase() !== "unknown artist" &&
                        muralsOrder.length > 0;
                      const otherByArtist = showMoreByArtist
                        ? muralsOrder.filter(
                            (m) =>
                              m.id !== activeMural.id &&
                              (m.artist || "").trim().toLowerCase() === artistName.toLowerCase()
                          )
                        : [];
                      if (otherByArtist.length === 0) return null;
                      return (
                        <section
                          className="mt-5"
                          aria-labelledby="more-by-artist-heading"
                        >
                          <h3
                            id="more-by-artist-heading"
                            className={`text-mobile-caption font-medium uppercase tracking-[0.08em] ${isLight ? "text-zinc-600" : "text-white/70"}`}
                          >
                            More by {artistName}
                          </h3>
                          <ul className="mt-3 grid grid-cols-2 gap-3" role="list">
                            {otherByArtist.map((mural) => {
                              const idx = muralsOrder.findIndex((m) => m.id === mural.id);
                              const thumb = mural.thumbnail || mural.imageUrl;
                              return (
                                <li key={mural.id}>
                                  <button
                                    type="button"
                                    onClick={() => idx >= 0 && goToIndex(idx)}
                                    className={`group w-full rounded-lg border text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 ${isLight ? "border-zinc-200 bg-white hover:border-zinc-300" : "border-white/20 bg-white/5 hover:border-white/30"}`}
                                    aria-label={`View mural: ${mural.title}`}
                                  >
                                    <div className="aspect-[4/5] w-full overflow-hidden rounded-t-lg">
                                      <Image
                                        src={thumb}
                                        alt=""
                                        width={200}
                                        height={250}
                                        className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
                                        sizes="(max-width: 512px) 50vw, 200px"
                                      />
                                    </div>
                                    <p className={`truncate px-2 py-1.5 text-mobile-footnote ${isLight ? "text-zinc-800" : "text-white/90"}`}>
                                      {mural.title}
                                    </p>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </section>
                      );
                    })()}
                    {(formatIsoDate(activeMural.dateCaptured) ||
                      formatPhotoDate(activeMural.imageMetadata?.["Date taken"]) ||
                      formatMuralDate(activeMural.datePainted ?? null, activeMural.yearPainted) ||
                      activeMural.imageMetadata?.["Camera model"] ||
                      activeMural.artistInstagramHandle) && (
                        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4">
                          {(formatIsoDate(activeMural.dateCaptured) ||
                            formatPhotoDate(activeMural.imageMetadata?.["Date taken"])) && (
                              <div>
                                <p className={`text-mobile-caption font-medium uppercase tracking-[0.08em] ${isLight ? "text-zinc-600" : "text-white/70"}`}>
                                  Date captured
                                </p>
                                <p className={`mt-0.5 text-mobile-body ${isLight ? "text-zinc-900" : "text-white"}`} aria-label="Date photo was captured">
                                  {formatIsoDate(activeMural.dateCaptured) ??
                                    formatPhotoDate(activeMural.imageMetadata?.["Date taken"])}
                                </p>
                              </div>
                            )}
                          {formatMuralDate(activeMural.datePainted ?? null, activeMural.yearPainted) && (
                            <div>
                              <p className={`text-mobile-caption font-medium uppercase tracking-[0.08em] ${isLight ? "text-zinc-600" : "text-white/70"}`}>
                                Painted
                              </p>
                              <p className={`mt-0.5 text-mobile-body ${isLight ? "text-zinc-900" : "text-white"}`} aria-label="Date mural was painted">
                                {formatMuralDate(activeMural.datePainted ?? null, activeMural.yearPainted)}
                              </p>
                            </div>
                          )}
                          {activeMural.imageMetadata?.["Camera model"] && (
                            <div>
                              <p className={`text-mobile-caption font-medium uppercase tracking-[0.08em] ${isLight ? "text-zinc-600" : "text-white/70"}`}>
                                Camera
                              </p>
                              <p className={`mt-0.5 text-mobile-body ${isLight ? "text-zinc-900" : "text-white"}`}>
                                {activeMural.imageMetadata["Camera model"]}
                              </p>
                            </div>
                          )}
                          {activeMural.artistInstagramHandle && (
                            <div className={(formatIsoDate(activeMural.dateCaptured) || formatPhotoDate(activeMural.imageMetadata?.["Date taken"]) || formatMuralDate(activeMural.datePainted ?? null, activeMural.yearPainted) || activeMural.imageMetadata?.["Camera model"]) ? "col-span-2" : ""}>
                              <p className={`text-mobile-caption font-medium uppercase tracking-[0.08em] ${isLight ? "text-zinc-600" : "text-white/70"}`}>
                                Instagram
                              </p>
                              <a
                                href={getArtistInstagramUrl(activeMural.artistInstagramHandle)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`mt-0.5 inline-flex min-h-[44px] min-w-[44px] items-center gap-2 text-mobile-body font-medium underline underline-offset-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 rounded ${isLight ? "text-amber-900 decoration-amber-900/50 hover:text-amber-950 hover:decoration-amber-950" : "text-amber-300 decoration-amber-300/60 hover:text-amber-200 hover:decoration-amber-200"}`}
                                aria-label="View artist on Instagram"
                              >
                                @{activeMural.artistInstagramHandle.replace(/^@/, "")}
                                <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
                              </a>
                            </div>
                          )}
                        </div>
                      )}
                    <div className="mt-6 flex flex-wrap items-center gap-4">
                      <a
                        href={getDirectionsUrl(activeMural)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex w-fit items-center gap-2 text-mobile-subhead font-medium underline underline-offset-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 rounded ${isLight ? "text-amber-900 decoration-amber-900/50 hover:text-amber-950 hover:decoration-amber-950" : "text-amber-300 decoration-amber-300/60 hover:text-amber-200 hover:decoration-amber-200"}`}
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
                        className={`inline-flex items-center gap-2 text-mobile-subhead font-medium underline underline-offset-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 rounded ${isLight ? "text-zinc-900 decoration-zinc-500 hover:text-zinc-950 hover:decoration-zinc-700" : "text-white/90 decoration-white/60 hover:text-white hover:decoration-white/80"}`}
                        aria-label="View this mural on the map"
                      >
                        View on map
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={handleShare}
                        className={`inline-flex min-h-[44px] min-w-[44px] items-center gap-2 text-mobile-subhead font-medium underline underline-offset-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 rounded ${isLight ? "text-zinc-900 decoration-zinc-500 hover:text-zinc-950 hover:decoration-zinc-700" : "text-white/90 decoration-white/60 hover:text-white hover:decoration-white/80"}`}
                        aria-label="Share this mural"
                      >
                        {shareFeedback === "copied"
                          ? "Link copied"
                          : shareFeedback === "failed"
                            ? "Couldn't copy"
                            : "Share"}
                        {!shareFeedback && (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <MuralTimeline
                      muralId={activeMural.id}
                      canonicalImageUrl={activeMural.imageUrl}
                      canonicalThumbnailUrl={activeMural.thumbnail}
                      canonicalDateLabel={
                        formatIsoDate(activeMural.dateCaptured) ??
                        formatPhotoDate(activeMural.imageMetadata?.["Date taken"]) ??
                        "Original"
                      }
                      dominantColor={activeMural.dominantColor}
                      onRequestAuth={onRequestAuth}
                    />
                    <details
                      id="mural-modal-desc"
                      className={`mt-8 border-t pt-5 group/details ${isLight ? "border-zinc-200" : "border-white/20"}`}
                      aria-labelledby="image-metadata-heading"
                    >
                      <summary
                        id="image-metadata-heading"
                        className={`cursor-pointer list-none text-sm font-medium uppercase tracking-wider focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 rounded ${isLight ? "text-zinc-700 hover:text-zinc-900" : "text-white/85 hover:text-white"}`}
                      >
                        Image metadata
                      </summary>
                      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div>
                          <dt className={`text-sm ${isLight ? "text-zinc-700" : "text-white/85"}`}>Coordinates</dt>
                          <dd className={`mt-0.5 font-mono text-sm ${isLight ? "text-zinc-800" : "text-white/90"}`} aria-label="Mural location coordinates">
                            {activeMural.coordinates[1].toFixed(5)}°, {activeMural.coordinates[0].toFixed(5)}°
                          </dd>
                        </div>
                        {activeMural.imageMetadata &&
                          Object.entries(activeMural.imageMetadata).map(([label, value]) => (
                            <div key={label}>
                              <dt className={`text-sm ${isLight ? "text-zinc-700" : "text-white/85"}`}>{label}</dt>
                              <dd className={`mt-0.5 font-mono text-sm ${isLight ? "text-zinc-800" : "text-white/90"}`}>{value}</dd>
                            </div>
                          ))}
                      </dl>
                    </details>
                  </>
                )}
              </div>
            </div>
            <div
              className="safe-bottom-footer border-t p-4"
              style={{ backgroundColor: isLight ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.55)", borderColor: isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.12)" }}
            >
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handlePrev}
                  disabled={!canGoPrev}
                  className={`flex-1 min-h-[44px] rounded-lg border py-3 text-base font-medium shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${isLight ? "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 focus-visible:ring-offset-white" : "border-white/25 bg-white/15 text-white hover:bg-white/25 focus-visible:ring-offset-black/20"}`}
                  aria-label="Previous mural"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!canGoNext}
                  className={`flex-1 min-h-[44px] rounded-lg border py-3 text-base font-medium shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${isLight ? "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 focus-visible:ring-offset-white" : "border-white/25 bg-white/15 text-white hover:bg-white/25 focus-visible:ring-offset-black/20"}`}
                  aria-label="Next mural"
                >
                  Next
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className={`flex-1 min-h-[44px] rounded-lg border py-3 text-base font-medium shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 ${isLight ? "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 focus-visible:ring-offset-white" : "border-white/25 bg-white/15 text-white hover:bg-white/25 focus-visible:ring-offset-black/20"}`}
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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import { Database, RefreshCw } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useHaptics } from "@/hooks/useHaptics";
import { useLocationStore } from "@/store/locationStore";
import { normalizeImageForUpload } from "@/lib/upload/normalizeImageForUpload";

/**
 * Cosine similarity threshold: score >= this means "mural is in DB".
 * Lower than 0.85 to allow same-mural-under-different-conditions (lighting, angle)
 * to still count as a match; trade-off is slightly more false positives.
 */
export const MATCH_THRESHOLD = 0.80;

/**
 * Minimum relevance floor for override candidates. CLIP cosine similarity below
 * this is treated as noise (e.g. a selfie vs any mural). Set low enough that
 * same mural in different lighting/angle can still appear in the "pick below" list.
 */
export const MIN_RELEVANCE_SCORE = 0.48;

export interface SearchResultItem {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

export interface SearchResponse {
  results: SearchResultItem[];
}

export function isMatchInDb(response: SearchResponse): boolean {
  const top = response.results[0];
  return !!top && top.score >= MATCH_THRESHOLD;
}

interface CheckMuralModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** When provided, "View on map" triggers this with the matched mural id and closes modal (no navigation). */
  onViewOnMap?: (muralId: string) => void;
}

const SHEET = {
  hidden: { opacity: 0, y: "100%" },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: "100%" },
};

const CENTER = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
};

const SIDEBAR_WIDTH = "min(520px, 94vw)";

const TURNSTILE_WIDGET_ID = "check-mural-turnstile";
const TURNSTILE_CALLBACK_NAME = "checkMuralTurnstileCallback";
const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";

const PILSEN_FUN_FACTS = [
  "Pilsen is named after Plzeň, a city in the Czech Republic.",
  "The neighborhood has been a hub for Mexican culture since the 1960s.",
  "18th Street is often called the \"Mexican Magnificent Mile.\"",
  "Pilsen’s murals reflect labor, immigration, and community pride.",
  "The National Museum of Mexican Art sits in Harrison Park.",
  "Día de los Muertos is celebrated with altars and parades.",
  "Pilsen was historically Czech, then Mexican; now it’s diversifying again.",
  "Many murals were painted to resist gentrification and tell local stories.",
];

/** Digital zoom max when device has no hardware zoom. */
const DIGITAL_ZOOM_MAX = 4;
const CAMERA_IDEAL_WIDTH = 4096;
const CAMERA_IDEAL_HEIGHT = 3072;

/** Max request body for /api/search (Vercel serverless ~4.5MB); stay under to avoid 413. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

type ImageCaptureLike = {
  takePhoto: () => Promise<Blob>;
};

type Phase = "capture" | "checking" | "result" | "error";

interface ZoomCapability {
  min: number;
  max: number;
  step: number;
}

type SelectedResult = SearchResultItem | "none" | null;

export function CheckMuralModal({ isOpen, onClose, onViewOnMap }: CheckMuralModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSubmittedBlobRef = useRef<Blob | null>(null);
  const addToDbWithTokenRef = useRef<((token: string) => void) | null>(null);
  const zoomLevelRef = useRef(1);
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  const turnstileSiteKey =
    typeof process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY === "string" &&
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY.trim() !== ""
      ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY.trim()
      : null;

  const [phase, setPhase] = useState<Phase>("capture");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [zoomCapability, setZoomCapability] = useState<ZoomCapability | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [selectedResult, setSelectedResult] = useState<SelectedResult>(null);
  const [addToDbPending, setAddToDbPending] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [checkingPreviewUrl, setCheckingPreviewUrl] = useState<string | null>(null);
  const [funFactIndex, setFunFactIndex] = useState(0);

  const isDesktop = useMediaQuery("(min-width: 768px)");

  useEffect(() => {
    if (phase !== "checking") return;
    const id = setInterval(
      () => setFunFactIndex((i) => (i + 1) % PILSEN_FUN_FACTS.length),
      3500
    );
    return () => clearInterval(id);
  }, [phase]);
  const variants = isDesktop ? CENTER : SHEET;
  const userCoords = useLocationStore((s) => s.userCoords);
  const locationPermission = useLocationStore((s) => s.permission);
  const requestLocation = useLocationStore((s) => s.requestLocation);
  const dragControls = useDragControls();
  const haptics = useHaptics();

  const handleDrawerDragEnd = useCallback(
    (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
      const threshold = 80;
      const velocityThreshold = 300;
      if (info.offset.y > threshold || info.velocity.y > velocityThreshold) onClose();
    },
    [onClose]
  );

  useFocusTrap(dialogRef, isOpen);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const applyZoom = useCallback((level: number) => {
    if (zoomCapability) {
      const track = streamRef.current?.getVideoTracks()[0];
      if (track) {
        track
          .applyConstraints({ advanced: [{ zoom: level }] } as unknown as MediaTrackConstraints)
          .catch(() => { });
      }
    }
    setZoomLevel(level);
  }, [zoomCapability]);

  useEffect(() => {
    zoomLevelRef.current = zoomLevel;
  }, [zoomLevel]);

  const getPinchZoomBounds = useCallback(() => {
    if (zoomCapability) return { min: zoomCapability.min, max: zoomCapability.max };
    return { min: 1, max: DIGITAL_ZOOM_MAX };
  }, [zoomCapability]);

  const handlePinchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 2) return;
      const distance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchStartRef.current = { distance, zoom: zoomLevelRef.current };
    },
    []
  );

  const handlePinchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 2 || !pinchStartRef.current) return;
      e.preventDefault();
      const distance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scale = distance / pinchStartRef.current.distance;
      const { min, max } = getPinchZoomBounds();
      let next = pinchStartRef.current.zoom * scale;
      next = Math.max(min, Math.min(max, next));
      if (zoomCapability) {
        const step = zoomCapability.step;
        next = Math.round(next / step) * step;
      } else {
        next = Math.round(next * 10) / 10;
      }
      next = Math.max(min, Math.min(max, next));
      applyZoom(next);
    },
    [zoomCapability, getPinchZoomBounds, applyZoom]
  );

  const handlePinchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchStartRef.current = null;
  }, []);

  const startCamera = useCallback(() => {
    setCameraError(null);
    setZoomCapability(null);
    setZoomLevel(1);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera not supported. Use \"Upload photo\" instead.");
      return;
    }
    const supported = navigator.mediaDevices.getSupportedConstraints();
    const supportsZoom =
      typeof supported === "object" && supported !== null && (supported as { zoom?: boolean }).zoom === true;
    const constraints: MediaStreamConstraints = {
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: CAMERA_IDEAL_WIDTH },
        height: { ideal: CAMERA_IDEAL_HEIGHT },
      },
    };
    navigator.mediaDevices.getUserMedia(constraints)
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        const track = stream.getVideoTracks()[0];
        if (track) {
          const hasGetCapabilities = typeof (track as MediaStreamTrack & { getCapabilities?: unknown }).getCapabilities === "function";
          const hasGetSettings = typeof (track as MediaStreamTrack & { getSettings?: unknown }).getSettings === "function";
          const caps = hasGetCapabilities
            ? (track.getCapabilities() as Record<string, { min?: number; max?: number; step?: number }>)
            : {};
          const settings = hasGetSettings ? (track.getSettings() as Record<string, number>) : {};
          if (typeof caps.zoom === "object" && caps.zoom?.min != null && caps.zoom?.max != null) {
            const step = caps.zoom.step ?? 1;
            const current = settings.zoom;
            const clampedCurrent =
              typeof current === "number" ? Math.max(caps.zoom.min, Math.min(caps.zoom.max, current)) : caps.zoom.min;
            if (supportsZoom) {
              track
                .applyConstraints({ advanced: [{ zoom: clampedCurrent }] } as unknown as MediaTrackConstraints)
                .catch(() => { });
            }
            setZoomCapability({
              min: caps.zoom.min,
              max: caps.zoom.max,
              step,
            });
            setZoomLevel(clampedCurrent);
          }
        }
      })
      .catch(() => {
        setCameraError("Camera access denied. Use \"Upload photo\" instead.");
      });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setPhase("capture");
      setCameraError(null);
      setZoomCapability(null);
      setZoomLevel(1);
      setSearchError(null);
      setSearchResult(null);
      setSelectedResult(null);
      setAddToDbPending(false);
      lastSubmittedBlobRef.current = null;
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      if (checkingPreviewUrl) {
        URL.revokeObjectURL(checkingPreviewUrl);
        setCheckingPreviewUrl(null);
      }
    }
  }, [isOpen, stopCamera, previewUrl, checkingPreviewUrl]);

  useEffect(() => {
    if (phase === "result" && lastSubmittedBlobRef.current) {
      const url = URL.createObjectURL(lastSubmittedBlobRef.current);
      setPreviewUrl(url);
      return () => {
        URL.revokeObjectURL(url);
        setPreviewUrl(null);
      };
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== "checking" && checkingPreviewUrl) {
      URL.revokeObjectURL(checkingPreviewUrl);
      setCheckingPreviewUrl(null);
    }
  }, [phase, checkingPreviewUrl]);

  useEffect(() => {
    if (isOpen && phase === "capture") {
      startCamera();
    }
    return () => {
      if (phase !== "capture") stopCamera();
    };
  }, [isOpen, phase, startCamera, stopCamera]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", onKeyDown);
      return () => document.removeEventListener("keydown", onKeyDown);
    }
  }, [isOpen, onClose]);

  /**
   * Check phase is read-only: we only call /api/search. No Supabase or DB writes until the user
   * explicitly chooses "Add to database" (POST /api/murals/submit).
   * Camera path sends a canvas-derived JPEG (small); file path must normalize first to avoid 413.
   */
  const submitImage = useCallback(async (blob: Blob) => {
    if (blob.size > MAX_UPLOAD_BYTES) {
      setSearchError("Image is too large; choose a smaller file or take a new photo.");
      setPhase("error");
      return;
    }
    haptics.shutter();
    lastSubmittedBlobRef.current = blob;
    stopCamera();
    setPhase("checking");
    setCheckingPreviewUrl(URL.createObjectURL(blob));
    setSearchError(null);
    setSearchResult(null);
    setSelectedResult(null);
    const formData = new FormData();
    formData.append("image", blob, "capture.jpg");
    if (userCoords) {
      formData.append("lat", String(userCoords[1]));
      formData.append("lng", String(userCoords[0]));
    }
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        const message =
          res.status === 413
            ? "Image is too large; choose a smaller file or take a new photo."
            : (data?.error ?? "Search failed");
        setSearchError(message);
        setPhase("error");
        return;
      }
      const response = data as SearchResponse;
      setSearchResult(response);
      const matches = response.results.filter((r) => r.score >= MATCH_THRESHOLD);
      if (matches.length === 1) {
        setSelectedResult(matches[0]);
      }
      setPhase("result");
      haptics.success();
    } catch {
      setSearchError("Network error. Try again.");
      setPhase("error");
    }
  }, [stopCamera, userCoords, haptics]);

  const captureFromVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video || !streamRef.current || video.readyState !== 4) return;
    const track = streamRef.current.getVideoTracks()[0];
    const supportsImageCapture =
      typeof window !== "undefined" &&
      "ImageCapture" in window &&
      typeof (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => ImageCaptureLike }).ImageCapture ===
      "function";
    const useDigitalZoom = !zoomCapability && zoomLevel > 1;

    // Prefer ImageCapture to preserve camera metadata when available.
    if (track && supportsImageCapture && !useDigitalZoom) {
      const ImageCaptureCtor = (
        window as unknown as { ImageCapture: new (t: MediaStreamTrack) => ImageCaptureLike }
      ).ImageCapture;
      const imageCapture = new ImageCaptureCtor(track);
      imageCapture
        .takePhoto()
        .then((blob) => submitImage(blob))
        .catch(() => {
          const canvas = document.createElement("canvas");
          const w = video.videoWidth;
          const h = video.videoHeight;
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.drawImage(video, 0, 0);
          canvas.toBlob(
            (blob) => {
              if (blob) submitImage(blob);
            },
            "image/jpeg",
            0.9
          );
        });
      return;
    }

    const canvas = document.createElement("canvas");
    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (useDigitalZoom) {
      const cropW = w / zoomLevel;
      const cropH = h / zoomLevel;
      const sx = (w - cropW) / 2;
      const sy = (h - cropH) / 2;
      ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, w, h);
    } else {
      ctx.drawImage(video, 0, 0);
    }
    canvas.toBlob(
      (blob) => {
        if (blob) submitImage(blob);
      },
      "image/jpeg",
      0.9
    );
  }, [submitImage, zoomCapability, zoomLevel]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      e.target.value = "";
      normalizeImageForUpload(file)
        .then((blob) => {
          if (blob.size > MAX_UPLOAD_BYTES) {
            setSearchError("Image is too large; choose a smaller file or take a new photo.");
            setPhase("error");
            return;
          }
          submitImage(blob);
        })
        .catch(() => {
          setSearchError("Could not process image. Try another file.");
          setPhase("error");
        });
    },
    [submitImage]
  );

  const handleCheckAnother = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setPhase("capture");
    setSearchResult(null);
    setSelectedResult(null);
    setSearchError(null);
    lastSubmittedBlobRef.current = null;
    startCamera();
  }, [startCamera, previewUrl]);

  const submitLearningUpsert = useCallback(async (muralId: string) => {
    const blob = lastSubmittedBlobRef.current;
    if (!blob) return;
    const fd = new FormData();
    fd.append("image", blob, "capture.jpg");
    fd.append("muralId", muralId);
    try {
      await fetch("/api/murals", { method: "POST", body: fd });
    } catch {
      // Fire-and-forget; learning best-effort
    }
  }, []);

  const doAddToDbWithToken = useCallback(
    async (token: string) => {
      const blob = lastSubmittedBlobRef.current;
      if (!blob) return;
      setAddToDbPending(true);
      const fd = new FormData();
      fd.append("turnstileToken", token);
      fd.append("image", blob, "capture.jpg");
      if (userCoords) {
        fd.append("lat", String(userCoords[1]));
        fd.append("lng", String(userCoords[0]));
      }
      try {
        const res = await fetch("/api/murals/submit", { method: "POST", body: fd });
        if (res.ok) {
          setAddToDbPending(false);
          handleCheckAnother();
        } else {
          const data = await res.json().catch(() => ({}));
          setSearchError(data?.error ?? "Submission failed");
          setPhase("error");
          setAddToDbPending(false);
        }
      } catch {
        setSearchError("Network error. Try again.");
        setPhase("error");
        setAddToDbPending(false);
      }
    },
    [handleCheckAnother, userCoords]
  );

  useEffect(() => {
    (window as unknown as Record<string, (t: string) => void>)[TURNSTILE_CALLBACK_NAME] = (
      token: string
    ) => addToDbWithTokenRef.current?.(token);
    return () => {
      delete (window as unknown as Record<string, unknown>)[TURNSTILE_CALLBACK_NAME];
    };
  }, []);

  useEffect(() => {
    addToDbWithTokenRef.current = doAddToDbWithToken;
  }, [doAddToDbWithToken]);

  useEffect(() => {
    if (!isOpen || !turnstileSiteKey || phase !== "result") return;
    if (document.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`)) return;
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    document.head.appendChild(script);
  }, [isOpen, turnstileSiteKey, phase]);

  const handleAddToDb = useCallback(() => {
    if (!lastSubmittedBlobRef.current) return;
    if (!turnstileSiteKey) {
      setSearchError("Captcha not configured. Cannot submit.");
      setPhase("error");
      return;
    }
    const w = (window as unknown as { turnstile?: { execute: (id: string) => void } }).turnstile;
    if (w?.execute) {
      w.execute(TURNSTILE_WIDGET_ID);
    } else {
      setSearchError("Captcha not ready. Try again in a moment.");
      setPhase("error");
    }
  }, [turnstileSiteKey]);

  const match = searchResult && isMatchInDb(searchResult);
  const results = searchResult?.results ?? [];
  const matchResults = results.filter((r) => r.score >= MATCH_THRESHOLD);
  /** When we have a match, show only results at or above threshold (often 1 for exact image). When no match, show no candidates. */
  const displayResults = match ? matchResults : [];
  /** When no match, show up to 5 above relevance floor so same mural in different conditions can still be chosen. */
  const overrideCandidates = !match && results.length > 0
    ? results.filter((r) => r.score >= MIN_RELEVANCE_SCORE).slice(0, 5)
    : [];
  const thumbSrc = (p: Record<string, unknown> | undefined) =>
    typeof p?.thumbnail === "string"
      ? (p.thumbnail as string)
      : typeof p?.imageUrl === "string"
        ? (p.imageUrl as string)
        : null;

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
          <div
            className="safe-bottom fixed z-50 bottom-0 left-0 right-0 md:left-1/2 md:right-auto md:top-1/2 md:bottom-auto md:-translate-x-1/2 md:-translate-y-1/2"
            style={isDesktop ? { width: SIDEBAR_WIDTH } : undefined}
            aria-hidden
          >
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="check-mural-modal-title"
              aria-describedby="check-mural-modal-desc"
              className="flex h-full max-h-[85vh] flex-col overflow-hidden border border-zinc-200 bg-white shadow-xl rounded-t-3xl border-t md:max-h-[90vh] md:rounded-2xl"
              variants={variants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
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
                className="flex min-h-[44px] cursor-grab active:cursor-grabbing flex-col items-center justify-center pt-3 pb-1 md:hidden"
                aria-hidden
                onPointerDown={!isDesktop ? (e) => dragControls.start(e) : undefined}
              >
                <span className="h-1.5 w-12 shrink-0 rounded-full bg-zinc-300" aria-hidden />
              </div>
              <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
                <h2
                  id="check-mural-modal-title"
                  className="text-lg font-semibold text-zinc-900"
                >
                  Check a mural
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
                  aria-label="Close"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div id="check-mural-modal-desc" className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
                {phase === "capture" && (
                  <div className="flex flex-col gap-4">
                    <p className="text-sm text-zinc-600">
                      Take a photo of a mural or upload an image to see if it&apos;s in our database.
                    </p>
                    <div
                      ref={previewContainerRef}
                      className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-zinc-100 touch-none"
                      onTouchStart={handlePinchStart}
                      onTouchMove={handlePinchMove}
                      onTouchEnd={handlePinchEnd}
                      onTouchCancel={handlePinchEnd}
                    >
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="h-full w-full object-cover"
                        style={
                          !zoomCapability && zoomLevel > 1
                            ? {
                              position: "absolute",
                              left: "50%",
                              top: "50%",
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              transform: `translate(-50%, -50%) scale(${zoomLevel})`,
                            }
                            : undefined
                        }
                        aria-label="Camera preview — pinch to zoom"
                      />
                      {cameraError && (
                        <div className="absolute inset-0 flex items-center justify-center bg-zinc-200/95 p-4 text-center text-sm text-zinc-700">
                          {cameraError}
                        </div>
                      )}
                      {!cameraError && (
                        <div
                          className="absolute bottom-3 right-3 rounded-lg bg-black/50 px-2 py-1 text-xs text-white/90"
                          aria-hidden
                        >
                          {zoomLevel.toFixed(1)}×
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      {!cameraError && (
                        <button
                          type="button"
                          onClick={captureFromVideo}
                          className="min-h-[44px] w-full rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--color-accent-foreground)] shadow-sm transition-colors hover:bg-[var(--color-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
                          aria-label="Capture photo"
                        >
                          Capture photo
                        </button>
                      )}
                      <label className="flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl border-2 border-[var(--color-accent)] bg-transparent px-4 py-2.5 text-sm font-semibold text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)] focus-within:ring-2 focus-within:ring-[var(--color-accent)] focus-within:ring-offset-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handleFileChange}
                          className="sr-only"
                          aria-label="Upload photo from device"
                        />
                        Upload photo
                      </label>
                    </div>
                  </div>
                )}

                {phase === "checking" && (
                  <div
                    className="flex flex-col items-center justify-center gap-4 py-6"
                    role="status"
                    aria-live="polite"
                    aria-label="Checking your photo"
                  >
                    <p className="text-sm font-medium text-zinc-700">Checking your photo…</p>
                    <p className="text-xs text-zinc-500">This may take a few seconds.</p>
                    {checkingPreviewUrl && (
                      <div className="relative w-full max-w-[280px] overflow-hidden rounded-xl bg-zinc-100">
                        <img
                          src={checkingPreviewUrl}
                          alt="Photo being checked"
                          className="max-h-[160px] w-full object-contain"
                        />
                        <motion.div
                          className="absolute left-0 right-0 z-10 h-2 rounded-full bg-gradient-to-b from-transparent via-[var(--color-accent)] to-transparent opacity-90 shadow-[0_0_12px_2px_rgba(226,126,166,0.6)]"
                          initial={{ top: "0%" }}
                          animate={{ top: ["0%", "100%", "0%"] }}
                          transition={{
                            repeat: Infinity,
                            duration: 2.4,
                            ease: "easeInOut",
                          }}
                          style={{ position: "absolute" as const }}
                          aria-hidden
                        />
                      </div>
                    )}
                    <p
                      className="max-w-[280px] text-center text-sm text-zinc-500"
                      aria-live="polite"
                    >
                      {PILSEN_FUN_FACTS[funFactIndex]}
                    </p>
                  </div>
                )}

                {phase === "result" && searchResult && (
                  <div className="flex flex-col gap-4" aria-live="polite">
                    {match ? (
                      <p className="text-base text-zinc-600">
                        Looks like we might have this one. Tap the match below, or choose &quot;None of these&quot; if it&apos;s not here.
                      </p>
                    ) : (
                      <p className="text-base text-zinc-600">
                        We don&apos;t have this one in our collection yet. Add it below and we&apos;ll have it for next time.
                      </p>
                    )}
                    {previewUrl && (
                      <div className="flex flex-col items-center gap-3">
                        <div className="flex justify-center">
                          <img
                            src={previewUrl}
                            alt="Photo you are adding to the database"
                            className="max-h-[min(40vh,280px)] w-auto max-w-full rounded-lg border border-zinc-200 object-contain"
                          />
                        </div>
                        {displayResults.length > 0 && (
                          <button
                            type="button"
                            onClick={handleCheckAnother}
                            className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border-2 border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
                            aria-label="Retake photo"
                          >
                            <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
                            Retake photo
                          </button>
                        )}
                      </div>
                    )}
                    {previewUrl && displayResults.length > 0 && (
                      <div
                        className="h-px w-full bg-zinc-200"
                        role="presentation"
                        aria-hidden
                      />
                    )}
                    {displayResults.length === 0 && (
                      <div className="flex flex-col gap-3 pt-2">
                        {turnstileSiteKey && (
                          <div
                            id={TURNSTILE_WIDGET_ID}
                            className="cf-turnstile sr-only"
                            data-sitekey={turnstileSiteKey}
                            data-callback={TURNSTILE_CALLBACK_NAME}
                            data-size="invisible"
                            aria-hidden
                          />
                        )}
                        {!userCoords && (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                            <p className="font-medium">Location required</p>
                            <p className="mt-0.5 text-amber-800">
                              Allow location access to add this mural to the map. We use your exact position to place it.
                            </p>
                            {locationPermission !== "denied" ? (
                              <button
                                type="button"
                                onClick={requestLocation}
                                className="mt-2 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-amber-950 transition-colors hover:bg-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2"
                                aria-label="Enable location access"
                              >
                                Enable location
                              </button>
                            ) : (
                              <p className="mt-2 text-xs text-amber-700">
                                Location was denied. Enable it in your browser or device settings to add murals.
                              </p>
                            )}
                          </div>
                        )}
                        <div className="flex min-h-[44px] w-full flex-row items-stretch gap-3">
                          <button
                            type="button"
                            onClick={handleCheckAnother}
                            className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
                            aria-label="Retake photo"
                          >
                            <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
                            Retake photo
                          </button>
                          <button
                            type="button"
                            onClick={handleAddToDb}
                            disabled={addToDbPending || !turnstileSiteKey || !userCoords}
                            className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-green-600 bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label="Add this mural to the database"
                            title={
                              !userCoords
                                ? "Location required"
                                : !turnstileSiteKey
                                  ? "Captcha not configured"
                                  : undefined
                            }
                          >
                            <Database className="h-4 w-4 shrink-0" aria-hidden />
                            {addToDbPending ? "Submitting…" : "Add to database"}
                          </button>
                        </div>
                        {overrideCandidates.length > 0 && (
                          <>
                            <div className="h-px w-full bg-zinc-200" aria-hidden />
                            <p className="text-sm text-zinc-600">
                              Think it&apos;s in our collection? Pick the mural below.
                            </p>
                            <p className="text-xs text-zinc-500">
                              Lighting and angle can affect matching. If you took this at the mural, pick it below.
                              {userCoords && " Results are ordered by similarity and distance from you."}
                            </p>
                            <ul
                              role="list"
                              className={`grid max-h-[min(50vh,340px)] gap-3 overflow-y-auto justify-items-center ${overrideCandidates.length === 1
                                ? "grid-cols-1"
                                : overrideCandidates.length <= 3
                                  ? "grid-cols-3"
                                  : "grid-cols-2 sm:grid-cols-3"
                                }`}
                              aria-label="Possible matches to confirm"
                            >
                              {overrideCandidates.map((r) => {
                                const src = thumbSrc(r.payload);
                                const title =
                                  typeof r.payload?.title === "string"
                                    ? (r.payload.title as string)
                                    : r.id;
                                const isSelected = selectedResult === r;
                                return (
                                  <li key={r.id} className="w-full min-w-0 flex justify-center">
                                    <button
                                      type="button"
                                      onClick={() => setSelectedResult(r)}
                                      className={`flex w-full max-w-[10rem] rounded-lg border-2 p-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 ${isSelected
                                        ? "border-amber-600 bg-amber-50"
                                        : "border-zinc-200 bg-white hover:border-zinc-300"
                                        }`}
                                      aria-pressed={isSelected}
                                      aria-label={`Confirm: ${title}`}
                                    >
                                      <span className="relative block w-full aspect-square overflow-hidden rounded-md">
                                        {src ? (
                                          <img
                                            src={src}
                                            alt=""
                                            className="h-full w-full object-cover"
                                            width={112}
                                            height={112}
                                          />
                                        ) : (
                                          <span className="block h-full w-full bg-zinc-100" />
                                        )}
                                      </span>
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                            <button
                              type="button"
                              onClick={() => {
                                if (selectedResult && selectedResult !== "none") {
                                  submitLearningUpsert(selectedResult.id);
                                  onViewOnMap?.(selectedResult.id);
                                  onClose();
                                }
                              }}
                              disabled={!selectedResult || selectedResult === "none"}
                              className="min-h-[44px] w-full rounded-xl border-2 border-amber-600 bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                              aria-label="Or, confirm selected mural is in the database"
                            >
                              Or, confirm it&apos;s in database
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    {displayResults.length > 0 && (
                      <>
                        <ul
                          role="list"
                          className={`grid max-h-[min(55vh,360px)] gap-3 overflow-y-auto justify-items-center ${displayResults.length === 1
                            ? "grid-cols-1"
                            : displayResults.length === 2
                              ? "grid-cols-2"
                              : "grid-cols-3"
                            }`}
                          aria-label="Search results"
                        >
                          {displayResults.map((r) => {
                            const src = thumbSrc(r.payload);
                            const title =
                              typeof r.payload?.title === "string"
                                ? (r.payload.title as string)
                                : r.id;
                            const isSelected = selectedResult === r;
                            return (
                              <li key={r.id} className="w-full min-w-0 flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => setSelectedResult(r)}
                                  className={`flex w-full max-w-[10rem] rounded-lg border-2 p-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 ${isSelected
                                    ? "border-green-600 bg-green-600"
                                    : "border-zinc-200 bg-white hover:border-zinc-300"
                                    }`}
                                  aria-pressed={isSelected}
                                  aria-label={`Select: ${title}`}
                                >
                                  <span className="relative block w-full aspect-square overflow-hidden rounded-md">
                                    {src ? (
                                      <img
                                        src={src}
                                        alt=""
                                        className="h-full w-full object-cover"
                                        width={112}
                                        height={112}
                                      />
                                    ) : (
                                      <span className="block h-full w-full bg-zinc-100" />
                                    )}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                        <div className="flex min-h-[44px] w-full flex-row items-stretch gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              haptics.error();
                              setSelectedResult("none");
                            }}
                            className={`flex flex-1 items-center justify-center rounded-xl border-2 p-2 text-center text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 ${selectedResult === "none"
                              ? "border-red-600 bg-red-600 text-white"
                              : "border-red-500 bg-white text-red-600 hover:bg-red-50"
                              }`}
                            aria-pressed={selectedResult === "none"}
                            aria-label="None of these"
                          >
                            None of these
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (selectedResult === "none") {
                                handleAddToDb();
                              } else if (selectedResult) {
                                haptics.success();
                                submitLearningUpsert(selectedResult.id);
                                onViewOnMap?.(selectedResult.id);
                                onClose();
                              }
                            }}
                            disabled={selectedResult === null || (selectedResult === "none" && addToDbPending)}
                            className="flex flex-1 items-center justify-center rounded-xl border-2 border-green-600 bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {selectedResult === "none"
                              ? addToDbPending
                                ? "Submitting…"
                                : "Confirm selection"
                              : "Confirm selection"}
                          </button>
                        </div>
                      </>
                    )}
                    <div className="-mt-2 -mb-1 flex justify-center">
                      <button
                        type="button"
                        onClick={handleCheckAnother}
                        className="rounded px-2 py-1 text-xs font-medium text-[var(--color-accent)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
                        aria-label="Check another mural"
                      >
                        Check another
                      </button>
                    </div>
                  </div>
                )}

                {phase === "error" && (
                  <div className="flex flex-col gap-4" aria-live="polite">
                    <p className="text-sm font-medium text-red-700">
                      {searchError}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleCheckAnother}
                        className="min-h-[44px] flex-1 rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--color-accent-foreground)] shadow-sm transition-colors hover:bg-[var(--color-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
                      >
                        Try again
                      </button>
                      <button
                        type="button"
                        onClick={onClose}
                        className="min-h-[44px] flex-1 rounded-xl border border-zinc-300 bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

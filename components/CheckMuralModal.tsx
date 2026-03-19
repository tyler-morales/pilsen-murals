"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import { AlertCircle, CircleCheck, ImagePlus, Loader2, RefreshCw, X } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useHaptics } from "@/hooks/useHaptics";
import { useAuthStore } from "@/store/authStore";
import { useLocationStore } from "@/store/locationStore";
import { useCaptureStore } from "@/store/captureStore";
import { haversineDistanceMeters } from "@/lib/geo";
import { normalizeImageForUpload } from "@/lib/upload/normalizeImageForUpload";
import { bucketResultsByMuralId } from "@/lib/searchUtils";
import { sanitizeErrorFromServer } from "@/lib/errorUtils";
import { savePendingMuralDraft, getPendingMuralDraft, clearPendingMuralDraft, dataUrlToBlob } from "@/lib/pendingMuralDraft";
import { ImageEditor } from "@/components/ImageEditor";
import { LocationConfirm } from "@/components/LocationConfirm";
import { ArtistCombobox, type ArtistComboboxValue } from "@/components/ArtistCombobox";
import { ensureTurnstileScript } from "@/lib/turnstile-loader";

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
  /** When provided, called when user adds a mural and clicks "View on map"; receives the new mural for fly-to + detail panel. */
  onMuralAdded?: (mural: import("@/types/mural").Mural) => void;
  /** When provided, called when a match is confirmed (before close); used to show capture-reveal animation. */
  onCaptureConfirmed?: (muralId: string) => void;
  /** When provided, called when user tries to add a mural but is not authenticated; (title, message) for auth modal. */
  onRequestAuth?: (title: string, message: string) => void;
  /** Full mural list for computing capture distance; optional. */
  murals?: import("@/types/mural").Mural[];
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
const TURNSTILE_CONTAINER_SELECTOR = `#${TURNSTILE_WIDGET_ID}`;

/** Fallback map center when user location is unavailable (Pilsen, Chicago). [lng, lat] */
const PILSEN_CENTER: [number, number] = [-87.657, 41.852];

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

type Phase = "capture" | "edit" | "checking" | "result" | "submit-details" | "confirm-location" | "confirmed" | "error";
type ConfirmedAction = "match" | "added" | null;

interface ZoomCapability {
  min: number;
  max: number;
  step: number;
}

type SelectedResult = SearchResultItem | "none" | null;

type ResultVariant = "match" | "override";

const RESULT_STYLES: Record<
  ResultVariant,
  { selected: string; ring: string; singleSelected: string }
> = {
  match: {
    selected: "border-green-600 bg-green-600",
    ring: "focus-visible:ring-green-500",
    singleSelected: "border-green-600 bg-green-600",
  },
  override: {
    selected: "border-amber-600 bg-amber-50",
    ring: "focus-visible:ring-amber-500",
    singleSelected: "border-amber-600 bg-amber-50",
  },
};

function thumbImg({
  src,
  className = "h-full w-full object-cover",
}: {
  src: string | null;
  className?: string;
}) {
  return src ? (
    <img
      src={src}
      alt=""
      className={className}
      width={112}
      height={112}
    />
  ) : (
    <span className="block h-full w-full bg-zinc-100" />
  );
}

interface ResultBucketGridProps {
  variant: ResultVariant;
  buckets: Array<{ muralId: string; items: SearchResultItem[] }>;
  thumbSrc: (p: Record<string, unknown> | undefined) => string | null;
  selectedResult: SelectedResult;
  onSelect: (r: SearchResultItem) => void;
  expandedStackId: string | null;
  onExpandStack: (muralId: string) => void;
  gridClass: string;
  listAriaLabel: string;
  selectLabel: string;
  confirmLabel: string;
}

function ResultBucketGrid({
  variant,
  buckets,
  thumbSrc,
  selectedResult,
  onSelect,
  expandedStackId,
  onExpandStack,
  gridClass,
  listAriaLabel,
  selectLabel,
  confirmLabel,
}: ResultBucketGridProps) {
  const style = RESULT_STYLES[variant];
  const isMatch = variant === "match";
  const actionLabel = isMatch ? selectLabel : confirmLabel;

  return (
    <ul role="list" className={gridClass} aria-label={listAriaLabel}>
      {buckets.map(({ muralId, items }) => {
        const title =
          typeof items[0]?.payload?.title === "string"
            ? (items[0].payload.title as string)
            : muralId;
        if (items.length === 1) {
          const r = items[0];
          const src = thumbSrc(r.payload);
          const isSelected = selectedResult === r;
          return (
            <li key={muralId} className="w-full min-w-0 flex justify-center">
              <button
                type="button"
                onClick={() => onSelect(r)}
                className={`flex w-full max-w-[10rem] rounded-lg border-2 p-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${style.ring} ${isSelected ? style.singleSelected : "border-zinc-200 bg-white hover:border-zinc-300"}`}
                aria-pressed={isSelected}
                aria-label={`${actionLabel}: ${title}`}
              >
                <span className="relative block w-full aspect-square overflow-hidden rounded-md">
                  {thumbImg({ src })}
                </span>
              </button>
            </li>
          );
        }
        const isExpanded = expandedStackId === muralId;
        return (
          <li key={muralId} className="w-full min-w-0 flex justify-center">
            {isExpanded ? (
              <div
                className="grid grid-cols-2 sm:grid-cols-3 gap-1 w-full max-w-[10rem]"
                role="group"
                aria-label={`${items.length} photos of this mural`}
              >
                {items.map((r, idx) => {
                  const src = thumbSrc(r.payload);
                  const isSelected = selectedResult === r;
                  return (
                    <button
                      key={`${muralId}-${idx}`}
                      type="button"
                      onClick={() => onSelect(r)}
                      className={`flex rounded-lg border-2 p-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 aspect-square ${style.ring} ${isSelected ? style.singleSelected : "border-zinc-200 bg-white hover:border-zinc-300"}`}
                      aria-pressed={isSelected}
                      aria-label={`${actionLabel}: ${title} (photo ${idx + 1} of ${items.length})`}
                    >
                      <span className="relative block w-full h-full overflow-hidden rounded-md">
                        {thumbImg({ src })}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onExpandStack(muralId)}
                className={`flex w-full max-w-[10rem] rounded-lg border-2 border-zinc-200 bg-white p-1 transition-colors hover:border-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${style.ring}`}
                aria-expanded={false}
                aria-label={`${items.length} photos of this mural, tap to expand`}
              >
                <span className="relative block w-full aspect-square overflow-hidden rounded-md">
                  {items.slice(0, 3).map((r, idx) => {
                    const src = thumbSrc(r.payload);
                    return (
                      <span
                        key={`${muralId}-${idx}`}
                        className="absolute inset-0 block overflow-hidden rounded-md"
                        style={{
                          top: `${idx * 6}px`,
                          left: `${idx * 6}px`,
                          right: `${(2 - idx) * 6}px`,
                          bottom: `${(2 - idx) * 6}px`,
                          zIndex: idx,
                        }}
                      >
                        {thumbImg({ src })}
                      </span>
                    );
                  })}
                  <span
                    className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-sm font-medium text-white"
                    aria-hidden
                  >
                    {items.length}
                  </span>
                </span>
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function CheckMuralModal({
  isOpen,
  onClose,
  onViewOnMap,
  onMuralAdded,
  onCaptureConfirmed,
  onRequestAuth,
  murals,
}: CheckMuralModalProps) {
  const user = useAuthStore((s) => s.user);
  const dialogRef = useRef<HTMLDivElement>(null);
  const fullScreenRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSubmittedBlobRef = useRef<Blob | null>(null);
  const addToDbWithTokenRef = useRef<((token: string) => void) | null>(null);
  const submitDiscoveryCaptureRef = useRef<((muralId: string, token: string) => Promise<void>) | null>(null);
  const pendingTurnstileActionRef = useRef<"submit" | { muralId: string } | null>(null);
  const pendingMuralIdRef = useRef<string | null>(null);
  const addedMuralRef = useRef<import("@/types/mural").Mural | null>(null);
  const pendingSubmitCoordsRef = useRef<[number, number] | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
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
  const [learningPending, setLearningPending] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [checkingPreviewUrl, setCheckingPreviewUrl] = useState<string | null>(null);
  const [funFactIndex, setFunFactIndex] = useState(0);
  const [expandedStackId, setExpandedStackId] = useState<string | null>(null);
  const [confirmedAction, setConfirmedAction] = useState<ConfirmedAction>(null);
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const [submitTitle, setSubmitTitle] = useState("");
  const [submitArtistValue, setSubmitArtistValue] = useState<ArtistComboboxValue>({
    id: null,
    name: "",
  });
  const [submitDateCaptured, setSubmitDateCaptured] = useState("");
  const [submitDatePainted, setSubmitDatePainted] = useState("");

  function getTodayLocalDate(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  const isDesktop = useMediaQuery("(min-width: 768px)");
  const showFullScreenCapture = isOpen && !isDesktop && phase === "capture";
  const showModal = isOpen && (isDesktop || phase !== "capture");

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
  const addCapture = useCaptureStore((s) => s.addCapture);
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

  const trapRef = !isDesktop && phase === "capture" ? fullScreenRef : dialogRef;
  useFocusTrap(trapRef, isOpen);

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
          .catch((err) => {
            console.debug("CheckMuralModal: applyConstraints zoom failed", err);
          });
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
      setCameraError(
        "Your browser doesn't support the camera. Tap 'Choose from device' to pick a photo instead."
      );
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
                .catch((err) => {
                  console.debug("CheckMuralModal: applyConstraints zoom failed", err);
                });
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
        setCameraError(
          "We can't access your camera. Tap 'Choose from device' below to pick a photo instead."
        );
      });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setPhase("capture");
      setConfirmedAction(null);
      setCameraError(null);
      setZoomCapability(null);
      setZoomLevel(1);
      setSearchError(null);
      setSearchResult(null);
      setSelectedResult(null);
      setExpandedStackId(null);
      setAddToDbPending(false);
      setSubmitTitle("");
      setSubmitArtistValue({ id: null, name: "" });
      setSubmitDateCaptured("");
      setSubmitDatePainted("");
      lastSubmittedBlobRef.current = null;
      pendingMuralIdRef.current = null;
      pendingSubmitCoordsRef.current = null;
      clearPendingMuralDraft();
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
    if (!isOpen || !user) return;
    const draft = getPendingMuralDraft();
    if (!draft) return;
    try {
      const blob = dataUrlToBlob(draft.imageDataUrl);
      lastSubmittedBlobRef.current = blob;
      setSearchResult(draft.searchResult as SearchResponse);
      if (draft.matchedMuralId) {
        const match = (draft.searchResult.results ?? []).find(
          (r: { id: string }) => r.id === draft.matchedMuralId
        );
        if (match) setSelectedResult(match as SearchResultItem);
        setPhase("result");
      } else {
        setSubmitDateCaptured((d) => d || getTodayLocalDate());
        setPhase("submit-details");
      }
      clearPendingMuralDraft();
    } catch {
      clearPendingMuralDraft();
    }
  }, [isOpen, user]);

  useEffect(() => {
    if ((phase === "result" || phase === "submit-details" || phase === "confirm-location") && lastSubmittedBlobRef.current) {
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
    if (!showFullScreenCapture) return;
    type OrientWithLock = ScreenOrientation & {
      lock?(orientation: string): Promise<void>;
      unlock?(): void;
    };
    const orientation = typeof screen !== "undefined" ? (screen.orientation as OrientWithLock) : null;
    const lock = () => {
      if (!orientation?.lock) return;
      try {
        const p = orientation.lock("portrait");
        if (p && typeof (p as Promise<unknown>)?.catch === "function") {
          (p as Promise<void>).catch((err) => {
            console.debug("CheckMuralModal: orientation lock not supported or failed", err);
          });
        }
      } catch {
        // iOS Safari and some browsers do not support orientation lock
      }
    };
    lock();
    return () => {
      try {
        if (orientation?.unlock) orientation.unlock();
      } catch {
        // no-op
      }
    };
  }, [showFullScreenCapture]);

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
      setSearchError(
        "This image is too large (max 4 MB). Try taking a new photo or picking a smaller file."
      );
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
            ? "This image is too large (max 4 MB). Try taking a new photo or picking a smaller file."
            : sanitizeErrorFromServer(data?.error) ||
            "We couldn't check your photo right now. This might be a temporary issue — try again in a moment.";
        setSearchError(message);
        setPhase("error");
        return;
      }
      const response = data as SearchResponse;
      setSearchResult(response);
      const matches = response.results.filter((r) => r.score >= MATCH_THRESHOLD);
      const matchBuckets = bucketResultsByMuralId(matches);
      if (matchBuckets.length === 1 && matchBuckets[0].items.length === 1) {
        setSelectedResult(matchBuckets[0].items[0]);
      }
      setPhase("result");
      haptics.success();
    } catch {
      setSearchError(
        "It looks like you're offline or have a weak connection. Check your internet and try again."
      );
      setPhase("error");
    }
  }, [stopCamera, userCoords, haptics]);

  const goToEdit = useCallback(
    (blob: Blob) => {
      if (editImageUrl) URL.revokeObjectURL(editImageUrl);
      stopCamera();
      setEditImageUrl(URL.createObjectURL(blob));
      setPhase("edit");
    },
    [editImageUrl, stopCamera]
  );

  const handleEditBack = useCallback(() => {
    if (editImageUrl) {
      URL.revokeObjectURL(editImageUrl);
      setEditImageUrl(null);
    }
    setPhase("capture");
    startCamera();
  }, [editImageUrl, startCamera]);

  const handleEditComplete = useCallback(
    (blob: Blob) => {
      if (editImageUrl) {
        URL.revokeObjectURL(editImageUrl);
        setEditImageUrl(null);
      }
      const file = new File([blob], "capture.jpg", { type: blob.type || "image/jpeg" });
      normalizeImageForUpload(file)
        .then((normalized) => submitImage(normalized))
        .catch(() => {
          setSearchError(
            "We had trouble processing this image. Try a different photo or take a new one."
          );
          setPhase("error");
        });
    },
    [editImageUrl, submitImage]
  );

  /** Send capture to edit phase (rotate/crop), then submit. */
  const submitCapture = useCallback(
    (blob: Blob) => {
      goToEdit(blob);
    },
    [goToEdit]
  );

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
        .then((blob) => submitCapture(blob))
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
            (blob) => blob && submitCapture(blob),
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
      (blob) => blob && submitCapture(blob),
      "image/jpeg",
      0.9
    );
  }, [submitCapture, zoomCapability, zoomLevel]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      e.target.value = "";
      goToEdit(file);
    },
    [goToEdit]
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

  const submitDiscoveryCapture = useCallback(
    async (muralId: string, token: string) => {
      const blob = lastSubmittedBlobRef.current;
      if (!blob) return;
      const fd = new FormData();
      fd.append("turnstileToken", token);
      fd.append("image", blob, "capture.jpg");
      fd.append("muralId", muralId);
      if (userCoords) {
        fd.append("lat", String(userCoords[1]));
        fd.append("lng", String(userCoords[0]));
      }
      try {
        const res = await fetch("/api/captures", { method: "POST", body: fd });
        if (res.ok) {
          await res.json();
          setPhase("confirmed");
          setConfirmedAction("match");
          pendingMuralIdRef.current = muralId;
          setLearningPending(false);
          haptics.success();
          const win = window as unknown as { turnstile?: { reset?: (container: string) => void } };
          win.turnstile?.reset?.(TURNSTILE_CONTAINER_SELECTOR);
        } else {
          let err: { error?: string } = {};
          try {
            const text = await res.text();
            err = text ? (JSON.parse(text) as { error?: string }) : {};
          } catch {
            // ignore
          }
          setSearchError(
            sanitizeErrorFromServer(err?.error) ??
            "We couldn't add this to your collection. Please try again."
          );
          setPhase("error");
          setLearningPending(false);
        }
      } catch {
        setSearchError(
          "It looks like you're offline or have a weak connection. Check your internet and try again."
        );
        setPhase("error");
        setLearningPending(false);
      }
    },
    [userCoords, haptics]
  );

  const doAddToDbWithToken = useCallback(
    async (token: string) => {
      const blob = lastSubmittedBlobRef.current;
      if (!blob) return;
      const coords = pendingSubmitCoordsRef.current ?? userCoords;
      pendingSubmitCoordsRef.current = null;
      if (!coords) {
        setPhase("confirm-location");
        return;
      }
      setAddToDbPending(true);
      const fd = new FormData();
      fd.append("turnstileToken", token);
      fd.append("image", blob, "capture.jpg");
      fd.append("lat", String(coords[1]));
      fd.append("lng", String(coords[0]));
      if (submitTitle.trim()) fd.append("title", submitTitle.trim());
      if (submitArtistValue.id) fd.append("artistId", submitArtistValue.id);
      if (submitArtistValue.name.trim()) fd.append("artist", submitArtistValue.name.trim());
      const dateCapturedValue =
        submitDateCaptured.trim()
          ? new Date(submitDateCaptured.trim()).toISOString()
          : new Date().toISOString();
      fd.append("dateCaptured", dateCapturedValue);
      if (submitDatePainted.trim()) fd.append("datePainted", submitDatePainted.trim());
      try {
        const res = await fetch("/api/murals/submit", { method: "POST", body: fd });
        if (res.ok) {
          const data = (await res.json()) as { mural?: import("@/types/mural").Mural };
          const newMural = data.mural ?? null;
          addedMuralRef.current = newMural;
          setAddToDbPending(false);
          haptics.success();
          if (newMural) {
            addCapture(
              {
                muralId: newMural.id,
                capturedAt: new Date().toISOString(),
                lat: coords[1],
                lng: coords[0],
                distanceMeters: 0,
              },
              lastSubmittedBlobRef.current ?? undefined
            );
          }
          setConfirmedAction("added");
          setPhase("confirmed");
          const win = window as unknown as {
            turnstile?: { reset?: (container: string) => void };
          };
          win.turnstile?.reset?.(TURNSTILE_CONTAINER_SELECTOR);
        } else {
          let data: { error?: string } = {};
          try {
            const text = await res.text();
            data = text ? (JSON.parse(text) as { error?: string }) : {};
          } catch (e) {
            console.debug("CheckMuralModal: submit response parse failed", e);
          }
          setSearchError(
            sanitizeErrorFromServer(data?.error) ||
            "We couldn't add this mural. Please try again, or close and come back later."
          );
          setPhase("error");
          setAddToDbPending(false);
        }
      } catch {
        setSearchError(
          "It looks like you're offline or have a weak connection. Check your internet and try again."
        );
        setPhase("error");
        setAddToDbPending(false);
      }
    },
    [userCoords, haptics, submitTitle, submitArtistValue, submitDateCaptured, submitDatePainted, addCapture]
  );

  useEffect(() => {
    addToDbWithTokenRef.current = doAddToDbWithToken;
  }, [doAddToDbWithToken]);

  useEffect(() => {
    submitDiscoveryCaptureRef.current = submitDiscoveryCapture;
  }, [submitDiscoveryCapture]);

  useEffect(() => {
    if (!isOpen) {
      if (turnstileWidgetIdRef.current) {
        const win = window as unknown as { turnstile?: { remove: (id: string) => void } };
        win.turnstile?.remove(turnstileWidgetIdRef.current);
        turnstileWidgetIdRef.current = null;
      }
    }
  }, [isOpen]);

  const handleTurnstileError = useCallback((_errorCode?: number) => {
    setAddToDbPending(false);
    setLearningPending(false);
    setSearchError(
      "Security check didn't complete. Please try again or refresh the page."
    );
    setPhase("error");
  }, []);

  useEffect(() => {
    if (!isOpen || !turnstileSiteKey || phase !== "result") return;
    const win = window as unknown as {
      turnstile?: {
        render: (
          container: string,
          options: {
            sitekey: string;
            callback: (token: string) => void;
            execution: string;
            "error-callback"?: (errorCode?: number) => boolean;
          }
        ) => string;
      };
    };
    const renderOptions = {
      sitekey: turnstileSiteKey,
      callback: (token: string) => {
        const action = pendingTurnstileActionRef.current;
        pendingTurnstileActionRef.current = null;
        if (action === "submit") {
          addToDbWithTokenRef.current?.(token);
        } else if (action && "muralId" in action) {
          submitDiscoveryCaptureRef.current?.(action.muralId, token).catch(() => {
            setLearningPending(false);
          });
        }
      },
      execution: "execute" as const,
      "error-callback": (errorCode?: number) => {
        handleTurnstileError(errorCode);
        return true;
      },
    };
    let cancelled = false;
    void ensureTurnstileScript().then(() => {
      if (cancelled) return;
      const container = document.querySelector(TURNSTILE_CONTAINER_SELECTOR);
      if (container && win.turnstile?.render && !turnstileWidgetIdRef.current) {
        turnstileWidgetIdRef.current = win.turnstile.render(TURNSTILE_CONTAINER_SELECTOR, renderOptions);
      }
    });
  }, [isOpen, turnstileSiteKey, phase, handleTurnstileError]);

  const executeTurnstile = useCallback(() => {
    const w = (window as unknown as {
      turnstile?: {
        execute: (container: string, params: object) => void;
        reset?: (container: string) => void;
      };
    }).turnstile;
    if (!w?.execute) {
      setSearchError("Still loading — give it a moment and tap again.");
      setPhase("error");
      return;
    }
    try {
      w.execute(TURNSTILE_CONTAINER_SELECTOR, {});
    } catch {
      handleTurnstileError();
    }
  }, [handleTurnstileError]);

  const executeTurnstileForSubmit = useCallback(() => {
    if (!turnstileSiteKey) {
      setSearchError(
        "Something's not set up correctly on our end. Please try again later."
      );
      setPhase("error");
      return;
    }
    pendingTurnstileActionRef.current = "submit";
    executeTurnstile();
  }, [turnstileSiteKey, executeTurnstile]);

  const executeTurnstileForDiscovery = useCallback(
    (muralId: string) => {
      if (!user) {
        const blob = lastSubmittedBlobRef.current;
        const result = searchResult;
        if (blob && result) {
          savePendingMuralDraft(blob, result, muralId).catch(() => { });
        }
        onRequestAuth?.(
          "Sign in",
          "Create an account to save this mural to your collection."
        );
        return;
      }
      if (!turnstileSiteKey) {
        setSearchError(
          "Something's not set up correctly on our end. Please try again later."
        );
        setPhase("error");
        return;
      }
      pendingTurnstileActionRef.current = { muralId };
      executeTurnstile();
    },
    [user, turnstileSiteKey, searchResult, onRequestAuth, executeTurnstile]
  );

  const handleAddToDb = useCallback(() => {
    if (!lastSubmittedBlobRef.current) return;
    if (!user) {
      const blob = lastSubmittedBlobRef.current;
      const result = searchResult;
      if (result) {
        savePendingMuralDraft(blob, result).catch(() => { });
      }
      onRequestAuth?.("Sign in", "Create an account to add your murals to your account.");
      return;
    }
    setSubmitDateCaptured((d) => d || getTodayLocalDate());
    setPhase("submit-details");
  }, [user, onRequestAuth, searchResult]);

  const handleConfirmLocation = useCallback(
    (coords: [number, number]) => {
      setAddToDbPending(true);
      pendingSubmitCoordsRef.current = coords;
      executeTurnstileForSubmit();
    },
    [executeTurnstileForSubmit]
  );

  useEffect(() => {
    if (phase !== "confirmed" || confirmedAction !== "match") return;
    const muralId = pendingMuralIdRef.current;
    if (muralId) {
      const mural = murals?.find((m) => m.id === muralId);
      const lat = userCoords != null ? userCoords[1] : null;
      const lng = userCoords != null ? userCoords[0] : null;
      const distanceMeters =
        userCoords && mural
          ? haversineDistanceMeters(userCoords, mural.coordinates)
          : null;
      addCapture(
        {
          muralId,
          capturedAt: new Date().toISOString(),
          lat,
          lng,
          distanceMeters,
        },
        lastSubmittedBlobRef.current ?? undefined
      );
      if (onCaptureConfirmed) {
        onCaptureConfirmed(muralId);
        pendingMuralIdRef.current = null;
        setConfirmedAction(null);
        return;
      }
    }
    const t = setTimeout(() => {
      if (muralId) onViewOnMap?.(muralId);
      pendingMuralIdRef.current = null;
      setConfirmedAction(null);
      onClose();
    }, 1500);
    return () => clearTimeout(t);
  }, [phase, confirmedAction, murals, userCoords, addCapture, onCaptureConfirmed, onViewOnMap, onClose]);

  const match = searchResult && isMatchInDb(searchResult);
  const results = searchResult?.results ?? [];
  const matchResults = results.filter((r) => r.score >= MATCH_THRESHOLD);
  /** When we have a match, show only results at or above threshold. When no match, show no candidates. */
  const displayResults = match ? matchResults : [];
  /** When no match, show up to 5 buckets above relevance floor. */
  const overrideCandidates = !match && results.length > 0
    ? results.filter((r) => r.score >= MIN_RELEVANCE_SCORE)
    : [];
  const displayBuckets = bucketResultsByMuralId(displayResults);
  const overrideBuckets = bucketResultsByMuralId(overrideCandidates, { maxBuckets: 5 });
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
          {/* Full-screen camera (mobile capture only) */}
          {showFullScreenCapture && (
            <motion.div
              ref={fullScreenRef}
              role="dialog"
              aria-modal="true"
              aria-label="Camera — take a photo of a mural"
              className="camera-fullscreen fixed inset-0 z-50 flex flex-col bg-black safe-top-padding safe-left safe-right safe-bottom"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div
                ref={previewContainerRef}
                className="absolute inset-0 touch-none"
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
                  className="absolute inset-0 h-full w-full object-cover"
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
                  <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/95 p-6 text-center text-sm text-white">
                    {cameraError}
                  </div>
                )}
              </div>
              {/* Overlay controls */}
              <button
                type="button"
                onClick={onClose}
                className="camera-close-btn absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                aria-label="Close"
              >
                <X className="h-6 w-6" aria-hidden />
              </button>
              <label className="camera-picker-btn absolute bottom-[5.5rem] left-4 z-10 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60 focus-within:ring-2 focus-within:ring-white focus-within:ring-offset-2 focus-within:ring-offset-transparent">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="sr-only"
                  aria-label="Choose photo from device (gallery or files)"
                />
                <ImagePlus className="h-6 w-6" aria-hidden />
              </label>
              {!cameraError && (
                <>
                  <div
                    className="camera-zoom-label absolute bottom-24 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1.5 text-sm font-medium text-white/90"
                    aria-hidden
                  >
                    {zoomLevel.toFixed(1)}×
                  </div>
                  <button
                    type="button"
                    onClick={captureFromVideo}
                    className="camera-shutter-btn absolute bottom-8 left-1/2 z-10 flex h-[72px] w-[72px] -translate-x-1/2 items-center justify-center rounded-full border-4 border-white bg-transparent shadow-lg transition-transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                    aria-label="Capture photo"
                  />
                </>
              )}
            </motion.div>
          )}

          {/* Backdrop + modal (desktop all phases, mobile non-capture) */}
          {showModal && (
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
                    dragElastic: { top: 0.05, bottom: 0.4 },
                    dragControls,
                    dragListener: false,
                    onDragEnd: handleDrawerDragEnd,
                    dragTransition: { bounceStiffness: 300, bounceDamping: 30 },
                  })}
                >
                  <div
                    className="flex min-h-[44px] cursor-grab active:cursor-grabbing flex-col items-center justify-center pt-3 pb-1 touch-none md:hidden"
                    aria-hidden
                    onPointerDown={!isDesktop ? (e) => dragControls.start(e) : undefined}
                  >
                    <span className="h-[5px] w-10 shrink-0 rounded-full bg-zinc-300" aria-hidden />
                  </div>
                  <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
                    <h2
                      id="check-mural-modal-title"
                      className="text-2xl font-semibold leading-tight text-zinc-900"
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

                  <div id="check-mural-modal-desc" className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4">
                    {/* Desktop capture: inline viewfinder inside modal */}
                    {phase === "edit" && editImageUrl && (
                      <ImageEditor
                        imageUrl={editImageUrl}
                        onComplete={handleEditComplete}
                        onBack={handleEditBack}
                      />
                    )}

                    {phase === "capture" && isDesktop && (
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
                              className="absolute bottom-3 right-3 rounded-lg bg-black/50 px-2 py-1 text-sm text-white/90"
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
                              className="min-h-[44px] w-full rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-base font-semibold text-[var(--color-accent-foreground)] shadow-sm transition-colors hover:bg-[var(--color-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
                              aria-label="Capture photo"
                            >
                              Capture photo
                            </button>
                          )}
                          <label className="flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl border-2 border-[var(--color-accent)] bg-transparent px-4 py-2.5 text-base font-semibold text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)] focus-within:ring-2 focus-within:ring-[var(--color-accent)] focus-within:ring-offset-2">
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="image/*"
                              onChange={handleFileChange}
                              className="sr-only"
                              aria-label="Choose photo from device (gallery or files)"
                            />
                            Choose from device
                          </label>
                        </div>
                      </div>
                    )}

                    {turnstileSiteKey && (
                      <div
                        id={TURNSTILE_WIDGET_ID}
                        className="sr-only"
                        aria-hidden
                      />
                    )}

                    {phase === "checking" && (
                      <div
                        className="flex flex-col items-center justify-center gap-4 py-6"
                        role="status"
                        aria-live="polite"
                        aria-label="Checking your photo"
                      >
                        <p className="text-mobile-subhead font-medium text-zinc-700">Checking your photo…</p>
                        <p className="text-mobile-subhead text-zinc-500">This may take a few seconds.</p>
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
                          className="max-w-[280px] text-center text-mobile-subhead text-zinc-500"
                          aria-live="polite"
                        >
                          {PILSEN_FUN_FACTS[funFactIndex]}
                        </p>
                      </div>
                    )}

                    {phase === "result" && searchResult && (
                      <div className="flex flex-col gap-4" aria-live="polite">
                        {match ? (
                          <p className="text-mobile-body text-zinc-600">
                            Looks like we might have this one. Tap the match below, or choose &quot;None of these&quot; if it&apos;s not here.
                          </p>
                        ) : (
                          <p className="text-mobile-body text-zinc-600">
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
                            {displayBuckets.length > 0 && (
                              <button
                                type="button"
                                onClick={handleCheckAnother}
                                className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border-2 border-zinc-300 bg-white px-4 py-2.5 text-base font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
                                aria-label="Retake photo"
                              >
                                <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
                                Retake photo
                              </button>
                            )}
                          </div>
                        )}
                        {previewUrl && displayBuckets.length > 0 && (
                          <div
                            className="h-px w-full bg-zinc-200"
                            role="presentation"
                            aria-hidden
                          />
                        )}
                        {displayResults.length === 0 && (
                          <div className="flex flex-col gap-3 pt-2">
                            <div className="flex min-h-[44px] w-full flex-row items-stretch gap-3">
                              <button
                                type="button"
                                onClick={handleCheckAnother}
                                className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-zinc-300 bg-white px-4 py-2.5 text-base font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
                                aria-label="Retake photo"
                              >
                                <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
                                Retake photo
                              </button>
                              <button
                                type="button"
                                onClick={handleAddToDb}
                                disabled={addToDbPending || !turnstileSiteKey}
                                className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-green-600 bg-green-600 px-4 py-2.5 text-base font-semibold text-white transition-colors hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label={addToDbPending ? "Preparing…" : "Confirm photo and choose location on map"}
                                title={!turnstileSiteKey ? "Captcha not configured" : undefined}
                              >
                                {addToDbPending ? (
                                  <>
                                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                                    Preparing…
                                  </>
                                ) : (
                                  <>
                                    <CircleCheck className="h-4 w-4 shrink-0" aria-hidden />
                                    Confirm photo
                                  </>
                                )}
                              </button>
                            </div>
                            {overrideBuckets.length > 0 && (
                              <>
                                <div className="h-px w-full bg-zinc-200" aria-hidden />
                                <p className="text-mobile-subhead text-zinc-600">
                                  Think it&apos;s in our collection? Pick the mural below.
                                </p>
                                <p className="text-mobile-subhead text-zinc-500">
                                  Lighting and angle can affect matching. If you took this at the mural, pick it below.
                                  {userCoords && " Results are ordered by similarity and distance from you."}
                                </p>
                                <ResultBucketGrid
                                  variant="override"
                                  buckets={overrideBuckets}
                                  thumbSrc={thumbSrc}
                                  selectedResult={selectedResult}
                                  onSelect={(r) => {
                                    setSelectedResult(r);
                                    setExpandedStackId(null);
                                  }}
                                  expandedStackId={expandedStackId}
                                  onExpandStack={setExpandedStackId}
                                  gridClass={`grid max-h-[min(50vh,340px)] gap-3 overflow-y-auto justify-items-center ${overrideBuckets.length === 1 ? "grid-cols-1" : overrideBuckets.length <= 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3"}`}
                                  listAriaLabel="Possible matches to confirm"
                                  selectLabel="Select"
                                  confirmLabel="Confirm"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (selectedResult && selectedResult !== "none") {
                                      haptics.success();
                                      setLearningPending(true);
                                      executeTurnstileForDiscovery(selectedResult.id);
                                    }
                                  }}
                                  disabled={!selectedResult || selectedResult === "none" || learningPending}
                                  className="min-h-[44px] w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-amber-600 bg-amber-600 px-4 py-2.5 text-base font-semibold text-white transition-colors hover:bg-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                  aria-label={learningPending ? "Confirming…" : "Or, confirm selected mural is in the database"}
                                >
                                  {learningPending ? (
                                    <>
                                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                                      Confirming…
                                    </>
                                  ) : (
                                    "Or, confirm it&apos;s in database"
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                        )}
                        {displayBuckets.length > 0 && (
                          <>
                            <ResultBucketGrid
                              variant="match"
                              buckets={displayBuckets}
                              thumbSrc={thumbSrc}
                              selectedResult={selectedResult}
                              onSelect={(r) => {
                                setSelectedResult(r);
                                setExpandedStackId(null);
                              }}
                              expandedStackId={expandedStackId}
                              onExpandStack={setExpandedStackId}
                              gridClass={`grid max-h-[min(55vh,360px)] gap-3 overflow-y-auto justify-items-center ${displayBuckets.length === 1 ? "grid-cols-1" : displayBuckets.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}
                              listAriaLabel="Search results"
                              selectLabel="Select"
                              confirmLabel="Add to collection"
                            />
                            <div className="flex min-h-[44px] w-full flex-row items-stretch gap-3">
                              <button
                                type="button"
                                onClick={() => {
                                  haptics.error();
                                  setSelectedResult("none");
                                }}
                                className={`flex flex-1 items-center justify-center rounded-xl border-2 p-2 text-center text-base font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 ${selectedResult === "none"
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
                                    setLearningPending(true);
                                    executeTurnstileForDiscovery(selectedResult.id);
                                  }
                                }}
                                disabled={selectedResult === null || (selectedResult === "none" && addToDbPending) || (selectedResult !== "none" && selectedResult !== null && learningPending)}
                                className="flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-green-600 bg-green-600 px-4 py-2.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {selectedResult === "none" && addToDbPending ? (
                                  <>
                                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                                    Preparing…
                                  </>
                                ) : selectedResult !== "none" && selectedResult !== null && learningPending ? (
                                  <>
                                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                                    Adding…
                                  </>
                                ) : (
                                  "Add to collection"
                                )}
                              </button>
                            </div>
                          </>
                        )}
                        <div className="-mt-2 -mb-1 flex justify-center">
                          <button
                            type="button"
                            onClick={handleCheckAnother}
                            className="rounded px-2 py-1 text-sm font-medium text-[var(--color-accent)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
                            aria-label="Check another mural"
                          >
                            Check another
                          </button>
                        </div>
                      </div>
                    )}

                    {phase === "submit-details" && (
                      <div className="flex flex-col gap-4">
                        <p className="text-mobile-body text-zinc-600">
                          Add a few details, then pick the mural location on the map.
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label htmlFor="submit-mural-title" className="sr-only">
                              Mural name (optional)
                            </label>
                            <input
                              id="submit-mural-title"
                              type="text"
                              value={submitTitle}
                              onChange={(e) => setSubmitTitle(e.target.value)}
                              placeholder="e.g., La Cultura Cura"
                              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-mobile-body text-zinc-900 placeholder:text-zinc-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                              aria-label="Mural name (optional)"
                            />
                          </div>
                          <div>
                            <label htmlFor="submit-mural-artist" className="sr-only">
                              Artist (optional)
                            </label>
                            <ArtistCombobox
                              id="submit-mural-artist"
                              value={submitArtistValue}
                              onChange={setSubmitArtistValue}
                              placeholder="e.g., Hector Duarte"
                              isLight
                              aria-label="Artist (optional)"
                              className="rounded-xl"
                            />
                          </div>
                        </div>
                        <div>
                          <label htmlFor="submit-date-captured" className="block text-mobile-subhead font-medium text-zinc-700 mb-1">
                            Date photo taken
                          </label>
                          <input
                            id="submit-date-captured"
                            type="date"
                            value={submitDateCaptured || getTodayLocalDate()}
                            onChange={(e) => setSubmitDateCaptured(e.target.value)}
                            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-mobile-body text-zinc-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                            aria-label="Date photo was taken"
                          />
                        </div>
                        <div>
                          <label htmlFor="submit-date-painted" className="block text-mobile-subhead font-medium text-zinc-700 mb-1">
                            Mural date (optional)
                          </label>
                          <input
                            id="submit-date-painted"
                            type="date"
                            value={submitDatePainted}
                            onChange={(e) => setSubmitDatePainted(e.target.value)}
                            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-mobile-body text-zinc-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                            aria-label="When the mural was painted (optional)"
                          />
                        </div>
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => setPhase("result")}
                            className="min-h-[44px] flex-1 rounded-xl border-2 border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
                            aria-label="Back to results"
                          >
                            Back
                          </button>
                          <button
                            type="button"
                            onClick={() => setPhase("confirm-location")}
                            className="min-h-[44px] flex-1 rounded-xl border-2 border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--color-accent-foreground)] transition-colors hover:bg-[var(--color-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
                            aria-label="Next: choose location on map"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}

                    {phase === "confirm-location" && (
                      <div className="flex flex-col gap-4">
                        <LocationConfirm
                          initialCenter={userCoords ?? PILSEN_CENTER}
                          photoPreviewUrl={previewUrl}
                          isSubmitting={addToDbPending}
                          onConfirm={handleConfirmLocation}
                          onBack={() => setPhase("submit-details")}
                        />
                      </div>
                    )}

                    {phase === "confirmed" && confirmedAction && (
                      <div
                        className="flex flex-col items-center justify-center gap-4 py-6"
                        role="status"
                        aria-live="polite"
                        aria-label={
                          confirmedAction === "match"
                            ? "Match confirmed. Showing on map."
                            : "Photo added to the database."
                        }
                      >
                        <CircleCheck
                          className="h-16 w-16 shrink-0 text-green-600"
                          aria-hidden
                        />
                        <p className="text-center text-mobile-body font-medium text-zinc-700">
                          {confirmedAction === "match"
                            ? "Match confirmed! Showing on map…"
                            : "Photo added to the database!"}
                        </p>
                        {confirmedAction !== "match" && (
                          <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
                            {onMuralAdded ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const mural = addedMuralRef.current;
                                  if (mural) onMuralAdded(mural);
                                  onClose();
                                }}
                                className="min-h-[44px] w-full rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-base font-semibold text-[var(--color-accent-foreground)] shadow-sm transition-colors hover:bg-[var(--color-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
                                aria-label="View on map"
                              >
                                View on map
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={onClose}
                                className="min-h-[44px] w-full rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-base font-semibold text-[var(--color-accent-foreground)] shadow-sm transition-colors hover:bg-[var(--color-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
                                aria-label="Done"
                              >
                                Done
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={handleCheckAnother}
                              className="min-h-[44px] w-full rounded-xl border-2 border-zinc-300 bg-white px-4 py-2.5 text-base font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
                              aria-label="Check another mural"
                            >
                              Check another mural
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {phase === "error" && (
                      <div className="flex flex-col gap-4" aria-live="polite">
                        <div className="flex flex-col items-center gap-2 text-center">
                          <AlertCircle
                            className="h-10 w-10 shrink-0 text-red-600"
                            aria-hidden
                          />
                          <p className="text-mobile-subhead font-semibold text-red-800">
                            Something didn&apos;t work
                          </p>
                          <p className="text-mobile-subhead font-medium text-red-700">
                            {searchError}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleCheckAnother}
                            className="min-h-[44px] flex-1 rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-base font-semibold text-[var(--color-accent-foreground)] shadow-sm transition-colors hover:bg-[var(--color-accent-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
                          >
                            Try again
                          </button>
                          <button
                            type="button"
                            onClick={onClose}
                            className="min-h-[44px] flex-1 rounded-xl border border-zinc-300 bg-zinc-100 px-4 py-2.5 text-base font-semibold text-zinc-700 transition-colors hover:bg-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
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
        </>
      )}
    </AnimatePresence>
  );
}

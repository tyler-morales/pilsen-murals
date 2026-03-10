"use client";

import { useState, useEffect, useRef } from "react";
import type { Mural } from "@/types/mural";
import {
  REVEAL_DURATION_MS,
  DIM_LIFT_DURATION_MS,
  getEntranceTransform,
  getLiftTransform,
} from "@/lib/markerAnimation";

const ZOOM_MIN = 11;
const ZOOM_MAX = 18;
const HEIGHT_AT_ZOOM_MIN = 28;
const HEIGHT_AT_ZOOM_MAX = 88;

/** Mural IDs that have already played their entrance animation this session. Prevents re-fade on map pan/zoom. */
const revealedMuralIds = new Set<string>();

/** For tests: reset session reveal cache so delay/visibility can be re-tested. */
export function resetRevealedMurals(): void {
  revealedMuralIds.clear();
}

function parsePx(value: string | undefined): number | null {
  if (!value) return null;
  const n = parseInt(value.replace(/px$/i, ""), 10);
  return Number.isNaN(n) ? null : n;
}

function getThumbnailAspectRatio(mural: Mural): number {
  const w = parsePx(mural.imageMetadata?.Width);
  const h = parsePx(mural.imageMetadata?.Height);
  if (w != null && h != null && h > 0) return w / h;
  return 4 / 3;
}

/** Thumbnail height in px from map zoom so markers stay small when zoomed out. */
export function thumbnailHeightFromZoom(zoom: number): number {
  const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
  const t = (z - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN);
  return Math.round(HEIGHT_AT_ZOOM_MIN + t * (HEIGHT_AT_ZOOM_MAX - HEIGHT_AT_ZOOM_MIN));
}

/** Deterministic offset from mural id so cards have a slight tilt and nudge (no layout shift on re-render). */
export function getStableCardOffset(muralId: string): {
  rotationDeg: number;
  translateX: number;
  translateY: number;
} {
  let h = 0;
  for (let i = 0; i < muralId.length; i++) h = (h * 31 + muralId.charCodeAt(i)) | 0;
  const t = Math.abs(h);
  const rotationDeg = ((t % 15) / 14) * 14 - 7;
  const translateX = ((t >> 4) % 9) - 4;
  const translateY = ((t >> 8) % 9) - 4;
  return { rotationDeg, translateX, translateY };
}

interface MuralMarkerProps {
  mural: Mural;
  zoom: number;
  onClick: (mural: Mural) => void;
  /** Staggered reveal: delay in ms before playing entrance. Omit or 0 = show immediately. */
  revealDelay?: number;
  /** When true, reveal immediately with no animation (a11y). */
  prefersReducedMotion?: boolean;
  /** When set, show tour stop number badge (1-based). */
  tourIndex?: number;
  /** When set in tour mode, show Start or End flag for route clarity. */
  tourRole?: "start" | "end";
  /** When true, user is within geofence of this mural; show distinct border and "You're near" title. */
  isNearby?: boolean;
  /** When true, hide the pin (e.g. when using a shared pin). */
  hidePin?: boolean;
  /** When true, lower opacity (e.g. when another card in the fan is hovered). */
  isDimmed?: boolean;
  /** When true, lift the card visually (e.g. when this card is hovered/focused in a fan). */
  isLifted?: boolean;
  /** Called when the card button receives focus (for hover sync). */
  onFocus?: () => void;
  /** Called when the card button loses focus (for hover sync). */
  onBlur?: () => void;
  /** Called when pointer enters the marker (map-wide hover). */
  onPointerEnter?: () => void;
  /** Called when pointer leaves the marker (map-wide hover). */
  onPointerLeave?: () => void;
}

export function MuralMarker({
  mural,
  zoom,
  onClick,
  revealDelay = 0,
  prefersReducedMotion = false,
  tourIndex,
  tourRole,
  isNearby = false,
  hidePin = false,
  isDimmed = false,
  isLifted = false,
  onFocus,
  onBlur,
  onPointerEnter,
  onPointerLeave,
}: MuralMarkerProps) {
  const hasRevealedRef = useRef(false);
  const skipAnimation =
    prefersReducedMotion || revealDelay === undefined || revealDelay === 0;
  const alreadyRevealed = revealedMuralIds.has(mural.id);
  const [visible, setVisible] = useState(skipAnimation || alreadyRevealed);

  useEffect(() => {
    if (skipAnimation || alreadyRevealed || hasRevealedRef.current) return;
    const id = setTimeout(() => {
      hasRevealedRef.current = true;
      revealedMuralIds.add(mural.id);
      setVisible(true);
    }, revealDelay);
    return () => clearTimeout(id);
  }, [revealDelay, skipAnimation, alreadyRevealed, mural.id]);

  const heightPx = thumbnailHeightFromZoom(zoom);
  const widthMin = Math.round(48 * (heightPx / HEIGHT_AT_ZOOM_MAX));
  const widthMax = Math.round(160 * (heightPx / HEIGHT_AT_ZOOM_MAX));
  const aspectRatio = getThumbnailAspectRatio(mural);
  const widthPx = Math.min(
    widthMax,
    Math.max(widthMin, Math.round(heightPx * aspectRatio))
  );
  const thumbSrc = mural.thumbnail ?? mural.imageUrl;

  const minTouch = 44;
  const touchHeight = Math.max(minTouch, heightPx);
  const touchWidth = Math.max(minTouch, widthPx);
  const offset = getStableCardOffset(mural.id);

  const opacity = visible ? (isDimmed ? 0.55 : 1) : 0;
  const liftTransform = getLiftTransform(isLifted, prefersReducedMotion);

  return (
    <span
      className="relative inline-flex flex-col items-center ease-out"
      style={{
        opacity,
        transform: getEntranceTransform(offset, visible),
        transition: `opacity ${DIM_LIFT_DURATION_MS}ms ease-out, transform ${REVEAL_DURATION_MS}ms ease-out`,
      }}
      aria-hidden
    >
      {isNearby && (
        <span
          className="absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border-2 border-amber-500 bg-amber-500 px-2 py-0.5 text-xs font-semibold text-amber-950 shadow-md"
          style={{ marginTop: "-4px" }}
          aria-hidden
        >
          You&apos;re near
        </span>
      )}
      {tourRole != null && (
        <span
          className={`absolute left-1/2 top-0 z-30 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded px-2 py-0.5 text-xs font-bold shadow-md ${tourRole === "start" ? "bg-emerald-500 text-white" : "bg-rose-600 text-white"}`}
          style={{ marginTop: "-4px" }}
          aria-hidden
        >
          {tourRole === "start" ? "Start" : "End"}
        </span>
      )}
      <span
        className="block transition-[transform,box-shadow] duration-[180ms] ease-out"
        style={{
          transform: liftTransform,
          boxShadow:
            isLifted && !prefersReducedMotion
              ? "0 8px 24px -4px rgba(0,0,0,0.25)"
              : undefined,
        }}
        aria-hidden
      >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick(mural);
        }}
        onFocus={onFocus}
        onBlur={onBlur}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        className="mural-marker group relative flex items-center justify-center overflow-visible focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 ring-offset-dynamic-surface"
        style={{
          minHeight: minTouch,
          minWidth: minTouch,
          height: touchHeight,
          width: touchWidth,
          boxShadow: `0 0 20px 4px ${mural.dominantColor}40, 0 0 40px 8px ${mural.dominantColor}20`,
        }}
        aria-label={
          isNearby
            ? `You're near this mural. View: ${mural.title} by ${mural.artist}`
            : tourRole === "start"
              ? `Start: Stop ${tourIndex ?? 1}, ${mural.title} by ${mural.artist}`
              : tourRole === "end"
                ? `End: Stop ${tourIndex ?? ""}, ${mural.title} by ${mural.artist}`
                : tourIndex != null
                  ? `Stop ${tourIndex}: View mural ${mural.title} by ${mural.artist}`
                  : `View mural: ${mural.title} by ${mural.artist}`
        }
      >
        <span
          className={`relative flex overflow-hidden bg-dynamic shadow-md transition-transform group-hover:scale-105 group-focus-visible:scale-105 ${isNearby ? "border-[3px] border-amber-500 ring-2 ring-amber-400/80" : "border-4 border-white"
            }`}
          style={{ height: heightPx, width: widthPx }}
        >
          <span
            className="absolute inset-0 opacity-50 transition-opacity group-hover:animate-glow-pulse group-focus-visible:animate-glow-pulse"
            style={{
              boxShadow: `inset 0 0 24px 6px ${mural.dominantColor}30`,
            }}
            aria-hidden
          />
          <img
            src={thumbSrc}
            srcSet={`${mural.thumbnail ?? mural.imageUrl} 400w, ${mural.imageUrl} 1600w`}
            sizes={`${widthPx}px`}
            alt=""
            className="relative z-10 h-full w-full object-cover"
            width={widthPx}
            height={heightPx}
            loading="lazy"
            decoding="async"
          />
          {tourIndex != null && (
            <span
              className="absolute bottom-0.5 right-0.5 z-20 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-amber-500 text-xs font-semibold text-white shadow-md"
              aria-hidden
            >
              {tourIndex}
            </span>
          )}
        </span>
      </button>
      </span>
      {!hidePin && (
        <span
          className="pointer-events-none flex flex-col items-center"
          aria-hidden
        >
          <span
            className="h-3 w-1 shrink-0 bg-white/90 shadow-[0_1px_2px_rgba(0,0,0,0.2)]"
            style={{ minHeight: 10 }}
          />
          <span
            className="h-2 w-2 -translate-y-px rounded-full border border-white/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)]"
            aria-hidden
          />
        </span>
      )}
    </span>
  );
}

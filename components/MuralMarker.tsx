"use client";

import { useState, useEffect, useRef } from "react";
import type { Mural } from "@/types/mural";

const ZOOM_MIN = 11;
const ZOOM_MAX = 18;
const HEIGHT_AT_ZOOM_MIN = 28;
const HEIGHT_AT_ZOOM_MAX = 88;

const REVEAL_DURATION_MS = 220;

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
}

export function MuralMarker({
  mural,
  zoom,
  onClick,
  revealDelay = 0,
  prefersReducedMotion = false,
  tourIndex,
  tourRole,
}: MuralMarkerProps) {
  const hasRevealedRef = useRef(false);
  const skipAnimation =
    prefersReducedMotion || revealDelay === undefined || revealDelay === 0;
  const [visible, setVisible] = useState(skipAnimation);

  useEffect(() => {
    if (skipAnimation || hasRevealedRef.current) return;
    const id = setTimeout(() => {
      hasRevealedRef.current = true;
      setVisible(true);
    }, revealDelay);
    return () => clearTimeout(id);
  }, [revealDelay, skipAnimation]);

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

  return (
    <span
      className="relative inline-block ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "scale(1)" : "scale(0.92)",
        transition: `opacity ${REVEAL_DURATION_MS}ms ease-out, transform ${REVEAL_DURATION_MS}ms ease-out`,
      }}
      aria-hidden
    >
      {tourRole != null && (
        <span
          className={`absolute left-1/2 top-0 z-30 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded px-2 py-0.5 text-xs font-bold shadow-md ${tourRole === "start" ? "bg-emerald-500 text-white" : "bg-rose-600 text-white"}`}
          style={{ marginTop: "-4px" }}
          aria-hidden
        >
          {tourRole === "start" ? "Start" : "End"}
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick(mural);
        }}
        className="mural-marker group relative flex items-center justify-center overflow-visible focus:outline-none focus:ring-2 focus:ring-white/80 focus:ring-offset-2 ring-offset-dynamic-surface"
        style={{
          minHeight: minTouch,
          minWidth: minTouch,
          height: touchHeight,
          width: touchWidth,
          boxShadow: `0 0 20px 4px ${mural.dominantColor}40, 0 0 40px 8px ${mural.dominantColor}20`,
        }}
        aria-label={
          tourRole === "start"
            ? `Start: Stop ${tourIndex ?? 1}, ${mural.title} by ${mural.artist}`
            : tourRole === "end"
              ? `End: Stop ${tourIndex ?? ""}, ${mural.title} by ${mural.artist}`
              : tourIndex != null
                ? `Stop ${tourIndex}: View mural ${mural.title} by ${mural.artist}`
                : `View mural: ${mural.title} by ${mural.artist}`
        }
      >
        <span
          className="relative flex overflow-hidden border-4 border-white bg-dynamic shadow-md transition-transform group-hover:scale-105 group-focus-visible:scale-105"
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
  );
}

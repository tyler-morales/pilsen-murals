"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, List, Map, Route } from "lucide-react";
import { useThemeStore } from "@/store/themeStore";
import { useMuralStore } from "@/store/muralStore";
import type { Mural } from "@/types/mural";
import type { Collection } from "@/types/collection";

const SUN_ANIMATION_DURATION_MS = 1200;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Sun along an arc: semicircle = sun path (east → noon → west).
 * Azimuth 90° = West (right), 270° = East (left). Angle 0 = right, 180° = left.
 */
function sunPositionOnArc(azimuthDeg: number, cx: number, cy: number, r: number) {
  const angleDeg = 90 - azimuthDeg;
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

/** Icon: sun path arc with a single sun symbol moving along it (no slider look). */
function SunInSkyIcon({
  sunAltitudeDeg,
  sunAzimuthDeg,
  isAnimating,
  className,
}: {
  sunAltitudeDeg: number;
  sunAzimuthDeg: number;
  isAnimating?: boolean;
  className?: string;
}) {
  const isBelowHorizon = sunAltitudeDeg < -4;
  const size = 30;
  const pad = 4;
  const cx = size / 2;
  const cy = size - 5;
  const r = size - 8;
  const { x: sx, y: sy } = sunPositionOnArc(sunAzimuthDeg, cx, cy, r);
  const sunR = 3.2;

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`${-pad} ${-pad} ${size + 2 * pad} ${size + 2 * pad}`}
      overflow="visible"
      aria-hidden
      role="img"
    >
      <title>Sun position in sky</title>
      {/* Arc: sun path from east (left) to west (right) — reads as sky path, not a track */}
      <path
        d={`M 2 ${cy} A ${r} ${r} 0 0 1 ${size - 2} ${cy}`}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.2}
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      {/* Sun: filled circle + 8 short rays; burst (color + scale) when isAnimating */}
      <g
        className={isAnimating ? "sun-icon-burst-group" : undefined}
        opacity={isBelowHorizon ? 0.4 : 1}
      >
        <circle cx={sx} cy={sy} r={sunR} fill="currentColor" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
          const a = (deg * Math.PI) / 180;
          const r1 = sunR + 1;
          const r2 = sunR + 2.8;
          return (
            <line
              key={deg}
              x1={sx + r1 * Math.cos(a)}
              y1={sy - r1 * Math.sin(a)}
              x2={sx + r2 * Math.cos(a)}
              y2={sy - r2 * Math.sin(a)}
              stroke="currentColor"
              strokeWidth={0.9}
              strokeLinecap="round"
            />
          );
        })}
      </g>
    </svg>
  );
}

type TabId = "map" | "browse" | "tours";

interface MapHeaderProps {
  murals: Mural[];
  onMapClick?: () => void;
  onBrowseClick?: () => void;
  isListOpen?: boolean;
  /** When set, header shows "Leave tour" and optional tour name. */
  activeTour?: Collection | null;
  onToursClick?: () => void;
  onLeaveTour?: () => void;
  isTourListOpen?: boolean;
  /** Opens the "Check a mural" modal (camera/upload + search). */
  onCheckMuralClick?: () => void;
}

export function MapHeader({
  murals,
  onMapClick,
  onBrowseClick,
  isListOpen = false,
  activeTour = null,
  onToursClick,
  onLeaveTour,
  isTourListOpen = false,
  onCheckMuralClick,
}: MapHeaderProps) {
  const mapLightPreset = useThemeStore((s) => s.mapLightPreset);
  const sunAltitudeDeg = useThemeStore((s) => s.sunAltitudeDeg);
  const sunAzimuthDeg = useThemeStore((s) => s.sunAzimuthDeg);
  const presetLabel =
    { dawn: "Dawn", day: "Day", dusk: "Dusk", night: "Night" }[mapLightPreset] ?? mapLightPreset;
  const requestFlyTo = useMuralStore((s) => s.requestFlyTo);
  const activeMural = useMuralStore((s) => s.activeMural);

  const [animationAzimuth, setAnimationAzimuth] = useState<number | null>(null);
  const [burstOnly, setBurstOnly] = useState(false);
  const animRef = useRef<number | null>(null);
  const burstTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeTab: TabId =
    isListOpen ? "browse" : activeTour || isTourListOpen ? "tours" : "map";
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState({ left: 0, width: 0 });
  const measurePill = useCallback(() => {
    const idx = activeTab === "map" ? 0 : activeTab === "browse" ? 1 : 2;
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

  const isSunAboveHorizon = sunAltitudeDeg >= 0;

  const handleSunIconClick = useCallback(() => {
    if (animationAzimuth !== null || burstOnly) return;

    if (!isSunAboveHorizon) {
      setBurstOnly(true);
      if (burstTimeoutRef.current) clearTimeout(burstTimeoutRef.current);
      burstTimeoutRef.current = setTimeout(() => {
        burstTimeoutRef.current = null;
        setBurstOnly(false);
      }, 500);
      return;
    }

    const startAzimuth = sunAzimuthDeg;
    const start = performance.now();
    const run = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / SUN_ANIMATION_DURATION_MS, 1);
      const eased = easeInOutCubic(t);
      setAnimationAzimuth(startAzimuth + 360 * eased);
      if (t < 1) {
        animRef.current = requestAnimationFrame(run);
      } else {
        animRef.current = null;
        setAnimationAzimuth(null);
      }
    };
    animRef.current = requestAnimationFrame(run);
  }, [sunAzimuthDeg, animationAzimuth, burstOnly, isSunAboveHorizon]);

  useEffect(() => () => {
    if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    if (burstTimeoutRef.current) clearTimeout(burstTimeoutRef.current);
  }, []);

  const handleSurpriseMe = () => {
    if (murals.length === 0) return;
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
      className="safe-top absolute left-2 right-2 top-2 z-30 flex min-w-0 flex-col gap-2 overflow-visible rounded-2xl border border-white/20 bg-white/85 px-3 pb-3 pt-2 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.08)] backdrop-blur-xl sm:left-4 sm:right-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-0 sm:rounded-2xl sm:px-4 sm:pb-2 sm:pt-2 md:right-auto md:max-w-4xl md:border-white/30 md:shadow-lg"
      aria-label="Map header"
    >
      <div className="flex min-w-0 shrink items-center justify-between gap-2 sm:flex-1 sm:justify-start">
        <div className="flex min-w-0 shrink flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
          <div className="flex min-w-0 items-baseline gap-2">
            {activeTour ? (
              <h1 className="min-w-0 break-words text-base font-semibold tracking-tight text-zinc-900 sm:text-lg">
                {activeTour.name}
              </h1>
            ) : (
              <h1 className="min-w-0 break-words text-base font-semibold tracking-tight text-zinc-900 sm:text-lg">
                <button
                  type="button"
                  onClick={handleSurpriseMe}
                  disabled={murals.length === 0}
                  className="cursor-pointer text-left text-base font-semibold tracking-tight text-zinc-900 transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-50 sm:text-lg"
                  aria-label="The Pilsen Mural Project — click to show a random mural"
                >
                  The Pilsen Mural Project
                </button>
              </h1>
            )}
            <span className="shrink-0 text-xs text-zinc-500 sm:text-sm sm:text-zinc-600" aria-label="Number of murals">
              {murals.length} mural{murals.length !== 1 ? "s" : ""}
            </span>
          </div>
          {activeTour && murals.length > 0 && (
            <span
              className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-amber-800 sm:text-sm"
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
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={handleSunIconClick}
            className={`flex shrink-0 cursor-pointer items-center overflow-visible rounded-full p-1.5 text-zinc-600 transition-opacity hover:bg-white/60 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${animationAzimuth !== null || burstOnly ? "sun-icon-burst" : ""}`}
            aria-label={`Sun position in the sky. ${presetLabel}.`}
            title="Sun position in the sky"
          >
            <SunInSkyIcon
              sunAltitudeDeg={sunAltitudeDeg}
              sunAzimuthDeg={animationAzimuth ?? sunAzimuthDeg}
              isAnimating={animationAzimuth !== null || burstOnly}
              className="shrink-0"
            />
          </button>
        </div>
      </div>

      {/* Tabs: Map | Browse | Tours — sliding fill indicates active */}
      <div className="flex w-full min-w-0 flex-1 items-center gap-2 sm:w-auto sm:flex-wrap">
        <div
          ref={containerRef}
          className="relative flex min-h-[44px] min-w-0 flex-1 flex-row overflow-hidden rounded-xl bg-zinc-100/90 p-1 sm:min-w-[200px] sm:flex-initial"
          role="tablist"
          aria-label="Main navigation"
        >
          {/* Sliding pill — animates to active tab */}
          <div
            className="pointer-events-none absolute top-1 bottom-1 rounded-lg bg-[var(--color-accent)] shadow-sm transition-[left,width] duration-200 ease-out"
            style={{ left: pill.left + 4, width: pill.width - 8 }}
            aria-hidden
          />
          {onMapClick && (
            <button
              ref={(el) => { tabRefs.current[0] = el; }}
              type="button"
              role="tab"
              aria-selected={activeTab === "map"}
              aria-label="Map view"
              onClick={onMapClick}
              className={`relative z-10 flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-100 disabled:pointer-events-none sm:flex-initial sm:px-4 ${activeTab === "map" ? "text-[var(--color-accent-foreground)]" : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"}`}
            >
              <Map className="h-4 w-4 shrink-0" aria-hidden />
              <span>Map</span>
            </button>
          )}
          {onBrowseClick && (
            <button
              ref={(el) => { tabRefs.current[1] = el; }}
              type="button"
              role="tab"
              aria-selected={activeTab === "browse"}
              aria-expanded={isListOpen}
              aria-label="Browse all murals"
              onClick={onBrowseClick}
              className={`relative z-10 flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-100 disabled:pointer-events-none sm:flex-initial sm:px-4 ${activeTab === "browse" ? "text-[var(--color-accent-foreground)]" : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"}`}
            >
              <List className="h-4 w-4 shrink-0" aria-hidden />
              <span>Browse</span>
            </button>
          )}
          {activeTour && onLeaveTour ? (
            <button
              ref={(el) => { tabRefs.current[2] = el; }}
              type="button"
              role="tab"
              aria-selected={activeTab === "tours"}
              aria-label="Leave tour and show all murals"
              onClick={onLeaveTour}
              className={`relative z-10 flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-100 sm:flex-initial sm:px-4 ${activeTab === "tours" ? "text-[var(--color-accent-foreground)]" : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"}`}
            >
              <Route className="h-4 w-4 shrink-0" aria-hidden />
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
              onClick={onToursClick}
              className={`relative z-10 flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-100 sm:flex-initial sm:px-4 ${activeTab === "tours" ? "text-[var(--color-accent-foreground)]" : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"}`}
            >
              <Route className="h-4 w-4 shrink-0" aria-hidden />
              <span>Tours</span>
            </button>
          ) : null}
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

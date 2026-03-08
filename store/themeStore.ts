import { create } from "zustand";
import { getPilsenSunState } from "@/lib/sunPilsen";

/**
 * Theme store: sun position, map light preset, and Pilsen time string.
 * Updated every 60s by ThemeByPilsenTime. Subscribers are invoked on each tick—
 * keep work minimal (e.g. no layout thrash, no heavy DOM) to avoid jank.
 */
const SUN_BRIGHTNESS_VAR = "--sun-brightness";
const SUN_ALTITUDE_VAR = "--sun-altitude-deg";
const PILSEN_TIMEZONE = "America/Chicago";

function setLightingCSSVariables(brightness: number, sunAltitudeDeg: number): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty(SUN_BRIGHTNESS_VAR, String(brightness));
  root.style.setProperty(SUN_ALTITUDE_VAR, String(sunAltitudeDeg));
}

/** Format a date as Pilsen (America/Chicago) time for display. */
export function formatPilsenTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PILSEN_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/** Mapbox Standard lightPreset: day | night | dawn | dusk */
export type MapLightPreset = "day" | "night" | "dawn" | "dusk";

interface ThemeState {
  sunAltitudeDeg: number;
  sunAzimuthDeg: number;
  brightness: number;
  /** Resolved for Mapbox Standard style; derived from sun position. */
  mapLightPreset: MapLightPreset;
  /** Pilsen time string; updated every 60s with theme tick. */
  pilsenTimeString: string;
  updateFromPilsenTime: () => void;
}

function sunToMapLightPreset(sunAltitudeDeg: number, sunAzimuthDeg: number): MapLightPreset {
  if (sunAltitudeDeg < -6) return "night";
  if (sunAltitudeDeg >= 10) return "day";
  return sunAzimuthDeg < 180 ? "dawn" : "dusk";
}

export const useThemeStore = create<ThemeState>((set) => ({
  sunAltitudeDeg: 0,
  sunAzimuthDeg: 0,
  brightness: 0.5,
  mapLightPreset: "day",
  pilsenTimeString: "",

  updateFromPilsenTime: () => {
    const now = new Date();
    const { sunAltitudeDeg, brightness, sunAzimuthDeg } = getPilsenSunState(now);
    setLightingCSSVariables(brightness, sunAltitudeDeg);
    const mapLightPreset = sunToMapLightPreset(sunAltitudeDeg, sunAzimuthDeg);
    set({
      sunAltitudeDeg,
      sunAzimuthDeg,
      brightness,
      mapLightPreset,
      pilsenTimeString: formatPilsenTime(now),
    });
  },
}));

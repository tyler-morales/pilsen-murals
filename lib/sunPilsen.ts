/**
 * Sun position and brightness for Pilsen, Chicago.
 * Used to drive dynamic lighting that updates every minute.
 */

// @ts-expect-error no types; getPosition(date, lat, lng) -> { altitude, azimuth } in radians
import SunCalc from "suncalc";

const PILSEN_LAT = 41.852;
const PILSEN_LNG = -87.657;

/** Sun altitude in degrees (-90 to 90). Negative = below horizon. */
function altitudeDegrees(altitudeRad: number): number {
  return (altitudeRad * 180) / Math.PI;
}

/**
 * Maps sun altitude (degrees) to a 0–1 brightness factor.
 * Altitude < 0 → 0 (night). 0–90° → smooth curve (dawn/dusk dimmer than noon).
 */
export function altitudeToBrightness(altitudeDeg: number): number {
  if (altitudeDeg < 0) return 0;
  // 0° ≈ 0.12, 90° = 1; linear in between
  return Math.min(1, (altitudeDeg + 12) / 102);
}

export interface PilsenSunState {
  sunAltitudeDeg: number;
  brightness: number;
  sunAzimuthDeg: number;
}

/**
 * Returns current sun position and derived brightness for Pilsen.
 * Uses the given date (typically now); timezone is irrelevant for the calculation.
 */
export function getPilsenSunState(date: Date = new Date()): PilsenSunState {
  const pos = SunCalc.getPosition(date, PILSEN_LAT, PILSEN_LNG);
  const sunAltitudeDeg = altitudeDegrees(pos.altitude);
  const sunAzimuthDeg = (pos.azimuth * 180) / Math.PI;
  const brightness = altitudeToBrightness(sunAltitudeDeg);
  return { sunAltitudeDeg, brightness, sunAzimuthDeg };
}

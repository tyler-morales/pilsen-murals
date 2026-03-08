"use client";

import { useEffect } from "react";
import { useThemeStore } from "@/store/themeStore";

const UPDATE_INTERVAL_MS = 60 * 1000;

/**
 * Updates lighting from sun position in Pilsen (Chicago) on mount and every minute.
 * All theme store subscribers run on this tick—keep their work minimal.
 */
export function ThemeByPilsenTime() {
  const updateFromPilsenTime = useThemeStore((s) => s.updateFromPilsenTime);

  useEffect(() => {
    updateFromPilsenTime();
    const interval = setInterval(updateFromPilsenTime, UPDATE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [updateFromPilsenTime]);

  return null;
}

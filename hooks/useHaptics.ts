"use client";

import { useCallback, useMemo } from "react";
import { useWebHaptics } from "web-haptics/react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

export function useHaptics() {
  const { trigger, cancel } = useWebHaptics();
  const reducedMotion = usePrefersReducedMotion();

  const fire = useCallback(
    (
      input: Parameters<typeof trigger>[0],
      opts?: Parameters<typeof trigger>[1],
    ) => {
      if (reducedMotion) return;
      trigger(input, opts);
    },
    [trigger, reducedMotion],
  );

  return useMemo(
    () => ({
      tap: () => fire([20]),
      tapMedium: () => fire([30]),
      nudge: () => fire("nudge"),
      success: () => fire("success"),
      error: () => fire("error"),
      toggle: () => fire([25, 30, 25]),
      pulse: () => fire([100, 50, 100]),
      shutter: () => fire([40]),
      cancel,
    }),
    [fire, cancel],
  );
}

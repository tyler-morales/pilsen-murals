import { describe, it, expect } from "vitest";
import {
  DROP_OFFSET_PX,
  ENTRANCE_SCALE_MIN,
  EXIT_DURATION_MS,
  getEntranceTransform,
  getExitScale,
  getLiftTransform,
  getRevealDelay,
  LIFT_TRANSLATE_PX,
  MARKER_CHUNK_SIZE,
  REVEAL_DURATION_MS,
  REVEAL_STAGGER_MS,
} from "../markerAnimation";

describe("getRevealDelay", () => {
  it("returns 0 for first index in chunk", () => {
    expect(getRevealDelay(0)).toBe(0);
    expect(getRevealDelay(8)).toBe(0);
  });

  it("returns staggered delay by index within chunk", () => {
    expect(getRevealDelay(1)).toBe(REVEAL_STAGGER_MS);
    expect(getRevealDelay(7)).toBe(7 * REVEAL_STAGGER_MS);
  });

  it("wraps by chunk size so delay never exceeds (chunkSize-1)*staggerMs", () => {
    expect(getRevealDelay(0, MARKER_CHUNK_SIZE, REVEAL_STAGGER_MS)).toBe(0);
    expect(getRevealDelay(8, 8, 28)).toBe(0);
    expect(getRevealDelay(9, 8, 28)).toBe(28);
  });

  it("accepts custom chunk size and stagger", () => {
    expect(getRevealDelay(2, 4, 50)).toBe(100);
  });
});

describe("getEntranceTransform", () => {
  const offset = { rotationDeg: 5, translateX: 2, translateY: -1 };

  it("when visible returns only rotation and translate nudge (no drop)", () => {
    const t = getEntranceTransform(offset, true);
    expect(t).toBe("rotate(5deg) translate(2px, -1px)");
    expect(t).not.toContain("translateY");
  });

  it("when not visible includes translateY drop and scale for natural entrance", () => {
    const t = getEntranceTransform(offset, false);
    expect(t).toContain(`translateY(${DROP_OFFSET_PX}px)`);
    expect(t).toContain("rotate(5deg)");
    expect(t).toContain("translate(2px, -1px)");
    expect(t).toContain("scale(");
  });

  it("when not visible and prefersReducedMotion omits scale", () => {
    const t = getEntranceTransform(offset, false, DROP_OFFSET_PX, true);
    expect(t).not.toContain("scale(");
    expect(t).toContain(`translateY(${DROP_OFFSET_PX}px)`);
  });

  it("accepts custom drop px", () => {
    const t = getEntranceTransform(offset, false, 15);
    expect(t).toContain("translateY(15px)");
  });
});

describe("getLiftTransform", () => {
  it("returns none when not lifted", () => {
    expect(getLiftTransform(false, false)).toBe("none");
    expect(getLiftTransform(false, true)).toBe("none");
  });

  it("returns none when prefers reduced motion even if lifted", () => {
    expect(getLiftTransform(true, true)).toBe("none");
  });

  it("returns translateY lift when lifted and not reduced motion", () => {
    expect(getLiftTransform(true, false)).toBe(`translateY(${LIFT_TRANSLATE_PX}px)`);
  });
});

describe("zoom lifecycle constants", () => {
  it("EXIT_DURATION_MS is positive and used for teardown delay", () => {
    expect(EXIT_DURATION_MS).toBeGreaterThan(0);
    expect(EXIT_DURATION_MS).toBeLessThanOrEqual(REVEAL_DURATION_MS + 50);
  });

  it("ENTRANCE_SCALE_MIN is below 1 for bounce-in", () => {
    expect(ENTRANCE_SCALE_MIN).toBeLessThan(1);
    expect(ENTRANCE_SCALE_MIN).toBeGreaterThan(0);
  });
});

describe("getExitScale", () => {
  it("returns 1 when prefers reduced motion (no scale animation)", () => {
    expect(getExitScale(true)).toBe(1);
  });

  it("returns value < 1 when not reduced motion for subtle shrink on exit", () => {
    const scale = getExitScale(false);
    expect(scale).toBeLessThan(1);
    expect(scale).toBeGreaterThan(0);
  });
});

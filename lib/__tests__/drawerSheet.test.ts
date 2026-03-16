import { describe, it, expect } from "vitest";
import {
  shouldCloseDrawerOnDragEnd,
  DRAWER_CLOSE_OFFSET_THRESHOLD,
  DRAWER_CLOSE_VELOCITY_THRESHOLD,
} from "../drawerSheet";

describe("shouldCloseDrawerOnDragEnd", () => {
  it("returns true when drag offset exceeds threshold", () => {
    expect(
      shouldCloseDrawerOnDragEnd({
        offset: { y: DRAWER_CLOSE_OFFSET_THRESHOLD + 1 },
        velocity: { y: 0 },
      })
    ).toBe(true);
  });

  it("returns true when drag offset equals threshold (boundary)", () => {
    expect(
      shouldCloseDrawerOnDragEnd({
        offset: { y: DRAWER_CLOSE_OFFSET_THRESHOLD },
        velocity: { y: 0 },
      })
    ).toBe(false);
  });

  it("returns true when velocity exceeds threshold", () => {
    expect(
      shouldCloseDrawerOnDragEnd({
        offset: { y: 0 },
        velocity: { y: DRAWER_CLOSE_VELOCITY_THRESHOLD + 1 },
      })
    ).toBe(true);
  });

  it("returns true when both offset and velocity exceed thresholds", () => {
    expect(
      shouldCloseDrawerOnDragEnd({
        offset: { y: 100 },
        velocity: { y: 400 },
      })
    ).toBe(true);
  });

  it("returns false when offset and velocity are below thresholds", () => {
    expect(
      shouldCloseDrawerOnDragEnd({
        offset: { y: 50 },
        velocity: { y: 100 },
      })
    ).toBe(false);
  });

  it("returns false when offset is zero and velocity is below threshold", () => {
    expect(
      shouldCloseDrawerOnDragEnd({
        offset: { y: 0 },
        velocity: { y: DRAWER_CLOSE_VELOCITY_THRESHOLD - 1 },
      })
    ).toBe(false);
  });
});

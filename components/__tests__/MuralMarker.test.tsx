import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MuralMarker, getStableCardOffset, resetRevealedMurals, thumbnailHeightFromZoom } from "../MuralMarker";
import { fixtureMural } from "@/test/fixtures/mural";

describe("thumbnailHeightFromZoom", () => {
  it("returns minimum height at zoom 11", () => {
    expect(thumbnailHeightFromZoom(11)).toBe(28);
  });

  it("returns maximum height at zoom 18", () => {
    expect(thumbnailHeightFromZoom(18)).toBe(88);
  });

  it("clamps low zoom so height does not go below minimum", () => {
    expect(thumbnailHeightFromZoom(5)).toBe(28);
    expect(thumbnailHeightFromZoom(0)).toBe(28);
  });

  it("clamps high zoom so height does not exceed maximum", () => {
    expect(thumbnailHeightFromZoom(30)).toBe(88);
    expect(thumbnailHeightFromZoom(22)).toBe(88);
  });
});

describe("getStableCardOffset", () => {
  it("returns same values for same mural id", () => {
    const a = getStableCardOffset("mural-1");
    const b = getStableCardOffset("mural-1");
    expect(a).toEqual(b);
  });

  it("returns rotation in roughly -7..7 range", () => {
    const o = getStableCardOffset("any-id");
    expect(o.rotationDeg).toBeGreaterThanOrEqual(-7);
    expect(o.rotationDeg).toBeLessThanOrEqual(7);
  });

  it("returns translateX and translateY in bounded range", () => {
    const o = getStableCardOffset("another-id");
    expect(o.translateX).toBeGreaterThanOrEqual(-4);
    expect(o.translateX).toBeLessThanOrEqual(4);
    expect(o.translateY).toBeGreaterThanOrEqual(-4);
    expect(o.translateY).toBeLessThanOrEqual(4);
  });
});

describe("MuralMarker", () => {
  const defaultProps = {
    mural: fixtureMural,
    zoom: 14,
    onClick: vi.fn(),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    resetRevealedMurals();
  });

  it("with revealDelay and not reduced motion: starts hidden then becomes visible after delay", () => {
    render(
      <MuralMarker
        {...defaultProps}
        revealDelay={200}
        prefersReducedMotion={false}
      />
    );
    const button = screen.getByRole("button", { name: /View mural: Test Mural/, hidden: true });
    const wrapper = button.parentElement?.parentElement as HTMLElement;
    expect(wrapper).toBeTruthy();
    expect(wrapper).toHaveStyle({ opacity: "0" });

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(wrapper).toHaveStyle({ opacity: "1" });
  });

  it("with prefersReducedMotion true shows immediately even with delay set", () => {
    render(
      <MuralMarker
        {...defaultProps}
        revealDelay={200}
        prefersReducedMotion={true}
      />
    );
    const button = screen.getByRole("button", { name: /View mural: Test Mural/, hidden: true });
    const wrapper = button.parentElement?.parentElement as HTMLElement;
    expect(wrapper).toHaveStyle({ opacity: "1" });
    vi.advanceTimersByTime(100);
    expect(wrapper).toHaveStyle({ opacity: "1" });
  });

  it("session reveal memory: already-revealed mural shows visible immediately on remount", () => {
    const { unmount } = render(
      <MuralMarker
        {...defaultProps}
        revealDelay={200}
        prefersReducedMotion={false}
      />
    );
    act(() => {
      vi.advanceTimersByTime(200);
    });
    unmount();

    render(
      <MuralMarker
        {...defaultProps}
        revealDelay={200}
        prefersReducedMotion={false}
      />
    );
    const button = screen.getByRole("button", { name: /View mural: Test Mural/, hidden: true });
    const wrapper = button.parentElement?.parentElement as HTMLElement;
    expect(wrapper).toHaveStyle({ opacity: "1" });
  });
});

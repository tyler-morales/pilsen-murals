import { describe, it, expect } from "vitest";
import {
  isLightColor,
  getRelativeLuminance,
  getContrastRatio,
  getContentOverlay,
  normalizeHexToSix,
} from "../colorUtils";

describe("getRelativeLuminance", () => {
  it("returns 1 for white (#fff)", () => {
    expect(getRelativeLuminance("#fff")).toBe(1);
    expect(getRelativeLuminance("#ffffff")).toBe(1);
  });

  it("returns 0 for black (#000)", () => {
    expect(getRelativeLuminance("#000")).toBe(0);
    expect(getRelativeLuminance("#000000")).toBe(0);
  });

  it("returns value in (0,1) for mid gray #888", () => {
    const L = getRelativeLuminance("#888888");
    expect(L).toBeGreaterThan(0.2);
    expect(L).toBeLessThan(0.3);
  });

  it("returns 0 for invalid hex", () => {
    expect(getRelativeLuminance("")).toBe(0);
    expect(getRelativeLuminance("nothex")).toBe(0);
  });
});

describe("getContrastRatio", () => {
  it("returns 21:1 for black vs white", () => {
    expect(getContrastRatio("#000000", "#ffffff")).toBe(21);
  });

  it("returns 1:1 for identical colors", () => {
    expect(getContrastRatio("#ff0000", "#ff0000")).toBe(1);
  });

  it("is symmetric (order does not matter)", () => {
    const ab = getContrastRatio("#336699", "#ffffff");
    const ba = getContrastRatio("#ffffff", "#336699");
    expect(ab).toBe(ba);
  });

  it("returns reasonable ratios for mid-tone colors", () => {
    const ratio = getContrastRatio("#888888", "#ffffff");
    expect(ratio).toBeGreaterThan(3);
    expect(ratio).toBeLessThan(5);
  });
});

describe("isLightColor", () => {
  it("returns true for white and very light colors", () => {
    expect(isLightColor("#ffffff")).toBe(true);
    expect(isLightColor("#fff")).toBe(true);
    expect(isLightColor("#f0f0f0")).toBe(true);
  });

  it("returns false for black and very dark colors", () => {
    expect(isLightColor("#000000")).toBe(false);
    expect(isLightColor("#000")).toBe(false);
    expect(isLightColor("#111111")).toBe(false);
  });

  it("returns true for mid-tone colors where dark text is better (L > ~0.179)", () => {
    expect(isLightColor("#888888")).toBe(true);
    expect(isLightColor("#8B7B6B")).toBe(true);
    expect(isLightColor("#777777")).toBe(true);
  });

  it("returns false for darker mid-tones where white text is better (L < ~0.179)", () => {
    expect(isLightColor("#333333")).toBe(false);
    expect(isLightColor("#666666")).toBe(false);
    expect(isLightColor("#2a2a2a")).toBe(false);
  });

  it("returns false for invalid hex (treated as dark)", () => {
    expect(isLightColor("")).toBe(false);
    expect(isLightColor("invalid")).toBe(false);
  });

  it("picks the foreground with higher contrast ratio", () => {
    const testHexes = ["#444444", "#777777", "#999999", "#bbbbbb"];
    for (const hex of testHexes) {
      const blackContrast = getContrastRatio(hex, "#000000");
      const whiteContrast = getContrastRatio(hex, "#ffffff");
      const expectedLight = blackContrast >= whiteContrast;
      expect(isLightColor(hex)).toBe(expectedLight);
    }
  });
});

describe("getContentOverlay", () => {
  it("returns white overlay for light backgrounds", () => {
    expect(getContentOverlay("#ffffff")).toContain("255,255,255");
  });

  it("returns black overlay for dark backgrounds", () => {
    expect(getContentOverlay("#000000")).toContain("0,0,0");
  });

  it("returns white overlay for mid-tone backgrounds (dark text direction)", () => {
    expect(getContentOverlay("#888888")).toContain("255,255,255");
  });
});

describe("normalizeHexToSix", () => {
  it("returns 6-digit hex without # for 6-digit input", () => {
    expect(normalizeHexToSix("#333333")).toBe("333333");
    expect(normalizeHexToSix("abcdef")).toBe("abcdef");
  });

  it("expands 3-digit hex to 6-digit", () => {
    expect(normalizeHexToSix("#fff")).toBe("ffffff");
    expect(normalizeHexToSix("#f00")).toBe("ff0000");
  });

  it("returns 333333 for invalid input", () => {
    expect(normalizeHexToSix("")).toBe("333333");
    expect(normalizeHexToSix("x")).toBe("333333");
  });
});

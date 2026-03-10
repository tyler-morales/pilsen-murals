import { describe, it, expect } from "vitest";
import { bearingToDirectionText, formatDistance } from "../geo";

describe("formatDistance", () => {
  it("clamps negative meters to zero so output is never negative", () => {
    expect(formatDistance(-100, "en-GB")).toMatch(/~\d+ m away/);
    expect(formatDistance(-100, "en-GB")).not.toContain("-");
  });

  it("returns meters for non en-US locale", () => {
    expect(formatDistance(25, "en-GB")).toMatch(/~\d+ m away/);
    expect(formatDistance(25, "de")).toMatch(/~\d+ m away/);
  });

  it("returns feet for en-US locale", () => {
    expect(formatDistance(30, "en-US")).toMatch(/~\d+ ft away/);
  });
});

describe("bearingToDirectionText", () => {
  it("returns Face north for 0", () => {
    expect(bearingToDirectionText(0)).toBe("Face north");
  });

  it("returns Face east for 90", () => {
    expect(bearingToDirectionText(90)).toBe("Face east");
  });

  it("wraps 359 to north", () => {
    expect(bearingToDirectionText(359)).toBe("Face north");
  });

  it("normalizes negative values", () => {
    expect(bearingToDirectionText(-90)).toBe("Face west");
  });
});

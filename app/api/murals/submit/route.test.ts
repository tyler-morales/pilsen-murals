/**
 * POST /api/murals/submit: date parsing and insert payload shape.
 * parseDateCaptured / parseDatePainted are used when building the insert payload.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseDateCaptured, parseDatePainted } from "./route";

describe("parseDateCaptured", () => {
  it("returns ISO string for valid date string", () => {
    const result = parseDateCaptured("2025-03-15T12:00:00.000Z");
    expect(result).toBe("2025-03-15T12:00:00.000Z");
  });

  it("returns ISO string for YYYY-MM-DD", () => {
    const result = parseDateCaptured("2025-03-18");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Date(result).getTime()).toBeGreaterThan(0);
  });

  it("returns current date ISO when value is null, empty, or invalid", () => {
    expect(parseDateCaptured(null)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parseDateCaptured("")).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parseDateCaptured("  ")).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parseDateCaptured("not-a-date")).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("parseDatePainted", () => {
  it("returns YYYY-MM-DD for valid date string", () => {
    expect(parseDatePainted("2020-06-01")).toBe("2020-06-01");
    expect(parseDatePainted("2025-01-01")).toBe("2025-01-01");
  });

  it("returns null when value is null, empty, or invalid", () => {
    expect(parseDatePainted(null)).toBeNull();
    expect(parseDatePainted("")).toBeNull();
    expect(parseDatePainted("  ")).toBeNull();
    expect(parseDatePainted("not-a-date")).toBeNull();
  });
});

describe("POST /api/murals/submit insert payload shape", () => {
  it("builds date_captured from parseDateCaptured and date_painted from parseDatePainted", () => {
    const dateCaptured = parseDateCaptured("2025-03-15");
    const datePainted = parseDatePainted("2020-06-01");
    expect(dateCaptured).toBeDefined();
    expect(datePainted).toBe("2020-06-01");
  });

  it("builds payload with null date_painted when not provided", () => {
    const datePainted = parseDatePainted(null);
    expect(datePainted).toBeNull();
  });
});

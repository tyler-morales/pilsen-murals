import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { processUploadedImage, FALLBACK_COORDINATES } from "../upload/processImage";

describe("processUploadedImage", () => {
  it("returns display and thumb buffers plus dominant color for valid image", async () => {
    const buffer = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "#336699" },
    })
      .jpeg()
      .toBuffer();

    const result = await processUploadedImage(buffer);

    expect(result.displayBuffer).toBeInstanceOf(Buffer);
    expect(result.displayBuffer.length).toBeGreaterThan(0);
    expect(result.thumbBuffer).toBeInstanceOf(Buffer);
    expect(result.thumbBuffer.length).toBeGreaterThan(0);
    expect(result.dominantColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(result.coordinatesFromExif).toBeNull();
  }, 10000);

  it("returns FALLBACK_COORDINATES when no EXIF GPS", async () => {
    const buffer = await sharp({
      create: { width: 5, height: 5, channels: 3, background: "#000" },
    })
      .jpeg()
      .toBuffer();

    const result = await processUploadedImage(buffer);

    expect(result.coordinatesFromExif).toBeNull();
    expect(FALLBACK_COORDINATES).toEqual([-87.6621, 41.8579]);
  });

  it("throws or returns safely for empty buffer", async () => {
    const empty = Buffer.alloc(0);
    await expect(processUploadedImage(empty)).rejects.toThrow();
  });
});

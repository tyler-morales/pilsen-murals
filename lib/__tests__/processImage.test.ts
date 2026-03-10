import { describe, it, expect, vi, afterEach } from "vitest";
import sharp from "sharp";
import ExifReader from "exifreader";
import { processUploadedImage, FALLBACK_COORDINATES } from "../upload/processImage";

describe("processUploadedImage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it("keeps full display dimensions while still generating thumbnail", async () => {
    const sourceWidth = 2400;
    const sourceHeight = 1800;
    const buffer = await sharp({
      create: { width: sourceWidth, height: sourceHeight, channels: 3, background: "#224466" },
    })
      .jpeg()
      .toBuffer();

    const result = await processUploadedImage(buffer);
    const displayMeta = await sharp(result.displayBuffer).metadata();
    const thumbMeta = await sharp(result.thumbBuffer).metadata();

    expect(displayMeta.width).toBe(sourceWidth);
    expect(displayMeta.height).toBe(sourceHeight);
    expect(thumbMeta.width).toBeLessThanOrEqual(400);
  });

  it("returns null coordinates when EXIF GPS is missing", async () => {
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

  it("keeps both mapped and unmapped EXIF tags in imageMetadata", async () => {
    vi.spyOn(ExifReader, "load").mockReturnValue({
      exif: {
        Make: { description: "Google" },
        LensModel: { description: "Pixel 9 Pro back camera 6.9mm f/1.68" },
        CustomFirmware: { description: "v1.2.3" },
      },
      file: {
        "Image Width": { description: "6144px" },
        "Image Height": { description: "8160px" },
      },
    } as never);

    const buffer = await sharp({
      create: { width: 12, height: 8, channels: 3, background: "#102030" },
    })
      .jpeg()
      .toBuffer();

    const result = await processUploadedImage(buffer);

    expect(result.imageMetadata).toMatchObject({
      "Camera make": "Google",
      Lens: "Pixel 9 Pro back camera 6.9mm f/1.68",
      CustomFirmware: "v1.2.3",
      Width: "6144px",
      Height: "8160px",
    });
  });

  it("continues processing when EXIF parsing fails", async () => {
    vi.spyOn(ExifReader, "load").mockImplementation(() => {
      throw new Error("bad exif");
    });

    const buffer = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "#445566" },
    })
      .jpeg()
      .toBuffer();

    const result = await processUploadedImage(buffer);

    expect(result.displayBuffer.length).toBeGreaterThan(0);
    expect(result.thumbBuffer.length).toBeGreaterThan(0);
    expect(result.imageMetadata).toBeUndefined();
    expect(result.coordinatesFromExif).toBeNull();
  });
});

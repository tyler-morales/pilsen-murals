import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { reencodeBlobToJpegForDisplay } from "../reencodeBlobToJpegForDisplay";

describe("reencodeBlobToJpegForDisplay", () => {
  const BLOB_URL = "blob:http://localhost/mock";

  beforeEach(() => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue(BLOB_URL);
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => { });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resolves a JPEG blob, draws to canvas, and revokes the object URL", async () => {
    const jpegBlob = new Blob(["fakejpeg"], { type: "image/jpeg" });
    const toBlob = vi.fn((cb: (b: Blob | null) => void) => {
      cb(jpegBlob);
    });
    const ctx = { drawImage: vi.fn() };
    const canvasEl = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ctx),
      toBlob,
    };

    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") return canvasEl as unknown as HTMLCanvasElement;
      return origCreate(tag);
    });

    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 2;
      naturalHeight = 2;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", MockImage);

    const out = await reencodeBlobToJpegForDisplay(new Blob(["x"], { type: "image/png" }));

    expect(out).toBe(jpegBlob);
    expect(out.type).toBe("image/jpeg");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(BLOB_URL);
    expect(canvasEl.width).toBe(2);
    expect(canvasEl.height).toBe(2);
    expect(ctx.drawImage).toHaveBeenCalled();
    expect(toBlob).toHaveBeenCalled();
  });

  it("rejects when the image fails to decode", async () => {
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") {
        throw new Error("should not reach canvas");
      }
      return origCreate(tag);
    });

    class MockImageFail {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 0;
      naturalHeight = 0;
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("Image", MockImageFail);

    await expect(
      reencodeBlobToJpegForDisplay(new Blob([], { type: "image/jpeg" }))
    ).rejects.toThrow("Image decode failed");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(BLOB_URL);
  });

  it("rejects when decoded image has zero dimensions", async () => {
    const toBlob = vi.fn();
    const canvasEl = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob,
    };
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") return canvasEl as unknown as HTMLCanvasElement;
      return origCreate(tag);
    });

    class MockImageZero {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 0;
      naturalHeight = 1;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", MockImageZero);

    await expect(
      reencodeBlobToJpegForDisplay(new Blob([new Uint8Array([1])], { type: "image/png" }))
    ).rejects.toThrow("zero dimensions");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(BLOB_URL);
    expect(toBlob).not.toHaveBeenCalled();
  });

  it("rejects when toBlob returns null", async () => {
    const toBlob = vi.fn((cb: (b: Blob | null) => void) => {
      cb(null);
    });
    const canvasEl = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob,
    };
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") return canvasEl as unknown as HTMLCanvasElement;
      return origCreate(tag);
    });

    class MockImageOk {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 1;
      naturalHeight = 1;
      set src(_v: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", MockImageOk);

    await expect(
      reencodeBlobToJpegForDisplay(new Blob(["x"], { type: "image/png" }))
    ).rejects.toThrow("toBlob failed");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(BLOB_URL);
  });
});

import { describe, it, expect } from "vitest";
import {
  clampModalAspectRatio,
  getModalImageAspectRatio,
  aspectRatioFromDimensions,
  MODAL_ASPECT_MIN,
  MODAL_ASPECT_MAX,
  MODAL_ASPECT_DEFAULT,
} from "@/lib/muralHeroAspect";
import type { Mural } from "@/types/mural";

describe("muralHeroAspect", () => {
  describe("clampModalAspectRatio", () => {
    it("clamps ratio to min when below minimum", () => {
      expect(clampModalAspectRatio(0.1)).toBe(MODAL_ASPECT_MIN);
      expect(clampModalAspectRatio(0.5)).toBe(MODAL_ASPECT_MIN);
    });

    it("clamps ratio to max when above maximum", () => {
      expect(clampModalAspectRatio(3)).toBe(MODAL_ASPECT_MAX);
      expect(clampModalAspectRatio(10)).toBe(MODAL_ASPECT_MAX);
    });

    it("returns ratio unchanged when within bounds", () => {
      expect(clampModalAspectRatio(1)).toBe(1);
      expect(clampModalAspectRatio(1.5)).toBe(1.5);
      expect(clampModalAspectRatio(MODAL_ASPECT_MIN)).toBe(MODAL_ASPECT_MIN);
      expect(clampModalAspectRatio(MODAL_ASPECT_MAX)).toBe(MODAL_ASPECT_MAX);
    });
  });

  describe("aspectRatioFromDimensions", () => {
    it("returns clamped ratio for valid dimensions", () => {
      expect(aspectRatioFromDimensions(1920, 1080)).toBe(16 / 9);
      expect(aspectRatioFromDimensions(1080, 1920)).toBe(MODAL_ASPECT_MIN); // Portrait clamped to min
      expect(aspectRatioFromDimensions(2000, 1000)).toBe(2); // Landscape at max
    });

    it("returns null for zero width", () => {
      expect(aspectRatioFromDimensions(0, 100)).toBeNull();
    });

    it("returns null for zero height", () => {
      expect(aspectRatioFromDimensions(100, 0)).toBeNull();
    });

    it("returns null for negative dimensions", () => {
      expect(aspectRatioFromDimensions(-100, 100)).toBeNull();
      expect(aspectRatioFromDimensions(100, -100)).toBeNull();
    });

    it("returns null for non-finite dimensions", () => {
      expect(aspectRatioFromDimensions(Infinity, 100)).toBeNull();
      expect(aspectRatioFromDimensions(100, Infinity)).toBeNull();
      expect(aspectRatioFromDimensions(NaN, 100)).toBeNull();
      expect(aspectRatioFromDimensions(100, NaN)).toBeNull();
    });
  });

  describe("getModalImageAspectRatio", () => {
    it("returns aspect ratio from metadata when available", () => {
      const mural: Mural = {
        id: "test",
        title: "Test",
        artist: "Artist",
        coordinates: [0, 0],
        dominantColor: "#000",
        imageUrl: "https://example.com/image.jpg",
        imageMetadata: {
          Width: "1920",
          Height: "1080",
        },
      };
      expect(getModalImageAspectRatio(mural)).toBe(16 / 9);
    });

    it("clamps aspect ratio from metadata", () => {
      const portraitMural: Mural = {
        id: "test",
        title: "Test",
        artist: "Artist",
        coordinates: [0, 0],
        dominantColor: "#000",
        imageUrl: "https://example.com/image.jpg",
        imageMetadata: {
          Width: "1080",
          Height: "1920",
        },
      };
      expect(getModalImageAspectRatio(portraitMural)).toBe(MODAL_ASPECT_MIN);
    });

    it("returns default when metadata is missing", () => {
      const mural: Mural = {
        id: "test",
        title: "Test",
        artist: "Artist",
        coordinates: [0, 0],
        dominantColor: "#000",
        imageUrl: "https://example.com/image.jpg",
      };
      expect(getModalImageAspectRatio(mural)).toBe(MODAL_ASPECT_DEFAULT);
    });

    it("returns default when metadata Width is missing", () => {
      const mural: Mural = {
        id: "test",
        title: "Test",
        artist: "Artist",
        coordinates: [0, 0],
        dominantColor: "#000",
        imageUrl: "https://example.com/image.jpg",
        imageMetadata: {
          Height: "1080",
        },
      };
      expect(getModalImageAspectRatio(mural)).toBe(MODAL_ASPECT_DEFAULT);
    });

    it("returns default when metadata Height is missing", () => {
      const mural: Mural = {
        id: "test",
        title: "Test",
        artist: "Artist",
        coordinates: [0, 0],
        dominantColor: "#000",
        imageUrl: "https://example.com/image.jpg",
        imageMetadata: {
          Width: "1920",
        },
      };
      expect(getModalImageAspectRatio(mural)).toBe(MODAL_ASPECT_DEFAULT);
    });

    it("returns default when Height is zero", () => {
      const mural: Mural = {
        id: "test",
        title: "Test",
        artist: "Artist",
        coordinates: [0, 0],
        dominantColor: "#000",
        imageUrl: "https://example.com/image.jpg",
        imageMetadata: {
          Width: "1920",
          Height: "0",
        },
      };
      expect(getModalImageAspectRatio(mural)).toBe(MODAL_ASPECT_DEFAULT);
    });

    it("handles px suffix in metadata", () => {
      const mural: Mural = {
        id: "test",
        title: "Test",
        artist: "Artist",
        coordinates: [0, 0],
        dominantColor: "#000",
        imageUrl: "https://example.com/image.jpg",
        imageMetadata: {
          Width: "1920px",
          Height: "1080px",
        },
      };
      expect(getModalImageAspectRatio(mural)).toBe(16 / 9);
    });
  });
});

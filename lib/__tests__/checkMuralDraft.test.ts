import { describe, it, expect, beforeEach } from "vitest";
import {
  loadDraft,
  saveDraft,
  clearDraft,
  draftImageBase64ToBlob,
  type CheckMuralDraft,
  type SearchResponse,
} from "@/store/checkMuralDraftStore";

const DRAFT_JSON_KEY = "pilsen-murals-check-draft";
const DRAFT_IMAGE_KEY = "pilsen-murals-check-draft-image";

describe("checkMuralDraftStore", () => {
  beforeEach(() => {
    clearDraft();
  });

  describe("loadDraft", () => {
    it("returns null when localStorage is empty", () => {
      expect(loadDraft()).toBeNull();
    });

    it("returns null when JSON key has invalid data", () => {
      localStorage.setItem(DRAFT_JSON_KEY, "not json");
      expect(loadDraft()).toBeNull();
    });

    it("returns null when phase is missing or invalid", () => {
      localStorage.setItem(
        DRAFT_JSON_KEY,
        JSON.stringify({ submitTitle: "", submitArtist: "" })
      );
      expect(loadDraft()).toBeNull();
      localStorage.setItem(
        DRAFT_JSON_KEY,
        JSON.stringify({ phase: "capture", submitTitle: "", submitArtist: "" })
      );
      expect(loadDraft()).toBeNull();
    });
  });

  describe("saveDraft / loadDraft round-trip", () => {
    it("round-trips draft without image", async () => {
      const draft: CheckMuralDraft = {
        phase: "result",
        submitTitle: "My Mural",
        submitArtist: "Artist",
      };
      await saveDraft(draft);
      const loaded = loadDraft();
      expect(loaded).not.toBeNull();
      expect(loaded!.phase).toBe("result");
      expect(loaded!.submitTitle).toBe("My Mural");
      expect(loaded!.submitArtist).toBe("Artist");
    });

    it("round-trips draft with searchResult and selectedResultId", async () => {
      const searchResult: SearchResponse = {
        results: [
          { id: "mural-1", score: 0.9, payload: { title: "Test" } },
        ],
      };
      await saveDraft({
        phase: "result",
        searchResult,
        selectedResultId: "mural-1",
        submitTitle: "",
        submitArtist: "",
      });
      const loaded = loadDraft();
      expect(loaded?.searchResult?.results).toHaveLength(1);
      expect(loaded?.searchResult?.results[0].id).toBe("mural-1");
      expect(loaded?.selectedResultId).toBe("mural-1");
    });

    it("round-trips draft with small image blob", async () => {
      const blob = new Blob(["x"], { type: "image/jpeg" });
      await saveDraft({
        phase: "edit",
        submitTitle: "",
        submitArtist: "",
        imageBlob: blob,
      });
      const loaded = loadDraft();
      expect(loaded).not.toBeNull();
      expect(loaded!.phase).toBe("edit");
      const decoded = draftImageBase64ToBlob(loaded!);
      expect(decoded).not.toBeNull();
      expect(decoded!.size).toBe(1);
      expect(decoded!.type).toBe("image/jpeg");
    });
  });

  describe("saveDraft with oversized image", () => {
    it("persists metadata with imageOmitted when image base64 exceeds cap", async () => {
      const hugeBlob = new Blob([new Uint8Array(3 * 1024 * 1024)], {
        type: "image/jpeg",
      });
      await saveDraft({
        phase: "result",
        submitTitle: "Big",
        submitArtist: "",
        imageBlob: hugeBlob,
      });
      const loaded = loadDraft();
      expect(loaded).not.toBeNull();
      expect(loaded!.imageOmitted).toBe(true);
      expect(draftImageBase64ToBlob(loaded!)).toBeNull();
    });
  });

  describe("draftImageBase64ToBlob", () => {
    it("returns null when draft has no imageBase64", () => {
      const draft: CheckMuralDraft = { phase: "result", submitTitle: "", submitArtist: "" };
      expect(draftImageBase64ToBlob(draft)).toBeNull();
    });
  });

  describe("clearDraft", () => {
    it("removes draft and image from localStorage", async () => {
      await saveDraft({
        phase: "edit",
        submitTitle: "",
        submitArtist: "",
        imageBlob: new Blob(["x"], { type: "image/jpeg" }),
      });
      expect(loadDraft()).not.toBeNull();
      clearDraft();
      expect(loadDraft()).toBeNull();
      expect(localStorage.getItem(DRAFT_IMAGE_KEY)).toBeNull();
    });
  });
});

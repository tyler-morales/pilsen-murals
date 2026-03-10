import { describe, it, expect } from "vitest";
import {
  isMatchInDb,
  MATCH_THRESHOLD,
  type SearchResponse,
} from "../CheckMuralModal";

describe("isMatchInDb", () => {
  it("returns true when top result score is at or above threshold", () => {
    const response: SearchResponse = {
      results: [
        { id: "mural-1", score: MATCH_THRESHOLD, payload: { title: "Test" } },
      ],
    };
    expect(isMatchInDb(response)).toBe(true);
  });

  it("returns true when top result score is above threshold", () => {
    const response: SearchResponse = {
      results: [
        { id: "mural-1", score: 0.95, payload: { title: "Test" } },
      ],
    };
    expect(isMatchInDb(response)).toBe(true);
  });

  it("returns false when top result score is below threshold", () => {
    const response: SearchResponse = {
      results: [
        { id: "mural-1", score: MATCH_THRESHOLD - 0.01, payload: { title: "Test" } },
      ],
    };
    expect(isMatchInDb(response)).toBe(false);
  });

  it("returns false when results array is empty", () => {
    const response: SearchResponse = { results: [] };
    expect(isMatchInDb(response)).toBe(false);
  });

  it("returns true when first result is above threshold among multiple", () => {
    const response: SearchResponse = {
      results: [
        { id: "mural-1", score: 0.9, payload: { id: "mural-1", title: "First" } },
        { id: "mural-2", score: 0.7, payload: { id: "mural-2", title: "Second" } },
      ],
    };
    expect(isMatchInDb(response)).toBe(true);
  });
});

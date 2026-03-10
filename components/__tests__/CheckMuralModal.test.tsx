import { describe, it, expect } from "vitest";
import {
  isMatchInDb,
  MATCH_THRESHOLD,
  MIN_RELEVANCE_SCORE,
  type SearchResponse,
  type SearchResultItem,
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

describe("MIN_RELEVANCE_SCORE (override candidate filtering)", () => {
  function getOverrideCandidates(results: SearchResultItem[]): SearchResultItem[] {
    const match = results.length > 0 && results[0].score >= MATCH_THRESHOLD;
    if (match || results.length === 0) return [];
    return results.filter((r) => r.score >= MIN_RELEVANCE_SCORE).slice(0, 5);
  }

  it("filters out irrelevant results below the relevance floor", () => {
    const results: SearchResultItem[] = [
      { id: "mural-1", score: 0.42, payload: {} },
      { id: "mural-2", score: 0.38, payload: {} },
      { id: "mural-3", score: 0.30, payload: {} },
    ];
    expect(getOverrideCandidates(results)).toEqual([]);
  });

  it("keeps candidates at or above the relevance floor", () => {
    const results: SearchResultItem[] = [
      { id: "mural-1", score: 0.62, payload: {} },
      { id: "mural-2", score: 0.55, payload: {} },
      { id: "mural-3", score: 0.40, payload: {} },
    ];
    const candidates = getOverrideCandidates(results);
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.id)).toEqual(["mural-1", "mural-2"]);
  });

  it("returns empty when results are a direct match (above MATCH_THRESHOLD)", () => {
    const results: SearchResultItem[] = [
      { id: "mural-1", score: 0.91, payload: {} },
    ];
    expect(getOverrideCandidates(results)).toEqual([]);
  });

  it("treats score at MATCH_THRESHOLD (0.80) as match", () => {
    const response: SearchResponse = {
      results: [{ id: "mural-1", score: 0.80, payload: {} }],
    };
    expect(isMatchInDb(response)).toBe(true);
  });
});

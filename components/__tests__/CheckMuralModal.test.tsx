import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  CheckMuralModal,
  isMatchInDb,
  MATCH_THRESHOLD,
  MIN_RELEVANCE_SCORE,
  type SearchResponse,
  type SearchResultItem,
} from "../CheckMuralModal";

vi.mock("@/lib/upload/normalizeImageForUpload", () => ({
  normalizeImageForUpload: vi.fn((_file: File) =>
    Promise.resolve(new Blob(["x"], { type: "image/jpeg" }))
  ),
}));

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

describe("CheckMuralModal persistence (explicit upload only)", () => {
  const noMatchSearchResponse = { results: [] };

  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
        onchange: null,
        media: "",
      }))
    );
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string | URL) => {
        const path = typeof url === "string" ? url : url.toString();
        if (path.includes("/api/search")) {
          return Promise.resolve(
            new Response(JSON.stringify(noMatchSearchResponse), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          );
        }
        return Promise.reject(new Error(`Unexpected fetch: ${path}`));
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls only /api/search when user uploads a photo; never /api/murals/submit until Add to database", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CheckMuralModal isOpen onClose={onClose} />);

    const fileInput = screen.getByLabelText(/Upload photo from device/i);
    const file = new File(["x"], "capture.jpg", { type: "image/jpeg" });

    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(screen.getByText(/Add to database/i)).toBeInTheDocument();
    });

    const fetchCalls = vi.mocked(fetch).mock.calls;
    const searchCalls = fetchCalls.filter(([url]) => {
      const p = typeof url === "string" ? url : (url as URL).toString();
      return p.includes("/api/search");
    });
    const submitCalls = fetchCalls.filter(([url]) => {
      const p = typeof url === "string" ? url : (url as URL).toString();
      return p.includes("/api/murals/submit");
    });

    expect(searchCalls.length).toBe(1);
    expect(submitCalls.length).toBe(0);
  });

  it("does not call /api/murals/submit when user retakes photo after result", async () => {
    const user = userEvent.setup();
    render(<CheckMuralModal isOpen onClose={vi.fn()} />);

    const fileInput = screen.getByLabelText(/Upload photo from device/i);
    await user.upload(fileInput, new File(["x"], "capture.jpg", { type: "image/jpeg" }));

    await waitFor(() => {
      expect(screen.getByText(/Add to database/i)).toBeInTheDocument();
    });

    const retakeButton = screen.getByRole("button", { name: /Retake photo/i, hidden: true });
    await user.click(retakeButton);

    const submitCalls = vi.mocked(fetch).mock.calls.filter(([url]) => {
      const p = typeof url === "string" ? url : (url as URL).toString();
      return p.includes("/api/murals/submit");
    });
    expect(submitCalls.length).toBe(0);
  });

  it("normalizes file upload then calls /api/search (success)", async () => {
    const { normalizeImageForUpload } = await import("@/lib/upload/normalizeImageForUpload");
    vi.mocked(normalizeImageForUpload).mockClear();

    const user = userEvent.setup();
    render(<CheckMuralModal isOpen onClose={vi.fn()} />);

    const fileInput = screen.getByLabelText(/Upload photo from device/i);
    await user.upload(fileInput, new File(["x"], "large.jpg", { type: "image/jpeg" }));

    await waitFor(() => {
      expect(screen.getByText(/Add to database/i)).toBeInTheDocument();
    });

    expect(normalizeImageForUpload).toHaveBeenCalledTimes(1);
    const searchCalls = vi.mocked(fetch).mock.calls.filter(([url]) => {
      const p = typeof url === "string" ? url : (url as URL).toString();
      return p.includes("/api/search");
    });
    expect(searchCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("shows specific error when /api/search returns 413", async () => {
    vi.mocked(fetch).mockImplementation((url: string | URL) => {
      const path = typeof url === "string" ? url : url.toString();
      if (path.includes("/api/search")) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "Payload too large" }), {
            status: 413,
            headers: { "Content-Type": "application/json" },
          })
        );
      }
      return Promise.reject(new Error(`Unexpected fetch: ${path}`));
    });

    const user = userEvent.setup();
    render(<CheckMuralModal isOpen onClose={vi.fn()} />);

    const fileInput = screen.getByLabelText(/Upload photo from device/i);
    await user.upload(fileInput, new File(["x"], "capture.jpg", { type: "image/jpeg" }));

    await waitFor(() => {
      expect(
        screen.getByText(/Image is too large; choose a smaller file or take a new photo/i)
      ).toBeInTheDocument();
    });
  });
});

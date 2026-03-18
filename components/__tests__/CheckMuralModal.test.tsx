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

vi.mock("@/lib/upload/cropImage", () => ({
  getCroppedImg: vi.fn(() =>
    Promise.resolve(new Blob(["x"], { type: "image/jpeg" }))
  ),
}));

vi.mock("@/components/ImageEditor", () => ({
  ImageEditor: ({
    onComplete,
  }: {
    onComplete: (blob: Blob) => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() => onComplete(new Blob(["x"], { type: "image/jpeg" }))}
      >
        Done
      </button>
    </div>
  ),
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn(),
}));

import { useAuthStore } from "@/store/authStore";

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
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "test-site-key";
    vi.mocked(useAuthStore).mockImplementation(
      (selector: (s: { user: unknown }) => unknown) => selector({ user: null }) as ReturnType<typeof useAuthStore>
    );
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
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

    const fileInput = screen.getByLabelText(/Choose photo from device/i);
    const file = new File(["x"], "capture.jpg", { type: "image/jpeg" });

    await user.upload(fileInput, file);

    const doneBtn = await screen.findByText("Done");
    await user.click(doneBtn);

    await waitFor(() => {
      expect(screen.getByText(/Confirm photo/i)).toBeInTheDocument();
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

    const fileInput = screen.getByLabelText(/Choose photo from device/i);
    await user.upload(fileInput, new File(["x"], "capture.jpg", { type: "image/jpeg" }));

    const doneBtn = await screen.findByText("Done");
    await user.click(doneBtn);

    await waitFor(() => {
      expect(screen.getByText(/Confirm photo/i)).toBeInTheDocument();
    });

    const retakeButton = screen.getByRole("button", { name: /Retake photo/i, hidden: true });
    await user.click(retakeButton);

    const submitCalls = vi.mocked(fetch).mock.calls.filter(([url]) => {
      const p = typeof url === "string" ? url : (url as URL).toString();
      return p.includes("/api/murals/submit");
    });
    expect(submitCalls.length).toBe(0);
  });

  it("calls onRequestAuth when Add to database flow triggered and user not logged in", async () => {
    const user = userEvent.setup();
    const onRequestAuth = vi.fn();
    render(
      <CheckMuralModal isOpen onClose={vi.fn()} onRequestAuth={onRequestAuth} />
    );

    const fileInput = screen.getByLabelText(/Choose photo from device/i);
    await user.upload(fileInput, new File(["x"], "capture.jpg", { type: "image/jpeg" }));

    const doneBtn = await screen.findByText("Done");
    await user.click(doneBtn);

    const confirmPhotoBtn = await screen.findByRole(
      "button",
      { name: "Confirm photo and choose location on map", hidden: true },
      { timeout: 3000 }
    );
    await user.click(confirmPhotoBtn);

    expect(onRequestAuth).toHaveBeenCalledTimes(1);
    expect(onRequestAuth).toHaveBeenCalledWith(
      "Sign in",
      "Create an account to add your murals to your account."
    );
    expect(screen.queryByText(/Confirm this location/i)).not.toBeInTheDocument();
  });

  it("normalizes file upload then calls /api/search (success)", async () => {
    const { normalizeImageForUpload } = await import("@/lib/upload/normalizeImageForUpload");
    vi.mocked(normalizeImageForUpload).mockClear();

    const user = userEvent.setup();
    render(<CheckMuralModal isOpen onClose={vi.fn()} />);

    const fileInput = screen.getByLabelText(/Choose photo from device/i);
    await user.upload(fileInput, new File(["x"], "large.jpg", { type: "image/jpeg" }));

    const doneBtn = await screen.findByText("Done");
    await user.click(doneBtn);

    await waitFor(() => {
      expect(screen.getByText(/Confirm photo/i)).toBeInTheDocument();
    });

    expect(normalizeImageForUpload).toHaveBeenCalledTimes(1);
    const searchCalls = vi.mocked(fetch).mock.calls.filter(([url]) => {
      const p = typeof url === "string" ? url : (url as URL).toString();
      return p.includes("/api/search");
    });
    expect(searchCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("shows specific error when /api/search returns 413", async () => {
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, _init?: RequestInit) => {
      const path = input instanceof Request ? input.url : typeof input === "string" ? input : input.toString();
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

    const fileInput = screen.getByLabelText(/Choose photo from device/i);
    await user.upload(fileInput, new File(["x"], "capture.jpg", { type: "image/jpeg" }));

    const doneBtn = await screen.findByText("Done");
    await user.click(doneBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/This image is too large \(max 4 MB\)/i)
      ).toBeInTheDocument();
    });
  });
});

describe("CheckMuralModal duplicate stack (same mural id)", () => {
  const duplicateMatchResponse: SearchResponse = {
    results: [
      { id: "mural-1", score: 0.9, payload: { id: "mural-1", title: "Same Mural", thumbnail: "" } },
      { id: "mural-1", score: 0.85, payload: { id: "mural-1", title: "Same Mural", thumbnail: "" } },
    ],
  };

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
      vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
        const path = input instanceof Request ? input.url : typeof input === "string" ? input : input.toString();
        if (path.includes("/api/search")) {
          return Promise.resolve(
            new Response(JSON.stringify(duplicateMatchResponse), {
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

  it("renders duplicate-id results as one stack card with count", async () => {
    const user = userEvent.setup();
    render(<CheckMuralModal isOpen onClose={vi.fn()} />);

    const fileInput = screen.getByLabelText(/Choose photo from device/i);
    await user.upload(fileInput, new File(["x"], "capture.jpg", { type: "image/jpeg" }));

    const doneBtn = await screen.findByText("Done");
    await user.click(doneBtn);

    await waitFor(() => {
      expect(screen.getByText(/Looks like we might have this one/)).toBeInTheDocument();
    });
    const stackButton = screen.getByLabelText(/2 photos of this mural/);
    expect(stackButton).toBeInTheDocument();
  });

  it("expands stack inline when stack card is clicked", async () => {
    const user = userEvent.setup();
    render(<CheckMuralModal isOpen onClose={vi.fn()} />);

    const fileInput = screen.getByLabelText(/Choose photo from device/i);
    await user.upload(fileInput, new File(["x"], "capture.jpg", { type: "image/jpeg" }));

    const doneBtn = await screen.findByText("Done");
    await user.click(doneBtn);

    await waitFor(() => expect(screen.getByText(/Looks like we might have this one/)).toBeInTheDocument());
    const stackButton = screen.getByLabelText(/2 photos of this mural/);
    await user.click(stackButton);

    expect(await screen.findByLabelText(/photo 1 of 2/, {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByLabelText(/photo 2 of 2/)).toBeInTheDocument();
  });

  it("selecting an expanded image collapses stack and keeps selection", async () => {
    const user = userEvent.setup();
    render(<CheckMuralModal isOpen onClose={vi.fn()} />);

    const fileInput = screen.getByLabelText(/Choose photo from device/i);
    await user.upload(fileInput, new File(["x"], "capture.jpg", { type: "image/jpeg" }));

    const doneBtn = await screen.findByText("Done");
    await user.click(doneBtn);

    await waitFor(() => expect(screen.getByText(/Looks like we might have this one/)).toBeInTheDocument());
    const stackButton = screen.getByLabelText(/2 photos of this mural/);
    await user.click(stackButton);

    const photo1 = await screen.findByLabelText(/photo 1 of 2/, {}, { timeout: 2000 });
    await user.click(photo1);

    expect(screen.getByLabelText(/2 photos of this mural/)).toBeInTheDocument();
    expect(screen.getByText("Confirm selection")).toBeInTheDocument();
  });

  describe("when API returns distinct murals", () => {
    beforeEach(() => {
      vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, _init?: RequestInit) => {
        const path = input instanceof Request ? input.url : typeof input === "string" ? input : input.toString();
        if (path.includes("/api/search")) {
          const response: SearchResponse = {
            results: [
              { id: "mural-a", score: 0.9, payload: { id: "mural-a", title: "A" } },
              { id: "mural-b", score: 0.85, payload: { id: "mural-b", title: "B" } },
            ],
          };
          return Promise.resolve(
            new Response(JSON.stringify(response), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          );
        }
        return Promise.reject(new Error(`Unexpected fetch: ${path}`));
      });
    });

    it("non-duplicate results render as single tiles only (no stack)", async () => {
      const user = userEvent.setup();
      render(<CheckMuralModal isOpen onClose={vi.fn()} />);

      const fileInput = screen.getByLabelText(/Choose photo from device/i);
      await user.upload(fileInput, new File(["x"], "capture.jpg", { type: "image/jpeg" }));

      const doneBtn = await screen.findByText("Done");
      await user.click(doneBtn);

      await waitFor(() => expect(screen.getByText(/Looks like we might have this one/)).toBeInTheDocument());
      expect(screen.getByLabelText("Select: A")).toBeInTheDocument();
      expect(screen.getByLabelText("Select: B")).toBeInTheDocument();
      expect(screen.queryByLabelText(/photos of this mural/)).not.toBeInTheDocument();
    });
  });

  describe("when API returns mixed single and stack", () => {
    beforeEach(() => {
      vi.mocked(fetch).mockImplementation((input: RequestInfo | URL, _init?: RequestInit) => {
        const path = input instanceof Request ? input.url : typeof input === "string" ? input : input.toString();
        if (path.includes("/api/search")) {
          const response: SearchResponse = {
            results: [
              { id: "mural-solo", score: 0.92, payload: { id: "mural-solo", title: "Solo" } },
              { id: "mural-pair", score: 0.88, payload: { id: "mural-pair", title: "Pair" } },
              { id: "mural-pair", score: 0.82, payload: { id: "mural-pair", title: "Pair" } },
            ],
          };
          return Promise.resolve(
            new Response(JSON.stringify(response), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          );
        }
        return Promise.reject(new Error(`Unexpected fetch: ${path}`));
      });
    });

    it("mixed single and stack buckets show both in grid", async () => {
      const user = userEvent.setup();
      render(<CheckMuralModal isOpen onClose={vi.fn()} />);

      const fileInput = screen.getByLabelText(/Choose photo from device/i);
      await user.upload(fileInput, new File(["x"], "capture.jpg", { type: "image/jpeg" }));

      const doneBtn = await screen.findByText("Done");
      await user.click(doneBtn);

      await waitFor(() => expect(screen.getByText(/Looks like we might have this one/)).toBeInTheDocument());
      expect(screen.getByLabelText("Select: Solo")).toBeInTheDocument();
      expect(screen.getByLabelText(/2 photos of this mural/)).toBeInTheDocument();
    });
  });
});

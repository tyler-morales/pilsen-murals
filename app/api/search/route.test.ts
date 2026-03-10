/**
 * Regression: POST /api/search must never write to Supabase storage or murals DB.
 * Persistence happens only when the user explicitly chooses "Add to database" (POST /api/murals/submit).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { insertMural } from "@/lib/db/client";
import { supabaseMuralStorage } from "@/lib/storage/supabase";

vi.mock("@/lib/db/client", () => ({
  insertMural: vi.fn(),
  getSupabaseClient: vi.fn(),
  selectAllMurals: vi.fn(),
  selectMuralById: vi.fn(),
  upsertMurals: vi.fn(),
}));

vi.mock("@/lib/storage/supabase", () => ({
  supabaseMuralStorage: {
    upload: vi.fn(),
  },
}));

vi.mock("@/lib/ai/embedding", () => ({
  getImageEmbedding: vi.fn().mockResolvedValue(new Array(512).fill(0)),
}));

vi.mock("@/lib/qdrant/client", () => ({
  getQdrantClient: vi.fn().mockReturnValue({
    search: vi.fn().mockResolvedValue([]),
  }),
  COLLECTION_NAME: "pilsen_murals",
}));

describe("POST /api/search", () => {
  beforeEach(() => {
    vi.mocked(insertMural).mockClear();
    vi.mocked(supabaseMuralStorage.upload).mockClear();
  });

  it("returns 200 and results without calling Supabase or murals DB write paths", async () => {
    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: "https://example.com/photo.jpg" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty("results");
    expect(Array.isArray(data.results)).toBe(true);
    expect(insertMural).not.toHaveBeenCalled();
    expect(supabaseMuralStorage.upload).not.toHaveBeenCalled();
  });

  it("does not call insertMural or storage upload when search is performed with lat/lng", async () => {
    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageUrl: "https://example.com/photo.jpg",
        lat: 41.85,
        lng: -87.65,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(insertMural).not.toHaveBeenCalled();
    expect(supabaseMuralStorage.upload).not.toHaveBeenCalled();
  });
});

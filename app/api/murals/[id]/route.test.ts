import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({
  selectMuralById: vi.fn(),
  updateMural: vi.fn(),
  insertMural: vi.fn(),
}));

vi.mock("@/lib/turnstile", () => ({
  verifyTurnstile: vi.fn(),
}));

const setPayloadMock = vi.fn();

vi.mock("@/lib/qdrant/client", () => ({
  getQdrantClient: vi.fn(() => ({
    setPayload: setPayloadMock,
  })),
  COLLECTION_NAME: "pilsen_murals",
}));

import { insertMural, selectMuralById, updateMural } from "@/lib/db/client";
import { verifyTurnstile } from "@/lib/turnstile";

const baseRow = {
  id: "mural-1",
  title: "Old Title",
  artist: "Old Artist",
  artist_instagram_handle: "oldartist",
  coordinates: [-87.65, 41.85] as [number, number],
  bearing: 0,
  dominant_color: "#333333",
  image_url: "/images/murals/mural-1.webp",
  thumbnail_url: "/images/murals/thumbs/mural-1-thumb.webp",
  image_metadata: null,
  source: "sync" as const,
  created_at: "2025-01-01T00:00:00.000Z",
};

describe("PATCH /api/murals/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyTurnstile).mockResolvedValue({ success: true, errorCodes: undefined });
    vi.mocked(updateMural).mockResolvedValue({
      ...baseRow,
      title: "Updated Title",
      artist_instagram_handle: "newhandle",
    });
  });

  it("hydrates a fallback mural into DB when id exists in static mural data", async () => {
    vi.mocked(selectMuralById).mockResolvedValueOnce(null);
    vi.mocked(insertMural).mockResolvedValueOnce(baseRow);

    const { PATCH } = await import("./route");
    const request = new Request("http://localhost/api/murals/mural-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        turnstileToken: "token",
        title: "Updated Title",
        artistInstagramHandle: "@newhandle",
      }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: "mural-1" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(insertMural).toHaveBeenCalledTimes(1);
    expect(updateMural).toHaveBeenCalledWith(
      "mural-1",
      expect.objectContaining({
        title: "Updated Title",
        artist_instagram_handle: "newhandle",
      }),
      null
    );
    expect(data).toMatchObject({
      id: "mural-1",
      title: "Updated Title",
      artistInstagramHandle: "newhandle",
    });
  });

  it("returns 404 when mural id is missing from DB and static mural data", async () => {
    vi.mocked(selectMuralById).mockResolvedValueOnce(null);

    const { PATCH } = await import("./route");
    const request = new Request("http://localhost/api/murals/not-a-real-id", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        turnstileToken: "token",
        title: "Updated Title",
      }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: "not-a-real-id" }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({ error: "Mural not found." });
    expect(insertMural).not.toHaveBeenCalled();
    expect(updateMural).not.toHaveBeenCalled();
  });
});

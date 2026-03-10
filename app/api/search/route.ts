import { NextResponse } from "next/server";
import { getQdrantClient, COLLECTION_NAME } from "@/lib/qdrant/client";
import { getImageEmbedding } from "@/lib/ai/embedding";
import { haversineDistanceMeters } from "@/lib/geo";

/** Return top N points (ungrouped) so client can show stack cards for same-mural duplicates. */
const SEARCH_LIMIT = 20;

/** Max proximity boost (added to visual score when user is at the mural). */
const PROXIMITY_BOOST_MAX = 0.12;
/** Distance (m) at which boost reaches zero (linear decay). */
const PROXIMITY_DECAY_M = 250;

function parseCoord(value: FormDataEntryValue | null): number | null {
  if (value == null || typeof value !== "string") return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Apply proximity boost to results when user location is available. Boost decays linearly
 * from PROXIMITY_BOOST_MAX at 0m to 0 at PROXIMITY_DECAY_M. Payload coordinates are [lng, lat].
 */
function applyProximityBoost(
  results: Array<{ id: string; score: number; payload: Record<string, unknown> }>,
  userCoords: [number, number]
): Array<{ id: string; score: number; payload: Record<string, unknown> }> {
  return results
    .map((r) => {
      const coords = r.payload?.coordinates;
      const muralCoords =
        Array.isArray(coords) && coords.length === 2 && coords.every(Number.isFinite)
          ? (coords as [number, number])
          : null;
      if (!muralCoords) return { ...r, score: r.score };
      const distM = haversineDistanceMeters(userCoords, muralCoords);
      const boost =
        distM < PROXIMITY_DECAY_M
          ? PROXIMITY_BOOST_MAX * (1 - distM / PROXIMITY_DECAY_M)
          : 0;
      return { ...r, score: Math.min(1, r.score + boost) };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * POST /api/search
 * Visual similarity search: accept an image (file upload or imageUrl), compute its CLIP
 * embedding, and query Qdrant for visually similar murals. Returns top SEARCH_LIMIT points
 * (ungrouped by mural id) so the client can show stack cards when multiple images match
 * the same mural. Each result has id = payload.id (mural id) for client-side grouping.
 * When optional lat/lng are provided (user location), results are re-ranked with a proximity
 * boost so murals near the user rank higher.
 *
 * Body: either
 * - FormData with "image" or "file" (image file), and optional "lat", "lng", or
 * - JSON { "imageUrl": "https://...", optional "lat", "lng" }
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let vector: number[];
    let userCoords: [number, number] | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("image") ?? formData.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "FormData must include an image file under 'image' or 'file'." },
          { status: 400 }
        );
      }
      vector = await getImageEmbedding(file);
      const lat = parseCoord(formData.get("lat"));
      const lng = parseCoord(formData.get("lng"));
      if (lat != null && lng != null) userCoords = [lng, lat];
    } else if (contentType.includes("application/json")) {
      const body = (await request.json()) as {
        imageUrl?: string;
        lat?: number;
        lng?: number;
      };
      const imageUrl = body?.imageUrl;
      if (typeof imageUrl !== "string" || !imageUrl) {
        return NextResponse.json(
          { error: "JSON body must include imageUrl." },
          { status: 400 }
        );
      }
      vector = await getImageEmbedding(imageUrl);
      const lat = body.lat != null && Number.isFinite(body.lat) ? body.lat : null;
      const lng = body.lng != null && Number.isFinite(body.lng) ? body.lng : null;
      if (lat != null && lng != null) userCoords = [lng, lat];
    } else {
      return NextResponse.json(
        {
          error:
            "Send either multipart/form-data with image file or application/json with imageUrl.",
        },
        { status: 400 }
      );
    }

    const client = getQdrantClient();
    const raw = await client.search(COLLECTION_NAME, {
      vector,
      limit: SEARCH_LIMIT,
      with_payload: true,
    });

    let results = raw.map((point) => {
      const payload = (point.payload ?? {}) as Record<string, unknown>;
      const muralId =
        typeof payload.id === "string" ? payload.id : String(point.id);
      return {
        id: muralId,
        score: point.score ?? 0,
        payload,
      };
    });

    if (userCoords) {
      results = applyProximityBoost(results, userCoords);
    }

    return NextResponse.json({ results }, { status: 200 });
  } catch (err) {
    console.error("POST /api/search error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 }
    );
  }
}

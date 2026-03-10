import { NextResponse } from "next/server";
import { getQdrantClient, COLLECTION_NAME } from "@/lib/qdrant/client";
import { getImageEmbedding } from "@/lib/ai/embedding";
import { groupByMuralId } from "@/lib/searchUtils";

const TOP_K = 3;
const SEARCH_LIMIT = 15;

/**
 * POST /api/search
 * Visual similarity search: accept an image (file upload or imageUrl), compute its CLIP
 * embedding, and query Qdrant for visually similar murals. Results are grouped by mural id
 * (payload.id) so each returned item is one mural with its best score. Same CLIP model and
 * collection config (512, Cosine) are used so query and indexed vectors are comparable.
 * Response score is similarity (higher = more similar for Cosine).
 *
 * Body: either
 * - FormData with field "image" or "file" (image file), or
 * - JSON { "imageUrl": "https://..." }
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let vector: number[];

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
    } else if (contentType.includes("application/json")) {
      const body = (await request.json()) as { imageUrl?: string };
      const imageUrl = body?.imageUrl;
      if (typeof imageUrl !== "string" || !imageUrl) {
        return NextResponse.json(
          { error: "JSON body must include imageUrl." },
          { status: 400 }
        );
      }
      vector = await getImageEmbedding(imageUrl);
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

    const results = groupByMuralId(
      raw.map((point) => ({
        id: point.id,
        score: point.score ?? 0,
        payload: point.payload ?? {},
      })),
      TOP_K
    );

    return NextResponse.json({ results }, { status: 200 });
  } catch (err) {
    console.error("POST /api/search error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 }
    );
  }
}

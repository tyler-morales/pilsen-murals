import { NextResponse } from "next/server";
import { getQdrantClient, COLLECTION_NAME } from "@/lib/qdrant/client";
import { getImageEmbedding } from "@/lib/ai/embedding";
import { selectAllMurals } from "@/lib/db/client";
import { muralRowToApp } from "@/lib/db/schema";

/**
 * GET /api/murals
 * Returns all murals from canonical DB (app shape). 503 if DB unavailable.
 */
export async function GET() {
  try {
    const rows = await selectAllMurals();
    const murals = rows.map(muralRowToApp);
    return NextResponse.json(murals, { status: 200 });
  } catch (err) {
    console.error("GET /api/murals error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Murals unavailable" },
      { status: 503 }
    );
  }
}

/**
 * POST /api/murals
 * Inserts a mural point in Qdrant. The vector is the CLIP image embedding; the payload
 * holds metadata for display and filtering. Point id is always a new UUID for FormData
 * (learning) flows; for JSON body it can be provided or generated.
 *
 * Body:
 * - FormData: "image" (file), optional "muralId" (string). If muralId is set, copies
 *   payload from an existing point with that payload.id and adds this image as another
 *   vector for that mural (learning). Otherwise creates a new point with source: "user_submission".
 * - JSON: id?, title?, artist?, coordinates?, imageUrl? or embedding? (512-d), ...rest
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let vector: number[];
    let payload: Record<string, unknown>;
    let pointId: string;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("image") ?? formData.get("file");
      const muralIdRaw = formData.get("muralId");
      const muralId =
        typeof muralIdRaw === "string" && muralIdRaw.trim()
          ? muralIdRaw.trim()
          : null;

      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "FormData must include an image file under 'image' or 'file'." },
          { status: 400 }
        );
      }
      vector = await getImageEmbedding(file);
      pointId = crypto.randomUUID();

      if (muralId) {
        const client = getQdrantClient();
        const scrollResult = await client.scroll(COLLECTION_NAME, {
          filter: {
            must: [{ key: "id", match: { value: muralId } }],
          },
          limit: 1,
          with_payload: true,
        });
        const points = scrollResult.points ?? [];
        const existing = points[0];
        if (existing?.payload && typeof existing.payload === "object") {
          payload = { ...(existing.payload as Record<string, unknown>) };
        } else {
          payload = { id: muralId, title: muralId, source: "user_submission" };
        }
      } else {
        payload = { source: "user_submission" };
      }
    } else {
      const body = (await request.json()) as {
        id?: string;
        title?: string;
        artist?: string;
        coordinates?: [number, number];
        imageUrl?: string;
        embedding?: number[];
        [key: string]: unknown;
      };
      const {
        id: providedId,
        title,
        artist,
        coordinates,
        imageUrl,
        embedding: providedEmbedding,
        ...rest
      } = body;

      if (Array.isArray(providedEmbedding) && providedEmbedding.length === 512) {
        vector = providedEmbedding;
      } else if (typeof imageUrl === "string" && imageUrl) {
        vector = await getImageEmbedding(imageUrl);
      } else {
        return NextResponse.json(
          {
            error:
              "Provide either embedding (512 numbers) or imageUrl to compute embedding.",
          },
          { status: 400 }
        );
      }

      pointId =
        typeof providedId === "string" && providedId ? providedId : crypto.randomUUID();
      payload = { ...rest };
      if (title !== undefined) payload.title = title;
      if (artist !== undefined) payload.artist = artist;
      if (coordinates !== undefined) payload.coordinates = coordinates;
      if (imageUrl !== undefined) payload.imageUrl = imageUrl;
    }

    const client = getQdrantClient();
    await client.upsert(COLLECTION_NAME, {
      points: [
        {
          id: pointId,
          vector,
          payload,
        },
      ],
    });

    return NextResponse.json({ id: pointId, ok: true }, { status: 201 });
  } catch (err) {
    console.error("POST /api/murals error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upsert failed" },
      { status: 500 }
    );
  }
}

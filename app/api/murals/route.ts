import { NextResponse } from "next/server";
import { getQdrantClient, COLLECTION_NAME } from "@/lib/qdrant/client";
import { getImageEmbedding } from "@/lib/ai/embedding";
import { selectAllMurals } from "@/lib/db/client";
import { muralRowToApp } from "@/lib/db/schema";
import { verifyTurnstile } from "@/lib/turnstile";

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
      { error: "We're having trouble loading murals right now. Please try again shortly." },
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
      const turnstileToken = formData.get("turnstileToken");
      const token =
        typeof turnstileToken === "string" && turnstileToken.trim()
          ? turnstileToken.trim()
          : null;
      if (!token) {
        return NextResponse.json(
          { error: "Missing or invalid turnstileToken." },
          { status: 400 }
        );
      }
      const forwarded = request.headers.get("x-forwarded-for");
      const remoteIp = forwarded?.split(",")[0]?.trim();
      const verify = await verifyTurnstile(token, remoteIp);
      if (!verify.success) {
        return NextResponse.json(
          { error: "Captcha verification failed.", errorCodes: verify.errorCodes },
          { status: 400 }
        );
      }

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
        turnstileToken?: string;
        id?: string;
        title?: string;
        artist?: string;
        coordinates?: [number, number];
        imageUrl?: string;
        embedding?: number[];
        [key: string]: unknown;
      };
      const token =
        typeof body.turnstileToken === "string" && body.turnstileToken.trim()
          ? body.turnstileToken.trim()
          : null;
      if (!token) {
        return NextResponse.json(
          { error: "Missing or invalid turnstileToken." },
          { status: 400 }
        );
      }
      const forwarded = request.headers.get("x-forwarded-for");
      const remoteIp = forwarded?.split(",")[0]?.trim();
      const verify = await verifyTurnstile(token, remoteIp);
      if (!verify.success) {
        return NextResponse.json(
          { error: "Captcha verification failed.", errorCodes: verify.errorCodes },
          { status: 400 }
        );
      }

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
      { error: "We couldn't save this photo. Please try again." },
      { status: 500 }
    );
  }
}

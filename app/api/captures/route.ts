/**
 * POST /api/captures
 * Discovery flow: authenticated user adds their photo of an existing mural to their collection.
 * Requires auth; verifies Turnstile; uploads image to user-photos bucket; upserts user_captures; runs Qdrant learning.
 *
 * FormData: turnstileToken (required), image (file), muralId (required). Optional: lat, lng (for distance).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseClient } from "@/lib/db/client";
import { getQdrantClient, COLLECTION_NAME } from "@/lib/qdrant/client";
import { getImageEmbedding } from "@/lib/ai/embedding";
import { processUploadedImage } from "@/lib/upload/processImage";
import { verifyTurnstile } from "@/lib/turnstile";

const USER_PHOTOS_BUCKET = "user-photos";
const USER_CAPTURES_TABLE = "user_captures";
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

function parseCoord(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "string" ? parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "You must be signed in to add a mural to your collection." },
        { status: 401 }
      );
    }
    const userId = user.id;

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Content-Type must be multipart/form-data." },
        { status: 400 }
      );
    }

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
        {
          error: "Captcha verification failed.",
          errorCodes: verify.errorCodes,
        },
        { status: 400 }
      );
    }

    const muralIdRaw = formData.get("muralId");
    const muralId =
      typeof muralIdRaw === "string" && muralIdRaw.trim() ? muralIdRaw.trim() : null;
    if (!muralId) {
      return NextResponse.json(
        { error: "FormData must include muralId." },
        { status: 400 }
      );
    }

    const file = formData.get("image") ?? formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "FormData must include an image file under 'image' or 'file'." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Image is too large. Maximum size is 5 MB." },
        { status: 413 }
      );
    }

    const processed = await processUploadedImage(buffer);
    const storagePath = `${userId}/${muralId}.webp`;

    const supabase = getSupabaseClient();
    const { error: uploadError } = await supabase.storage
      .from(USER_PHOTOS_BUCKET)
      .upload(storagePath, processed.displayBuffer, {
        contentType: "image/webp",
        upsert: true,
      });
    if (uploadError) {
      console.error("POST /api/captures upload error:", uploadError);
      return NextResponse.json(
        { error: "We couldn't save your photo. Please try again." },
        { status: 500 }
      );
    }

    const lat = parseCoord(formData.get("lat"));
    const lng = parseCoord(formData.get("lng"));
    const capturedAt = new Date().toISOString();

    type UserCaptureUpsert = {
      user_id: string;
      mural_id: string;
      captured_at: string;
      lat: number | null;
      lng: number | null;
      distance_meters: number | null;
      photo_url: string;
    };

    const { error: upsertError } = await supabase
      .from(USER_CAPTURES_TABLE)
      .upsert(
        {
          user_id: userId,
          mural_id: muralId,
          captured_at: capturedAt,
          lat: lat ?? null,
          lng: lng ?? null,
          distance_meters: null,
          photo_url: storagePath,
        } as UserCaptureUpsert,
        { onConflict: "user_id,mural_id" }
      );
    if (upsertError) {
      console.error("POST /api/captures upsert error:", upsertError);
      return NextResponse.json(
        { error: "We couldn't save your capture. Please try again." },
        { status: 500 }
      );
    }

    try {
      const vector = await getImageEmbedding(new Blob([processed.displayBuffer]));
      const qdrant = getQdrantClient();
      const scrollResult = await qdrant.scroll(COLLECTION_NAME, {
        filter: {
          must: [{ key: "id", match: { value: muralId } }],
        },
        limit: 1,
        with_payload: true,
      });
      const points = scrollResult.points ?? [];
      const existing = points[0];
      const payload =
        existing?.payload && typeof existing.payload === "object"
          ? { ...(existing.payload as Record<string, unknown>) }
          : { id: muralId, title: muralId, source: "user_submission" };
      await qdrant.upsert(COLLECTION_NAME, {
        points: [
          {
            id: crypto.randomUUID(),
            vector,
            payload,
          },
        ],
      });
    } catch (qdrantErr) {
      console.debug("POST /api/captures Qdrant learning (best-effort) failed:", qdrantErr);
    }

    return NextResponse.json(
      { ok: true, photoUrl: storagePath },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/captures error:", err);
    return NextResponse.json(
      { error: "We couldn't add this to your collection. Please try again." },
      { status: 500 }
    );
  }
}

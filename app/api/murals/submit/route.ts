/**
 * POST /api/murals/submit
 * Community submission: Turnstile-verified multipart upload. Processes image to WebP,
 * uploads to storage, inserts canonical mural in DB, and upserts embedding into Qdrant.
 *
 * FormData: turnstileToken (required), image (file), lat, lng (required), optional title, artist, dateCaptured (ISO), datePainted (YYYY-MM-DD).
 */
import { NextResponse } from "next/server";
import { getQdrantClient, COLLECTION_NAME } from "@/lib/qdrant/client";
import { getImageEmbedding } from "@/lib/ai/embedding";
import { insertMural } from "@/lib/db/client";
import { supabaseMuralStorage } from "@/lib/storage/supabase";
import { processUploadedImage } from "@/lib/upload/processImage";
import { verifyTurnstile } from "@/lib/turnstile";

const FALLBACK_TITLE = "Community Mural";
const FALLBACK_ARTIST = "Unknown Artist";
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

function parseCoord(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "string" ? parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseDateCaptured(value: unknown): string {
  if (value == null || typeof value !== "string" || !value.trim()) return new Date().toISOString();
  const trimmed = value.trim();
  const date = new Date(trimmed);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

export function parseDatePainted(value: unknown): string | null {
  if (value == null || typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(parseInt(y!, 10), parseInt(m!, 10) - 1, parseInt(d!, 10));
  return Number.isFinite(date.getTime()) ? trimmed : null;
}

export async function POST(request: Request) {
  try {
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

    const [displayResult, thumbResult] = await Promise.all([
      supabaseMuralStorage.upload("murals/display", processed.displayBuffer, "image/webp"),
      supabaseMuralStorage.upload("murals/thumbnails", processed.thumbBuffer, "image/webp"),
    ]);

    const lat = parseCoord(formData.get("lat"));
    const lng = parseCoord(formData.get("lng"));
    if (lat == null || lng == null) {
      return NextResponse.json(
        { error: "Location is required to add a mural. Please allow location access and try again." },
        { status: 400 }
      );
    }
    const coordinates: [number, number] = [lng, lat];

    const titleRaw = formData.get("title");
    const artistRaw = formData.get("artist");
    const title =
      (typeof titleRaw === "string" && titleRaw.trim() !== "" ? titleRaw.trim() : null) ||
      FALLBACK_TITLE;
    const artist =
      (typeof artistRaw === "string" && artistRaw.trim() !== "" ? artistRaw.trim() : null) ||
      FALLBACK_ARTIST;

    const dateCaptured = parseDateCaptured(formData.get("dateCaptured"));
    const datePainted = parseDatePainted(formData.get("datePainted"));

    const muralId = crypto.randomUUID();

    await insertMural({
      id: muralId,
      title,
      artist,
      coordinates,
      bearing: null,
      dominant_color: processed.dominantColor,
      image_url: displayResult.url,
      thumbnail_url: thumbResult.url,
      image_metadata: processed.imageMetadata ?? null,
      source: "user_submission",
      date_captured: dateCaptured,
      date_painted: datePainted,
    });

    const vector = await getImageEmbedding(displayResult.url);
    const client = getQdrantClient();
    await client.upsert(COLLECTION_NAME, {
      points: [
        {
          id: muralId,
          vector,
          payload: {
            id: muralId,
            title,
            artist,
            coordinates,
            imageUrl: displayResult.url,
            thumbnail: thumbResult.url,
            dominantColor: processed.dominantColor,
            imageMetadata: processed.imageMetadata ?? undefined,
            source: "user_submission",
          },
        },
      ],
    });

    return NextResponse.json(
      {
        id: muralId,
        ok: true,
        mural: {
          id: muralId,
          title,
          artist,
          coordinates,
          dominantColor: processed.dominantColor,
          imageUrl: displayResult.url,
          thumbnail: thumbResult.url,
          dateCaptured,
          datePainted,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/murals/submit error:", err);
    return NextResponse.json(
      { error: "We couldn't add this mural right now. Please try again shortly." },
      { status: 500 }
    );
  }
}

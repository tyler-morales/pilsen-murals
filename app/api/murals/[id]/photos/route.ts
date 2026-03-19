/**
 * GET /api/murals/[id]/photos — community timeline photos for a mural (oldest first).
 * POST /api/murals/[id]/photos — Turnstile-protected upload; adds photo to timeline.
 */
import { NextResponse } from "next/server";
import {
  getCommunityImages,
  insertCommunityImage,
  selectMuralById,
} from "@/lib/db/client";
import { supabaseMuralStorage } from "@/lib/storage/supabase";
import { processUploadedImage } from "@/lib/upload/processImage";
import { verifyTurnstile } from "@/lib/turnstile";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: muralId } = await params;
    if (!muralId?.trim()) {
      return NextResponse.json({ error: "Mural ID required." }, { status: 400 });
    }
    const rows = await getCommunityImages(muralId.trim());
    const photos = rows.map((r) => ({
      id: r.id,
      imageUrl: r.image_url,
      thumbnailUrl: r.thumbnail_url ?? r.image_url,
      createdAt: r.created_at,
    }));
    return NextResponse.json({ photos }, { status: 200 });
  } catch (err) {
    console.error("GET /api/murals/[id]/photos error:", err);
    return NextResponse.json(
      { error: "We couldn't load photos right now. Please try again shortly." },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: muralId } = await params;
    if (!muralId?.trim()) {
      return NextResponse.json({ error: "Mural ID required." }, { status: 400 });
    }
    const existing = await selectMuralById(muralId.trim());
    if (!existing) {
      return NextResponse.json({ error: "Mural not found." }, { status: 404 });
    }

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
        {
          error: "FormData must include an image file under 'image' or 'file'.",
        },
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
      supabaseMuralStorage.upload(
        "murals/community/display",
        processed.displayBuffer,
        "image/webp"
      ),
      supabaseMuralStorage.upload(
        "murals/community/thumbnails",
        processed.thumbBuffer,
        "image/webp"
      ),
    ]);

    const row = await insertCommunityImage({
      mural_id: muralId.trim(),
      user_id: null,
      image_url: displayResult.url,
      thumbnail_url: thumbResult.url,
    });

    return NextResponse.json(
      {
        id: row.id,
        imageUrl: row.image_url,
        thumbnailUrl: row.thumbnail_url ?? row.image_url,
        createdAt: row.created_at,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/murals/[id]/photos error:", err);
    return NextResponse.json(
      { error: "We couldn't add this photo right now. Please try again shortly." },
      { status: 500 }
    );
  }
}

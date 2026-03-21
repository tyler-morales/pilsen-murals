/**
 * PATCH /api/murals/[id]/image
 * Re-crop/update mural image. FormData: image (file), turnstileToken.
 * Processes image to WebP, uploads to storage, re-extracts dominant color,
 * updates DB and Qdrant payload.
 */
import { NextResponse } from "next/server";
import { selectMuralById, updateMural } from "@/lib/db/client";
import { muralRowToApp } from "@/lib/db/schema";
import { verifyTurnstile } from "@/lib/turnstile";
import { getQdrantClient, COLLECTION_NAME } from "@/lib/qdrant/client";
import { createHash } from "crypto";
import { supabaseMuralStorage } from "@/lib/storage/supabase";
import { processUploadedImage } from "@/lib/upload/processImage";
import sharp from "sharp";

function hashIp(ip: string | undefined): string | null {
  if (!ip?.trim()) return null;
  return createHash("sha256").update(ip.trim()).digest("hex").slice(0, 32);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json({ error: "Mural ID is required." }, { status: 400 });
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

    const existing = await selectMuralById(id);
    if (!existing) {
      return NextResponse.json({ error: "Mural not found." }, { status: 404 });
    }

    const file = formData.get("image") ?? formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "FormData must include an image file under 'image' or 'file'." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const processed = await processUploadedImage(buffer);

    const [displayResult, thumbResult] = await Promise.all([
      supabaseMuralStorage.upload("murals/display", processed.displayBuffer, "image/webp"),
      supabaseMuralStorage.upload("murals/thumbnails", processed.thumbBuffer, "image/webp"),
    ]);

    // Extract dimensions from processed display image to update metadata
    let updatedMetadata: Record<string, string> | null = null;
    try {
      const displayMeta = await sharp(processed.displayBuffer).metadata();
      if (displayMeta.width != null && displayMeta.height != null) {
        updatedMetadata = {
          ...(existing.image_metadata ?? {}),
          Width: String(displayMeta.width),
          Height: String(displayMeta.height),
        };
      }
    } catch {
      // If metadata extraction fails, keep existing metadata unchanged
    }

    const ipHash = hashIp(remoteIp);
    const updateFields: Parameters<typeof updateMural>[1] = {
      image_url: displayResult.url,
      thumbnail_url: thumbResult.url,
      dominant_color: processed.dominantColor,
    };
    if (updatedMetadata != null) {
      updateFields.image_metadata = updatedMetadata;
    }

    const updated = await updateMural(id, updateFields, ipHash);

    try {
      const qdrant = getQdrantClient();
      await qdrant.setPayload(COLLECTION_NAME, {
        filter: { must: [{ key: "id", match: { value: id } }] },
        payload: {
          imageUrl: displayResult.url,
          thumbnail: thumbResult.url,
          dominantColor: processed.dominantColor,
        },
      });
    } catch (qdrantErr) {
      console.error("PATCH /api/murals/[id]/image Qdrant setPayload error:", qdrantErr);
    }

    return NextResponse.json(muralRowToApp(updated), { status: 200 });
  } catch (err) {
    console.error("PATCH /api/murals/[id]/image error:", err);
    return NextResponse.json(
      { error: "We couldn't save the new image. Please try again." },
      { status: 500 }
    );
  }
}

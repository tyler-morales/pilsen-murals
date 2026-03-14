/**
 * PATCH /api/murals/[id]
 * Update mural editable fields (title, artist, artistInstagramHandle). Turnstile required.
 * Writes audit rows to mural_edits; syncs title/artist to Qdrant payload for search.
 */
import { NextResponse } from "next/server";
import { updateMural, selectMuralById } from "@/lib/db/client";
import { muralRowToApp } from "@/lib/db/schema";
import { verifyTurnstile } from "@/lib/turnstile";
import { getQdrantClient, COLLECTION_NAME } from "@/lib/qdrant/client";
import { createHash } from "crypto";

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
    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        { error: "Content-Type must be application/json." },
        { status: 400 }
      );
    }

    const body = (await request.json()) as {
      turnstileToken?: string;
      title?: string;
      artist?: string;
      artistInstagramHandle?: string | null;
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

    const fields: Parameters<typeof updateMural>[1] = {};
    if (typeof body.title === "string") {
      const v = body.title.trim();
      if (v) fields.title = v;
    }
    if (typeof body.artist === "string") {
      const v = body.artist.trim();
      if (v) fields.artist = v;
    }
    if (body.artistInstagramHandle !== undefined) {
      fields.artist_instagram_handle =
        typeof body.artistInstagramHandle === "string" && body.artistInstagramHandle.trim()
          ? body.artistInstagramHandle.trim().replace(/^@/, "")
          : null;
    }

    if (Object.keys(fields).length === 0) {
      const row = await selectMuralById(id);
      return NextResponse.json(muralRowToApp(row!), { status: 200 });
    }

    const ipHash = hashIp(remoteIp);
    const updated = await updateMural(id, fields, ipHash);

    const payloadUpdate: Record<string, string> = {};
    if (fields.title !== undefined) payloadUpdate.title = fields.title;
    if (fields.artist !== undefined) payloadUpdate.artist = fields.artist;
    if (fields.artist_instagram_handle !== undefined) {
      payloadUpdate.artistInstagramHandle = fields.artist_instagram_handle ?? "";
    }
    if (Object.keys(payloadUpdate).length > 0) {
      try {
        const qdrant = getQdrantClient();
        await qdrant.setPayload(COLLECTION_NAME, {
          filter: { must: [{ key: "id", match: { value: id } }] },
          payload: payloadUpdate,
        });
      } catch (qdrantErr) {
        console.error("PATCH /api/murals/[id] Qdrant setPayload error:", qdrantErr);
        // DB and audit are already updated; search may show stale title/artist until next backfill
      }
    }

    return NextResponse.json(muralRowToApp(updated), { status: 200 });
  } catch (err) {
    console.error("PATCH /api/murals/[id] error:", err);
    return NextResponse.json(
      { error: "We couldn't save your changes. Please try again." },
      { status: 500 }
    );
  }
}

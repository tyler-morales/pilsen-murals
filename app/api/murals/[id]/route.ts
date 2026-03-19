/**
 * PATCH /api/murals/[id]
 * Update mural editable fields (title, artist, artistInstagramHandle). Turnstile required.
 * Writes audit rows to mural_edits; syncs title/artist to Qdrant payload for search.
 */
import { NextResponse } from "next/server";
import {
  insertMural,
  updateMural,
  selectMuralById,
  getArtistById,
  findOrCreateArtist,
} from "@/lib/db/client";
import { muralRowToApp } from "@/lib/db/schema";
import { verifyTurnstile } from "@/lib/turnstile";
import { getQdrantClient, COLLECTION_NAME } from "@/lib/qdrant/client";
import { createHash } from "crypto";
import fallbackMuralsJson from "@/data/murals.json";

function hashIp(ip: string | undefined): string | null {
  if (!ip?.trim()) return null;
  return createHash("sha256").update(ip.trim()).digest("hex").slice(0, 32);
}

async function hydrateFallbackMural(id: string) {
  const fallbackMurals = fallbackMuralsJson as unknown as Array<{
    id: string;
    title: string;
    artist: string;
    artistInstagramHandle?: string;
    coordinates: number[];
    bearing?: number;
    dominantColor: string;
    imageUrl: string;
    thumbnail?: string;
    imageMetadata?: Record<string, string>;
  }>;
  const fallbackMural = fallbackMurals.find((mural) => mural.id === id);
  if (!fallbackMural) return null;
  if (!Array.isArray(fallbackMural.coordinates)) return null;
  const [lng, lat] = fallbackMural.coordinates;
  const hasValidCoords =
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90;
  if (!hasValidCoords) return null;
  return insertMural({
    id: fallbackMural.id,
    title: fallbackMural.title,
    artist: fallbackMural.artist,
    artist_instagram_handle: fallbackMural.artistInstagramHandle ?? null,
    coordinates: [lng, lat],
    bearing: fallbackMural.bearing ?? null,
    dominant_color: fallbackMural.dominantColor,
    image_url: fallbackMural.imageUrl,
    thumbnail_url: fallbackMural.thumbnail ?? null,
    image_metadata: fallbackMural.imageMetadata ?? null,
    source: "sync",
  });
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
      artistId?: string | null;
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

    let existing = await selectMuralById(id);
    if (!existing) {
      existing = await hydrateFallbackMural(id);
      if (!existing) {
        return NextResponse.json({ error: "Mural not found." }, { status: 404 });
      }
    }

    const MAX_TITLE_ARTIST_LEN = 200;
    const MAX_HANDLE_LEN = 100;
    const fields: Parameters<typeof updateMural>[1] = {};
    if (typeof body.title === "string") {
      const v = body.title.trim().slice(0, MAX_TITLE_ARTIST_LEN);
      if (v) fields.title = v;
    }
    if (body.artistId !== undefined) {
      if (body.artistId == null || body.artistId === "") {
        fields.artist_id = null;
        fields.artist = "Unknown Artist";
      } else {
        const artistRow = await getArtistById(body.artistId);
        if (artistRow) {
          fields.artist_id = artistRow.id;
          fields.artist = artistRow.name;
        }
      }
    } else if (typeof body.artist === "string") {
      const v = body.artist.trim().slice(0, MAX_TITLE_ARTIST_LEN);
      if (v) {
        const artistRow = await findOrCreateArtist(
          v,
          body.artistInstagramHandle ?? existing.artist_instagram_handle
        );
        fields.artist_id = artistRow.id;
        fields.artist = artistRow.name;
      }
    }
    if (body.artistInstagramHandle !== undefined) {
      fields.artist_instagram_handle =
        typeof body.artistInstagramHandle === "string" && body.artistInstagramHandle.trim()
          ? body.artistInstagramHandle.trim().replace(/^@/, "").slice(0, MAX_HANDLE_LEN)
          : null;
    }

    if (Object.keys(fields).length === 0) {
      return NextResponse.json(muralRowToApp(existing), { status: 200 });
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

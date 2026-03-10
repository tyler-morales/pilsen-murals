/**
 * Backfill Qdrant with murals from data/murals.json.
 * Reads each mural's image from public/ (or from BASE_URL when set) and passes a Blob or URL
 * to the embedding so Xenova never sees file:// (which it cannot fetch in Node).
 *
 * Run from project root: npm run backfill-qdrant
 * Requires .env.local with QDRANT_URL and QDRANT_API_KEY.
 *
 * Optional: BASE_URL (e.g. http://localhost:3000) to fetch images via HTTP instead of reading from disk.
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config({ path: ".env.local" });

import { getQdrantClient, COLLECTION_NAME } from "../lib/qdrant/client";
import { getImageEmbedding } from "../lib/ai/embedding";

const MURALS_JSON = path.join(process.cwd(), "data", "murals.json");

interface MuralRecord {
  id: string;
  title?: string;
  artist?: string;
  coordinates?: [number, number];
  imageUrl?: string;
  thumbnail?: string;
  dominantColor?: string;
  bearing?: number;
  image?: string;
  originalFile?: string;
  imageMetadata?: Record<string, string>;
  [key: string]: unknown;
}

/** MIME type from extension for Blob. */
function mimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".webp") return "image/webp";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "image/webp";
}

/**
 * Resolve mural image to either a URL string (when BASE_URL set or imageUrl is absolute)
 * or a Blob (when reading from public/). Xenova cannot read file:// in Node, so we pass Blob.
 */
function resolveImageSource(
  mural: MuralRecord
): { type: "url"; url: string } | { type: "blob"; blob: Blob } {
  const imageUrl = mural.imageUrl ?? mural.image;
  if (!imageUrl || typeof imageUrl !== "string") {
    throw new Error(`Mural ${mural.id} has no imageUrl or image`);
  }
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return { type: "url", url: imageUrl };
  }
  const baseUrl = process.env.BASE_URL;
  if (baseUrl) {
    const url = baseUrl.replace(/\/$/, "") + (imageUrl.startsWith("/") ? imageUrl : "/" + imageUrl);
    return { type: "url", url };
  }
  const absolutePath = path.join(process.cwd(), "public", imageUrl.replace(/^\//, ""));
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Mural ${mural.id}: file not found ${absolutePath}`);
  }
  const buffer = fs.readFileSync(absolutePath);
  const blob = new Blob([buffer], { type: mimeFromPath(absolutePath) });
  return { type: "blob", blob };
}

function payloadFromMural(mural: MuralRecord): Record<string, unknown> {
  const { imageMetadata, ...rest } = mural;
  const payload: Record<string, unknown> = { ...rest };
  if (imageMetadata && Object.keys(imageMetadata).length > 0) {
    payload.imageMetadata = imageMetadata;
  }
  return payload;
}

/** Qdrant point IDs must be unsigned integer or UUID. Derive integer from mural id (e.g. mural-25 → 25). */
function qdrantPointId(muralId: string, index: number): number {
  const match = muralId.match(/^mural-(\d+)$/);
  if (match) return parseInt(match[1], 10);
  return index + 1;
}

async function main() {
  if (!fs.existsSync(MURALS_JSON)) {
    console.error(`Not found: ${MURALS_JSON}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(MURALS_JSON, "utf-8");
  const murals: MuralRecord[] = JSON.parse(raw);
  if (!Array.isArray(murals) || murals.length === 0) {
    console.log("No murals in data/murals.json");
    return;
  }

  const client = getQdrantClient();
  let ok = 0;
  let fail = 0;

  for (let i = 0; i < murals.length; i++) {
    const mural = murals[i];
    try {
      const source = resolveImageSource(mural);
      const vector =
        source.type === "url"
          ? await getImageEmbedding(source.url)
          : await getImageEmbedding(source.blob);
      const payload = payloadFromMural(mural);
      const pointId = qdrantPointId(mural.id, i);
      await client.upsert(COLLECTION_NAME, {
        points: [
          {
            id: pointId,
            vector,
            payload,
          },
        ],
      });
      ok++;
      console.log(`[${i + 1}/${murals.length}] ${mural.id}`);
    } catch (err) {
      fail++;
      console.error(`[${i + 1}/${murals.length}] ${mural.id} failed:`, err);
    }
  }

  console.log(`Done. OK: ${ok}, Failed: ${fail}`);
  if (fail > 0) process.exit(1);
}

main();

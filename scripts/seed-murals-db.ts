/**
 * Seed Supabase murals table from data/murals.json.
 * Uses upsert on id so re-runs are idempotent; existing rows get updated, new rows inserted.
 *
 * Run from project root: npm run seed-murals-db
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config({ path: ".env.local" });

import type { MuralInsert } from "../lib/db/schema";

const MURALS_JSON = path.join(process.cwd(), "data", "murals.json");

interface JsonMural {
  id: string;
  title?: string;
  artist?: string;
  artistInstagramHandle?: string;
  coordinates: [number, number];
  bearing?: number;
  dominantColor?: string;
  imageUrl: string;
  thumbnail?: string;
  imageMetadata?: Record<string, string>;
  [key: string]: unknown;
}

function jsonToInsert(m: JsonMural): MuralInsert {
  const coords = m.coordinates;
  if (!Array.isArray(coords) || coords.length !== 2 || typeof coords[0] !== "number" || typeof coords[1] !== "number") {
    throw new Error(`Invalid coordinates for mural ${m.id}: ${JSON.stringify(coords)}`);
  }
  return {
    id: m.id,
    title: m.title ?? "Untitled Mural",
    artist: m.artist ?? "Unknown Artist",
    ...(m.artistInstagramHandle && { artist_instagram_handle: m.artistInstagramHandle }),
    coordinates: [coords[0], coords[1]],
    bearing: m.bearing ?? null,
    dominant_color: m.dominantColor ?? "#333333",
    image_url: m.imageUrl,
    thumbnail_url: m.thumbnail ?? null,
    image_metadata: m.imageMetadata ?? null,
    source: "sync",
  };
}

async function main(): Promise<void> {
  const { upsertMurals } = await import("../lib/db/client");
  const raw = fs.readFileSync(MURALS_JSON, "utf-8");
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    console.error("No murals array in data/murals.json");
    process.exit(1);
  }
  const rows: MuralInsert[] = parsed.map((m) => jsonToInsert(m as JsonMural));
  await upsertMurals(rows);
  console.log(`Upserted ${rows.length} murals into Supabase.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

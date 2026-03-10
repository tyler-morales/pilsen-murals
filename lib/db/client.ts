/**
 * Supabase client for server-side DB access. Use for murals table and service role operations.
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.
 */
import { createClient } from "@supabase/supabase-js";
import type { MuralRow, MuralInsert } from "./schema";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let client: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient(): ReturnType<typeof createClient> {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment"
    );
  }
  if (!client) {
    client = createClient(supabaseUrl, supabaseServiceKey);
  }
  return client;
}

const MURALS_TABLE = "murals";

export async function insertMural(row: MuralInsert): Promise<MuralRow> {
  const supabase = getSupabaseClient();
  const payload = {
    id: row.id,
    title: row.title,
    artist: row.artist,
    artist_instagram_handle: row.artist_instagram_handle ?? null,
    coordinates: row.coordinates,
    bearing: row.bearing ?? null,
    dominant_color: row.dominant_color,
    image_url: row.image_url,
    thumbnail_url: row.thumbnail_url ?? null,
    image_metadata: row.image_metadata ?? null,
    source: row.source,
  };
  const { data, error } = await supabase
    .from(MURALS_TABLE)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- no generated DB types for murals table
    .insert(payload as any)
    .select()
    .single();

  if (error) throw error;
  return data as MuralRow;
}

const UPSERT_BATCH_SIZE = 100;

/** Upsert murals by id (for seed script). Preserves created_at on existing rows. */
export async function upsertMurals(rows: MuralInsert[]): Promise<void> {
  if (rows.length === 0) return;
  const supabase = getSupabaseClient();
  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE).map((row) => ({
      id: row.id,
      title: row.title,
      artist: row.artist,
      artist_instagram_handle: row.artist_instagram_handle ?? null,
      coordinates: row.coordinates,
      bearing: row.bearing ?? null,
      dominant_color: row.dominant_color,
      image_url: row.image_url,
      thumbnail_url: row.thumbnail_url ?? null,
      image_metadata: row.image_metadata ?? null,
      source: row.source,
    }));
    const { error } = await supabase
      .from(MURALS_TABLE)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- no generated DB types
      .upsert(batch as any, { onConflict: "id" });
    if (error) throw error;
  }
}

export async function selectAllMurals(): Promise<MuralRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(MURALS_TABLE)
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as MuralRow[];
}

export async function selectMuralById(id: string): Promise<MuralRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(MURALS_TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data as MuralRow | null;
}

/**
 * Supabase client for server-side DB access. Use for murals table and service role operations.
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.
 */
import { createClient } from "@supabase/supabase-js";
import type { MuralRow, MuralInsert, MuralEditRow } from "./schema";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let client: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient(): ReturnType<typeof createClient> {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment"
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

const MURAL_EDITS_TABLE = "mural_edits";

export type MuralUpdateFields = Partial<{
  title: string;
  artist: string;
  artist_instagram_handle: string | null;
  description: string | null;
  year_painted: number | null;
  image_url: string;
  thumbnail_url: string | null;
  dominant_color: string;
}>;

/**
 * Update mural editable fields and append audit rows to mural_edits.
 * Only provided fields that differ from current row are updated and logged.
 */
export async function updateMural(
  id: string,
  fields: MuralUpdateFields,
  ipHash?: string | null
): Promise<MuralRow> {
  const supabase = getSupabaseClient();
  const existing = await selectMuralById(id);
  if (!existing) {
    throw new Error(`Mural not found: ${id}`);
  }

  const fieldToColumn: Record<string, keyof MuralRow> = {
    title: "title",
    artist: "artist",
    artist_instagram_handle: "artist_instagram_handle",
    description: "description",
    year_painted: "year_painted",
    image_url: "image_url",
    thumbnail_url: "thumbnail_url",
    dominant_color: "dominant_color",
  };

  const updates: Partial<MuralRow> = {};
  const editRows: { field_name: string; old_value: string | null; new_value: string | null }[] = [];

  for (const [key, column] of Object.entries(fieldToColumn)) {
    if (!(key in fields)) continue;
    const newVal = fields[key as keyof MuralUpdateFields];
    const oldVal = existing[column];
    const oldStr = oldVal == null ? null : String(oldVal);
    const newStr = newVal == null ? null : String(newVal);
    if (oldStr === newStr) continue;
    (updates as Record<string, unknown>)[column] = newVal;
    editRows.push({ field_name: key, old_value: oldStr, new_value: newStr });
  }

  if (editRows.length === 0) {
    return existing;
  }

  // Supabase client has no generated types; .update() expects Table type and infers never
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain = supabase.from(MURALS_TABLE) as any;
  const { data: updated, error: updateError } = await chain
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (updateError) throw updateError;

  const editInserts = editRows.map((r) => ({
    mural_id: id,
    field_name: r.field_name,
    old_value: r.old_value,
    new_value: r.new_value,
    ip_hash: ipHash ?? null,
  }));

  const { error: insertError } = await supabase
    .from(MURAL_EDITS_TABLE)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- no generated DB types for mural_edits
    .insert(editInserts as any);

  if (insertError) throw insertError;

  return updated as MuralRow;
}

/**
 * Fetch edit history for a mural (for future "edit history" UI).
 */
export async function getMuralEditHistory(id: string): Promise<MuralEditRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(MURAL_EDITS_TABLE)
    .select("*")
    .eq("mural_id", id)
    .order("edited_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as MuralEditRow[];
}

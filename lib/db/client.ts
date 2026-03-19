/**
 * Supabase client for server-side DB access. Use for murals table and service role operations.
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.
 */
import { createClient } from "@supabase/supabase-js";
import type {
  MuralRow,
  MuralInsert,
  MuralEditRow,
  MuralCommunityImageRow,
  MuralCommunityImageInsert,
  ArtistRow,
  ArtistInsert,
} from "./schema";

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
const ARTISTS_TABLE = "artists";

export async function insertMural(row: MuralInsert): Promise<MuralRow> {
  const supabase = getSupabaseClient();
  const payload = {
    id: row.id,
    title: row.title,
    artist: row.artist,
    artist_id: row.artist_id ?? null,
    artist_instagram_handle: row.artist_instagram_handle ?? null,
    coordinates: row.coordinates,
    bearing: row.bearing ?? null,
    dominant_color: row.dominant_color,
    image_url: row.image_url,
    thumbnail_url: row.thumbnail_url ?? null,
    image_metadata: row.image_metadata ?? null,
    source: row.source,
    ...(row.date_captured != null && { date_captured: row.date_captured }),
    ...(row.date_painted != null && { date_painted: row.date_painted }),
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
      artist_id: row.artist_id ?? null,
      artist_instagram_handle: row.artist_instagram_handle ?? null,
      coordinates: row.coordinates,
      bearing: row.bearing ?? null,
      dominant_color: row.dominant_color,
      image_url: row.image_url,
      thumbnail_url: row.thumbnail_url ?? null,
      image_metadata: row.image_metadata ?? null,
      source: row.source,
      ...(row.date_captured != null && { date_captured: row.date_captured }),
      ...(row.date_painted != null && { date_painted: row.date_painted }),
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
  artist_id: string | null;
  artist_instagram_handle: string | null;
  description: string | null;
  year_painted: number | null;
  date_captured: string;
  date_painted: string | null;
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
    artist_id: "artist_id",
    artist_instagram_handle: "artist_instagram_handle",
    description: "description",
    year_painted: "year_painted",
    date_captured: "date_captured",
    date_painted: "date_painted",
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

const MURAL_COMMUNITY_IMAGES_TABLE = "mural_community_images";

export async function insertCommunityImage(
  row: MuralCommunityImageInsert
): Promise<MuralCommunityImageRow> {
  const supabase = getSupabaseClient();
  const payload = {
    mural_id: row.mural_id,
    user_id: row.user_id ?? null,
    image_url: row.image_url,
    thumbnail_url: row.thumbnail_url ?? null,
  };
  const { data, error } = await supabase
    .from(MURAL_COMMUNITY_IMAGES_TABLE)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- no generated DB types
    .insert(payload as any)
    .select()
    .single();

  if (error) throw error;
  return data as MuralCommunityImageRow;
}

export async function getCommunityImages(
  muralId: string
): Promise<MuralCommunityImageRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(MURAL_COMMUNITY_IMAGES_TABLE)
    .select("*")
    .eq("mural_id", muralId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as MuralCommunityImageRow[];
}

// --- Artists ---

const ARTISTS_SEARCH_LIMIT = 10;

/** Search artists by name (case-insensitive ilike). For autocomplete. */
export async function searchArtists(query: string): Promise<ArtistRow[]> {
  const q = query.trim();
  if (!q) return [];
  const supabase = getSupabaseClient();
  const pattern = `%${q.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
  const { data, error } = await supabase
    .from(ARTISTS_TABLE)
    .select("*")
    .ilike("name", pattern)
    .order("name", { ascending: true })
    .limit(ARTISTS_SEARCH_LIMIT);

  if (error) throw error;
  return (data ?? []) as ArtistRow[];
}

/** Get artist by id. */
export async function getArtistById(id: string): Promise<ArtistRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(ARTISTS_TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data as ArtistRow | null;
}

/** Find artist by exact name (case-insensitive) or create one. Returns the artist row. */
export async function findOrCreateArtist(
  name: string,
  instagramHandle?: string | null
): Promise<ArtistRow> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Artist name cannot be empty");
  }
  const supabase = getSupabaseClient();
  const { data: existing, error: findError } = await supabase
    .from(ARTISTS_TABLE)
    .select("*")
    .ilike("name", trimmed)
    .limit(1)
    .maybeSingle();

  if (findError) throw findError;
  if (existing) {
    return existing as ArtistRow;
  }

  const insert: ArtistInsert = { name: trimmed };
  if (instagramHandle != null && instagramHandle.trim() !== "") {
    insert.instagram_handle = instagramHandle.trim();
  }
  const { data: created, error: insertError } = await supabase
    .from(ARTISTS_TABLE)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- no generated DB types
    .insert(insert as any)
    .select()
    .single();

  if (insertError) throw insertError;
  return created as ArtistRow;
}

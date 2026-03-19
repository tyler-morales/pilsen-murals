/**
 * Canonical murals table schema. Source of truth for map content; Qdrant is a derived search index.
 *
 * Migration SQL (run in Supabase SQL editor or via migration tool):
 *
 *   create table if not exists public.murals (
 *     id text primary key,
 *     title text not null default 'Untitled Mural',
 *     artist text not null default 'Unknown Artist',
 *     artist_instagram_handle text,
 *     coordinates jsonb not null check (jsonb_array_length(coordinates) = 2),
 *     bearing smallint default 0,
 *     dominant_color text not null default '#333333',
 *     image_url text not null,
 *     thumbnail_url text,
 *     image_metadata jsonb,
 *     source text not null default 'user_submission' check (source in ('sync', 'user_submission')),
 *     created_at timestamptz not null default now()
 *   );
 *
 *   create index if not exists murals_created_at_idx on public.murals (created_at desc);
 */

export type MuralSource = "sync" | "user_submission";

export interface MuralEditRow {
  id: string;
  mural_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  edited_at: string;
  ip_hash: string | null;
}

export interface MuralRow {
  id: string;
  title: string;
  artist: string;
  artist_instagram_handle: string | null;
  coordinates: [number, number];
  bearing: number | null;
  dominant_color: string;
  image_url: string;
  thumbnail_url: string | null;
  image_metadata: Record<string, string> | null;
  source: MuralSource;
  created_at: string;
  date_captured: string;
  date_painted?: string | null;
  description?: string | null;
  year_painted?: number | null;
}

export interface MuralInsert {
  id: string;
  title: string;
  artist: string;
  artist_instagram_handle?: string | null;
  coordinates: [number, number];
  bearing?: number | null;
  dominant_color: string;
  image_url: string;
  thumbnail_url?: string | null;
  image_metadata?: Record<string, string> | null;
  source: MuralSource;
  date_captured?: string;
  date_painted?: string | null;
  description?: string | null;
  year_painted?: number | null;
}

/** App Mural type (from types/mural.ts) for map/modal. */
export interface MuralForApp {
  id: string;
  title: string;
  artist: string;
  artistInstagramHandle?: string;
  coordinates: [number, number];
  bearing?: number;
  dominantColor: string;
  imageUrl: string;
  thumbnail?: string;
  imageMetadata?: Record<string, string>;
  dateCaptured?: string;
  datePainted?: string | null;
  description?: string | null;
  yearPainted?: number | null;
}

export interface MuralCommunityImageRow {
  id: string;
  mural_id: string;
  user_id: string | null;
  image_url: string;
  thumbnail_url: string | null;
  created_at: string;
}

export interface MuralCommunityImageInsert {
  mural_id: string;
  user_id?: string | null;
  image_url: string;
  thumbnail_url?: string | null;
}

export function muralRowToApp(row: MuralRow): MuralForApp {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    ...(row.artist_instagram_handle && {
      artistInstagramHandle: row.artist_instagram_handle,
    }),
    coordinates: row.coordinates as [number, number],
    ...(row.bearing != null && { bearing: row.bearing }),
    dominantColor: row.dominant_color,
    imageUrl: row.image_url,
    ...(row.thumbnail_url && { thumbnail: row.thumbnail_url }),
    ...(row.image_metadata && Object.keys(row.image_metadata).length > 0 && {
      imageMetadata: row.image_metadata,
    }),
    ...(row.date_captured != null && { dateCaptured: row.date_captured }),
    ...(row.date_painted != null && { datePainted: row.date_painted }),
    ...(row.description != null && { description: row.description }),
    ...(row.year_painted != null && { yearPainted: row.year_painted }),
  };
}

-- Canonical murals table. Run in Supabase SQL editor or via supabase db push.
create table if not exists public.murals (
  id text primary key,
  title text not null default 'Untitled Mural',
  artist text not null default 'Unknown Artist',
  artist_instagram_handle text,
  coordinates jsonb not null check (jsonb_array_length(coordinates) = 2),
  bearing smallint default 0,
  dominant_color text not null default '#333333',
  image_url text not null,
  thumbnail_url text,
  image_metadata jsonb,
  source text not null default 'user_submission' check (source in ('sync', 'user_submission')),
  created_at timestamptz not null default now()
);

create index if not exists murals_created_at_idx on public.murals (created_at desc);

-- Storage: create a public bucket named "murals" in Supabase Dashboard (Storage -> New bucket -> "murals", Public).

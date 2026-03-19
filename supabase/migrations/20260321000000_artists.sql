-- Normalized artists table; murals reference artists by id to enable linking and autocomplete.
create table if not exists public.artists (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  instagram_handle text,
  created_at timestamptz not null default now()
);

create index if not exists artists_name_idx on public.artists (name);

-- FK on murals; nullable so existing rows keep working.
alter table public.murals add column if not exists artist_id uuid references public.artists(id) on delete set null;

create index if not exists murals_artist_id_idx on public.murals (artist_id);

-- Seed artists from existing distinct mural artist names (exclude Unknown Artist).
insert into public.artists (name, instagram_handle)
select distinct m.artist, m.artist_instagram_handle
from public.murals m
where m.artist is not null and trim(m.artist) != '' and m.artist != 'Unknown Artist'
on conflict (name) do update set instagram_handle = coalesce(excluded.instagram_handle, artists.instagram_handle);

-- Backfill murals.artist_id from artists.
update public.murals m
set artist_id = a.id
from public.artists a
where m.artist = a.name and m.artist_id is null;

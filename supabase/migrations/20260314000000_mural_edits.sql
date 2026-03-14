-- Audit trail for mural metadata edits (title, artist, artist_instagram_handle).
-- Enables Wikipedia-style open edits with revert capability.
create table if not exists public.mural_edits (
  id uuid primary key default gen_random_uuid(),
  mural_id text not null references public.murals(id) on delete cascade,
  field_name text not null,
  old_value text,
  new_value text,
  edited_at timestamptz not null default now(),
  ip_hash text
);

create index if not exists mural_edits_mural_id_idx on public.mural_edits (mural_id, edited_at desc);

-- Optional editable fields for murals (description, year_painted).
alter table public.murals add column if not exists description text;
alter table public.murals add column if not exists year_painted smallint;

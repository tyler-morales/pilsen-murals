-- Community photos per mural: same mural over time (timeline).
create table if not exists public.mural_community_images (
  id uuid primary key default gen_random_uuid(),
  mural_id text not null references public.murals(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  image_url text not null,
  thumbnail_url text,
  created_at timestamptz not null default now()
);

create index if not exists mural_community_images_mural_created_idx
  on public.mural_community_images(mural_id, created_at desc);

alter table public.mural_community_images enable row level security;

create policy "Public read"
  on public.mural_community_images for select
  using (true);

create policy "Auth insert own"
  on public.mural_community_images for insert
  with check (auth.uid() = user_id);

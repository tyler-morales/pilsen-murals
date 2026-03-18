-- User captures: which murals a user has "captured" (persisted per account for cross-device sync).
create table if not exists public.user_captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mural_id text not null references public.murals(id) on delete cascade,
  captured_at timestamptz not null default now(),
  lat double precision,
  lng double precision,
  distance_meters double precision,
  unique(user_id, mural_id)
);

create index if not exists user_captures_user_id_idx on public.user_captures(user_id);
create index if not exists user_captures_mural_id_idx on public.user_captures(mural_id);

alter table public.user_captures enable row level security;

create policy "Users read own captures"
  on public.user_captures for select
  using (auth.uid() = user_id);

create policy "Users insert own captures"
  on public.user_captures for insert
  with check (auth.uid() = user_id);

create policy "Users update own captures"
  on public.user_captures for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own captures"
  on public.user_captures for delete
  using (auth.uid() = user_id);

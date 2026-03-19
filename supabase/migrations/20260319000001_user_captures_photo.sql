-- Add photo_url to user_captures for discovery flow (user's personal photo per mural).
alter table public.user_captures
  add column if not exists photo_url text;

-- user-photos bucket: one photo per user per mural (path: {userId}/{muralId}.webp).
-- Public bucket so img src works without signed URLs; RLS still restricts write/delete to own folder.
insert into storage.buckets (id, name, public)
values ('user-photos', 'user-photos', true)
on conflict (id) do update set public = true;

-- Authenticated users can insert only into their own folder: user-photos/{userId}/...
create policy "Users insert own discovery photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'user-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- No SELECT policy: bucket is public so reads are allowed for display.

-- Users can update only their own folder (e.g. re-upload same mural).
create policy "Users update own discovery photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'user-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'user-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete only their own folder.
create policy "Users delete own discovery photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'user-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

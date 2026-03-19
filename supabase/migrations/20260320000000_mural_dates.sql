-- date_captured: when the photo was taken (default upload time). Always shown in mural description.
-- date_painted: when the mural was painted, if known (nullable). Display as year or full date.
alter table public.murals add column if not exists date_captured timestamptz not null default now();
alter table public.murals add column if not exists date_painted date;

-- Draft deployment SQL, validated in tests. Generate the migration with
-- `supabase migration new release_readiness` before deployment.
begin;

-- This migration is scoped to Flipbook Dynamite. It preserves existing books.
create table if not exists public.flipbook_books (
  id text primary key,
  title text not null,
  file_name text not null,
  size bigint not null,
  created_at timestamptz not null default now(),
  owner_id text,
  visibility text default 'public',
  password_hash text,
  branding jsonb default '{}',
  overlays jsonb default '[]'
);
alter table public.flipbook_books add column if not exists owner_id text;
-- Existing books retain their published state. New uploads start pending.
alter table public.flipbook_books add column if not exists status text not null default 'ready';
-- Existing deployments keep their default until the new API explicitly reserves pending uploads.
alter table public.flipbook_books alter column status set default 'ready';
alter table public.flipbook_books drop constraint if exists flipbook_books_status_check;
alter table public.flipbook_books add constraint flipbook_books_status_check check (status in ('pending', 'ready', 'deleted'));
create index if not exists flipbook_books_owner_created_idx on public.flipbook_books (owner_id, created_at desc);
alter table public.flipbook_books enable row level security;
revoke all on public.flipbook_books from anon, authenticated;
grant all on public.flipbook_books to service_role;

-- Remove policies only from this app's metadata table. Service role bypasses RLS.
do $$ declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'flipbook_books'
  loop execute format('drop policy %I on public.flipbook_books', p.policyname); end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('flipbook-pdfs', 'flipbook-pdfs', false, 104857600, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 104857600, allowed_mime_types = array['application/pdf'];

-- Restrictive policy closes legacy permissive storage policies for this bucket
-- without changing access to any other application's bucket.
drop policy if exists flipbook_server_access_only on storage.objects;
create policy flipbook_server_access_only on storage.objects as restrictive
for all to anon, authenticated
using (bucket_id not in ('flipbook-pdfs', 'flipbook-assets')) with check (bucket_id not in ('flipbook-pdfs', 'flipbook-assets'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('flipbook-assets', 'flipbook-assets', false, 4194304, array['image/png','image/jpeg','image/gif','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 4194304, allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.flipbook_upload_windows (
  owner_id text primary key,
  window_start timestamptz not null,
  attempts integer not null
);
alter table public.flipbook_upload_windows enable row level security;
revoke all on public.flipbook_upload_windows from anon, authenticated;
grant all on public.flipbook_upload_windows to service_role;

create or replace function public.flipbook_reserve_upload(
  book_id text, book_title text, book_file_name text, book_size bigint, book_owner_id text,
  book_visibility text default 'public', book_password_hash text default null
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  book_count bigint;
  reserved_bytes bigint;
  recent_attempts integer;
begin
  if book_visibility not in ('public', 'private') or
     book_owner_id is null or length(book_owner_id) < 1 or
     book_id !~ '^[A-Za-z0-9_-]{10,32}$' or
     book_size is null or book_size < 1 or book_size > 104857600 or
     book_title is null or length(book_title) not between 1 and 200 or
     book_file_name is null or length(book_file_name) not between 1 and 255 then
    raise exception 'invalid_upload';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(book_owner_id, 0));
  select count(*), coalesce(sum(case when status <> 'ready' or created_at > now() - interval '130 minutes' then 104857600 else size end), 0)
    into book_count, reserved_bytes from public.flipbook_books where owner_id = book_owner_id;
  -- Reserve the maximum size until issued storage URLs expire, even after verification. A dishonest
  -- browser cannot reserve one byte and fill storage with 100 MB uploads.
  if book_count >= 100 or reserved_bytes + 104857600 > 1073741824 then
    raise exception 'library_limit';
  end if;
  insert into public.flipbook_upload_windows (owner_id, window_start, attempts)
  values (book_owner_id, now(), 1)
  on conflict (owner_id) do update set
    attempts = case when flipbook_upload_windows.window_start <= now() - interval '1 minute' then 1 else flipbook_upload_windows.attempts + 1 end,
    window_start = case when flipbook_upload_windows.window_start <= now() - interval '1 minute' then now() else flipbook_upload_windows.window_start end
  returning attempts into recent_attempts;
  if recent_attempts > 20 then raise exception 'upload_rate_limit'; end if;
  insert into public.flipbook_books (id, title, file_name, size, owner_id, status, visibility, password_hash)
  values (book_id, book_title, book_file_name, book_size, book_owner_id, 'pending', book_visibility, book_password_hash);
end $$;
revoke all on function public.flipbook_reserve_upload(text, text, text, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.flipbook_reserve_upload(text, text, text, bigint, text, text, text) to service_role;

-- Shared limits survive serverless restarts and multiple instances.
create table if not exists public.flipbook_rate_windows (
  key text primary key, window_start timestamptz not null, attempts integer not null
);
alter table public.flipbook_rate_windows enable row level security;
revoke all on public.flipbook_rate_windows from anon, authenticated;
grant all on public.flipbook_rate_windows to service_role;
create index if not exists flipbook_rate_windows_start_idx on public.flipbook_rate_windows(window_start);
create or replace function public.flipbook_take_rate_slot(rate_key text, max_attempts integer, window_seconds integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare recent_attempts integer;
begin
  if length(rate_key) not between 1 and 200 or max_attempts not between 1 and 10000 or window_seconds not between 1 and 3600 then
    return false;
  end if;
  delete from public.flipbook_rate_windows where key in
    (select key from public.flipbook_rate_windows where window_start < now() - interval '2 hours' order by window_start limit 100);
  insert into public.flipbook_rate_windows (key, window_start, attempts) values (rate_key, now(), 1)
  on conflict (key) do update set
    attempts = case when flipbook_rate_windows.window_start <= now() - make_interval(secs => window_seconds) then 1 else least(flipbook_rate_windows.attempts + 1, 10001) end,
    window_start = case when flipbook_rate_windows.window_start <= now() - make_interval(secs => window_seconds) then now() else flipbook_rate_windows.window_start end
  returning attempts into recent_attempts;
  return recent_attempts <= max_attempts;
end $$;
revoke all on function public.flipbook_take_rate_slot(text, integer, integer) from public, anon, authenticated;
grant execute on function public.flipbook_take_rate_slot(text, integer, integer) to service_role;

-- Reserve 4MB per image slot, at most 128 slots/account (512MB).
-- Replacing an image reuses its slot; deleting its book frees the slots.
create table if not exists public.flipbook_asset_slots (
  book_id text not null references public.flipbook_books(id) on delete cascade,
  kind text not null, owner_id text not null, primary key(book_id, kind)
);
create index if not exists flipbook_asset_slots_owner_idx on public.flipbook_asset_slots(owner_id);
alter table public.flipbook_asset_slots enable row level security;
revoke all on public.flipbook_asset_slots from anon, authenticated;
grant all on public.flipbook_asset_slots to service_role;
create or replace function public.flipbook_reserve_asset(asset_book_id text, asset_kind text, asset_owner_id text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(asset_owner_id, 1));
  if not exists (select 1 from public.flipbook_books where id = asset_book_id and owner_id = asset_owner_id and status = 'ready') or asset_kind !~ '^[A-Za-z0-9_-]{1,60}$' then return false; end if;
  if exists (select 1 from public.flipbook_asset_slots where book_id = asset_book_id and kind = asset_kind) then return true; end if;
  if (select count(*) from public.flipbook_asset_slots where owner_id = asset_owner_id) >= 128 then return false; end if;
  insert into public.flipbook_asset_slots (book_id, kind, owner_id) values (asset_book_id, asset_kind, asset_owner_id);
  return true;
end $$;
revoke all on function public.flipbook_reserve_asset(text, text, text) from public, anon, authenticated;
grant execute on function public.flipbook_reserve_asset(text, text, text) to service_role;

-- Aggregate the full event history in PostgreSQL, independent of REST row caps.
create or replace function public.flipbook_get_stats(stats_book_id text, stats_page_count integer)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with events as (
    select type, page, visitor, created_at from public.flipbook_events where book_id = stats_book_id
  ), reach as (
    select visitor, max(page) as max_page from events where type = 'page' group by visitor
  ), pages as (
    select n, (select count(*) from reach where max_page >= n) as reached
    from generate_series(1, least(10000, greatest(0, stats_page_count))) n
  )
  select jsonb_build_object(
    'totalViews', (select count(*) from events where type = 'view'),
    'uniqueVisitors', (select count(distinct visitor) from events where type = 'view'),
    'lastViewedAt', (select max(created_at) from events where type = 'view'),
    'pageCount', least(10000, greatest(0, stats_page_count)),
    'pagesReached', coalesce((select jsonb_agg(reached order by n) from pages), '[]'::jsonb)
  );
$$;
revoke all on function public.flipbook_get_stats(text, integer) from public, anon, authenticated;
grant execute on function public.flipbook_get_stats(text, integer) to service_role;

commit;

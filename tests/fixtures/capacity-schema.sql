-- Account-specific capacity. No customer can modify their own allowance.
begin;
create table if not exists public.flipbook_account_limits (
 owner_id text primary key,
 storage_limit_bytes bigint not null check(storage_limit_bytes between 104857600 and 10995116277760),
 publication_limit integer not null check(publication_limit between 1 and 100000)
);
alter table public.flipbook_account_limits enable row level security;
revoke all on public.flipbook_account_limits from public,anon,authenticated;
grant all on public.flipbook_account_limits to service_role;
create or replace function public.flipbook_reserve_upload(
  book_id text, book_title text, book_file_name text, book_size bigint, book_owner_id text,
  book_visibility text default 'public', book_password_hash text default null
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  book_count bigint;
  reserved_bytes bigint;
  recent_attempts integer;
  max_books integer;
  max_bytes bigint;
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
  select coalesce((select publication_limit from public.flipbook_account_limits where owner_id=book_owner_id),100),
         coalesce((select storage_limit_bytes from public.flipbook_account_limits where owner_id=book_owner_id),1073741824)
    into max_books,max_bytes;
  if book_count >= max_books or reserved_bytes + 104857600 > max_bytes then
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

create or replace function public.flipbook_workspace(actor text)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'storageLimitBytes',coalesce((select storage_limit_bytes from public.flipbook_account_limits where owner_id=actor),1073741824),
  'publicationLimit',coalesce((select publication_limit from public.flipbook_account_limits where owner_id=actor),100),
  'folders',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.flipbook_folders where owner_id=actor),'[]'::jsonb),
  'placements',coalesce((select jsonb_object_agg(p.book_id,p.folder_id) from public.flipbook_folder_books p join public.flipbook_books b on b.id=p.book_id where p.owner_id=actor and b.owner_id=actor and b.status<>'deleted'),'{}'::jsonb),
  'views',coalesce((select jsonb_object_agg(id,n) from (select b.id,count(e.book_id) as n from public.flipbook_books b left join public.flipbook_events e on e.book_id=b.id and e.type='view' where b.owner_id=actor and b.status='ready' group by b.id) v),'{}'::jsonb),
  'reservedBytes',coalesce((select sum(case when status<>'ready' or created_at>now()-interval '130 minutes' then 104857600 else size end) from public.flipbook_books where owner_id=actor),0),
  'bookSlots',(select count(*) from public.flipbook_books where owner_id=actor)
 );
$$;
revoke all on function public.flipbook_workspace(text) from public,anon,authenticated;
grant execute on function public.flipbook_workspace(text) to service_role;
commit;

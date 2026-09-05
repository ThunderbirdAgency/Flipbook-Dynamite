begin;
create table if not exists public.flipbook_folders (
 id text primary key, owner_id text not null, name text not null check(length(name) between 1 and 80),
 created_at timestamptz not null default now(), unique(owner_id,name)
);
create index if not exists flipbook_folders_owner_idx on public.flipbook_folders(owner_id);
create table if not exists public.flipbook_folder_books (
 book_id text primary key references public.flipbook_books(id) on delete cascade,
 folder_id text not null references public.flipbook_folders(id) on delete cascade,
 owner_id text not null
);
create index if not exists flipbook_folder_books_owner_idx on public.flipbook_folder_books(owner_id);
create index if not exists flipbook_folder_books_folder_idx on public.flipbook_folder_books(folder_id);
alter table public.flipbook_folders enable row level security;
alter table public.flipbook_folder_books enable row level security;
revoke all on public.flipbook_folders, public.flipbook_folder_books from anon,authenticated;
grant all on public.flipbook_folders, public.flipbook_folder_books to service_role;

create or replace function public.flipbook_workspace_change(actor text, action text, folder text default null, label text default null, book text default null)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if actor is null or length(actor)<1 then raise exception 'workspace_denied'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor,2));
 if action='create' then
  if folder is null or folder !~ '^[A-Za-z0-9_-]{10,32}$' or label is null or length(trim(label)) not between 1 and 80 then raise exception 'invalid_folder'; end if;
  if (select count(*) from public.flipbook_folders where owner_id=actor)>=100 then raise exception 'folder_limit'; end if;
  insert into public.flipbook_folders(id,owner_id,name) values(folder,actor,trim(label));
 elsif action in ('rename','delete') then
  if not exists(select 1 from public.flipbook_folders where id=folder and owner_id=actor) then raise exception 'workspace_denied'; end if;
  if action='rename' then
   if label is null or length(trim(label)) not between 1 and 80 then raise exception 'invalid_folder'; end if;
   update public.flipbook_folders set name=trim(label) where id=folder and owner_id=actor;
  else delete from public.flipbook_folders where id=folder and owner_id=actor;
  end if;
 elsif action='move' then
  if not exists(select 1 from public.flipbook_books where id=book and owner_id=actor and status<>'deleted') then raise exception 'workspace_denied'; end if;
  if folder is null then delete from public.flipbook_folder_books where book_id=book and owner_id=actor;
  else
   if not exists(select 1 from public.flipbook_folders where id=folder and owner_id=actor) then raise exception 'workspace_denied'; end if;
   insert into public.flipbook_folder_books(book_id,folder_id,owner_id) values(book,folder,actor)
   on conflict(book_id) do update set folder_id=excluded.folder_id,owner_id=excluded.owner_id;
  end if;
 else raise exception 'invalid_workspace_action';
 end if;
end $$;
revoke all on function public.flipbook_workspace_change(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.flipbook_workspace_change(text,text,text,text,text) to service_role;

create or replace function public.flipbook_workspace(actor text)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
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

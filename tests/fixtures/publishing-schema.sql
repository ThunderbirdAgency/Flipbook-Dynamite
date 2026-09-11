create table if not exists public.flipbook_publishing (
 id text primary key, owner_id text not null, kind text not null check(kind in ('custom','track','shelf')),
 data jsonb not null default '{}', created_at timestamptz not null default now()
);
create index if not exists flipbook_publishing_owner on public.flipbook_publishing(owner_id,kind);
alter table public.flipbook_publishing enable row level security;
revoke all on public.flipbook_publishing from public,anon,authenticated;
grant select,insert,update,delete on public.flipbook_publishing to service_role;
create table if not exists public.flipbook_link_events (
 id bigint generated always as identity primary key, link_id text not null references public.flipbook_publishing(id) on delete cascade,
 page integer, created_at timestamptz not null default now()
);
alter table public.flipbook_link_events enable row level security;
revoke all on public.flipbook_link_events from public,anon,authenticated;
grant select,insert,delete on public.flipbook_link_events to service_role;
grant usage,select on sequence public.flipbook_link_events_id_seq to service_role;
create index if not exists flipbook_link_events_link on public.flipbook_link_events(link_id);
create or replace function public.flipbook_link_stats(actor text) returns jsonb language sql security invoker set search_path=public as $$
 select coalesce(jsonb_object_agg(id,stats),'{}') from (
 select p.id,jsonb_build_object('opens',count(e.id) filter(where e.page is null),'pages',count(e.id) filter(where e.page is not null),'last',max(e.created_at)) stats
 from flipbook_publishing p left join flipbook_link_events e on e.link_id=p.id
 where p.owner_id=actor and p.kind='track' group by p.id) s;
$$;
revoke all on function public.flipbook_link_stats(text) from public,anon,authenticated;
grant execute on function public.flipbook_link_stats(text) to service_role;

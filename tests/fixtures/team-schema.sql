-- Team workspace ownership remains the original Clerk user id. No books move.
create table if not exists public.flipbook_team_members (
 owner_id text not null, user_id text not null, email text not null,
 role text not null check(role in ('admin','editor','viewer')),
 primary key(owner_id,user_id), check(owner_id<>user_id)
);
create index if not exists flipbook_team_members_user on public.flipbook_team_members(user_id);
create table if not exists public.flipbook_team_invites (
 id text primary key, owner_id text not null, email text not null,
 role text not null check(role in ('admin','editor','viewer')),
 token_hash text not null unique, expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
create index if not exists flipbook_team_invites_owner on public.flipbook_team_invites(owner_id);
alter table public.flipbook_team_members enable row level security;
alter table public.flipbook_team_invites enable row level security;
revoke all on public.flipbook_team_members, public.flipbook_team_invites from public,anon,authenticated;
grant select,insert,update,delete on public.flipbook_team_members, public.flipbook_team_invites to service_role;
create or replace function public.flipbook_team_change(actor text, workspace text, action text, payload jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare actor_role text; target_role text; inv public.flipbook_team_invites; result jsonb;
begin
 if actor is null or actor='' then raise exception 'team_denied'; end if;
 if action='accept' then
  select * into inv from flipbook_team_invites where token_hash=payload->>'hash';
  if not found then raise exception 'invite_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('team:'||inv.owner_id,0));
  select * into inv from flipbook_team_invites where token_hash=payload->>'hash' for update;
  if not found or inv.expires_at<=now() or not (payload->'emails' ? inv.email) or inv.owner_id=actor then raise exception 'invite_invalid'; end if;
  -- Existing membership never changes through a stale invitation.
  insert into flipbook_team_members(owner_id,user_id,email,role) values(inv.owner_id,actor,inv.email,inv.role) on conflict do nothing;
  delete from flipbook_team_invites where id=inv.id;
  return jsonb_build_object('ownerId',inv.owner_id);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('team:'||workspace,0));
 if actor=workspace then actor_role:='owner'; else select role into actor_role from flipbook_team_members where owner_id=workspace and user_id=actor; end if;
 if actor_role is null or actor_role not in ('owner','admin') then raise exception 'team_denied'; end if;
 if action='invite' then
  if payload->>'role' not in ('admin','editor','viewer') or (actor_role='admin' and payload->>'role'='admin') then raise exception 'team_denied'; end if;
  if (select count(*) from flipbook_team_members where owner_id=workspace)+(select count(*) from flipbook_team_invites where owner_id=workspace and expires_at>now())>=100 then raise exception 'team_limit'; end if;
  insert into flipbook_team_invites(id,owner_id,email,role,token_hash,expires_at) values(payload->>'id',workspace,payload->>'email',payload->>'role',payload->>'hash',now()+interval '7 days');
 elsif action in ('role','remove') then
  select role into target_role from flipbook_team_members where owner_id=workspace and user_id=payload->>'userId';
  if target_role is null or (actor_role='admin' and target_role='admin') then raise exception 'team_denied'; end if;
  if action='remove' then
   delete from flipbook_team_invites where owner_id=workspace and email=(select email from flipbook_team_members where owner_id=workspace and user_id=payload->>'userId');
   delete from flipbook_team_members where owner_id=workspace and user_id=payload->>'userId';
  else
   if payload->>'role' not in ('admin','editor','viewer') or (actor_role='admin' and payload->>'role'='admin') then raise exception 'team_denied'; end if;
   update flipbook_team_members set role=payload->>'role' where owner_id=workspace and user_id=payload->>'userId';
  end if;
 elsif action='revoke' then
  select role into target_role from flipbook_team_invites where owner_id=workspace and id=payload->>'id';
  if target_role is null or (actor_role='admin' and target_role='admin') then raise exception 'team_denied'; end if;
  delete from flipbook_team_invites where owner_id=workspace and id=payload->>'id';
 else raise exception 'team_action'; end if;
 return '{}'::jsonb;
end $$;
revoke all on function public.flipbook_team_change(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.flipbook_team_change(text,text,text,jsonb) to service_role;

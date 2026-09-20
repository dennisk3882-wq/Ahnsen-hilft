-- Syndikat Cloud/Online backend.
-- Safe to coexist with Unterwelt in the same Supabase project:
-- Underwelt uses uw_* tables; Syndikat uses syndikat_* tables and syndikat_private helpers.

create extension if not exists pgcrypto;
create schema if not exists syndikat_private;
revoke all on schema syndikat_private from public, anon, authenticated;

create table if not exists public.syndikat_cloud_saves (
  save_code text primary key check (char_length(save_code) between 16 and 64),
  owner_token_hash text not null check (char_length(owner_token_hash) = 64),
  family text not null default '',
  round integer not null default 1 check (round > 0),
  revision bigint not null default 1 check (revision > 0),
  game_state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.syndikat_online_games (
  game_code text primary key check (char_length(game_code) between 12 and 64),
  host_participant_id uuid not null,
  host_token_hash text not null check (char_length(host_token_hash) = 64),
  active_participant_id uuid,
  status text not null default 'lobby'
    check (status in ('lobby','playing','finished','abandoned')),
  revision bigint not null default 1 check (revision > 0),
  settings jsonb not null default '{}'::jsonb,
  game_state jsonb,
  winner_participant_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.syndikat_online_players (
  participant_id uuid primary key,
  game_code text not null references public.syndikat_online_games(game_code) on delete cascade,
  player_token_hash text not null check (char_length(player_token_hash) = 64),
  display_name text not null check (char_length(display_name) between 1 and 24),
  family text not null check (char_length(family) between 1 and 24),
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique(game_code, participant_id)
);

create index if not exists syndikat_players_game_idx
  on public.syndikat_online_players(game_code, joined_at);
create index if not exists syndikat_games_updated_idx
  on public.syndikat_online_games(updated_at desc);

alter table public.syndikat_cloud_saves enable row level security;
alter table public.syndikat_online_games enable row level security;
alter table public.syndikat_online_players enable row level security;

revoke all on table public.syndikat_cloud_saves from anon, authenticated;
revoke all on table public.syndikat_online_games from anon, authenticated;
revoke all on table public.syndikat_online_players from anon, authenticated;

grant select (save_code,family,round,revision,game_state,created_at,updated_at)
  on public.syndikat_cloud_saves to anon;
grant insert (save_code,owner_token_hash,family,round,revision,game_state)
  on public.syndikat_cloud_saves to anon;
grant update (family,round,revision,game_state,updated_at)
  on public.syndikat_cloud_saves to anon;
grant delete on public.syndikat_cloud_saves to anon;

grant select (
  game_code,host_participant_id,active_participant_id,status,revision,
  settings,game_state,winner_participant_id,created_at,updated_at
) on public.syndikat_online_games to anon;
grant insert (
  game_code,host_participant_id,host_token_hash,active_participant_id,
  status,revision,settings,game_state,winner_participant_id
) on public.syndikat_online_games to anon;
grant update (
  active_participant_id,status,revision,settings,game_state,
  winner_participant_id,updated_at
) on public.syndikat_online_games to anon;

grant select (
  participant_id,game_code,display_name,family,ready,joined_at,last_seen
) on public.syndikat_online_players to anon;
grant insert (
  participant_id,game_code,player_token_hash,display_name,family,ready,last_seen
) on public.syndikat_online_players to anon;
grant update (display_name,family,ready,last_seen)
  on public.syndikat_online_players to anon;
grant delete on public.syndikat_online_players to anon;

create or replace function syndikat_private.request_header(header_name text)
returns text
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select coalesce(
    current_setting('request.headers', true)::json ->> lower(header_name),
    ''
  );
$$;

create or replace function syndikat_private.token_hash()
returns text
language sql
stable
security invoker
set search_path = pg_catalog, public, extensions, syndikat_private
as $$
  select encode(
    extensions.digest(
      syndikat_private.request_header('x-syndikat-player')::text,
      'sha256'::text
    ),
    'hex'
  );
$$;

create or replace function syndikat_private.is_participant(p_game_code text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, syndikat_private
as $$
  select exists (
    select 1
    from public.syndikat_online_players p
    where p.game_code = p_game_code
      and p.player_token_hash = syndikat_private.token_hash()
  );
$$;

create or replace function syndikat_private.is_host(p_game_code text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, syndikat_private
as $$
  select exists (
    select 1
    from public.syndikat_online_games g
    where g.game_code = p_game_code
      and g.host_token_hash = syndikat_private.token_hash()
  );
$$;

create or replace function syndikat_private.is_active_player(p_game_code text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, syndikat_private
as $$
  select exists (
    select 1
    from public.syndikat_online_games g
    join public.syndikat_online_players p
      on p.game_code = g.game_code
     and p.participant_id = g.active_participant_id
    where g.game_code = p_game_code
      and p.player_token_hash = syndikat_private.token_hash()
  );
$$;

create or replace function syndikat_private.lobby_is_joinable(p_game_code text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.syndikat_online_games g
    where g.game_code = p_game_code
      and g.status = 'lobby'
  )
  and (
    select count(*)
    from public.syndikat_online_players p
    where p.game_code = p_game_code
  ) < 8;
$$;

revoke all on function syndikat_private.request_header(text) from public;
revoke all on function syndikat_private.token_hash() from public;
revoke all on function syndikat_private.is_participant(text) from public;
revoke all on function syndikat_private.is_host(text) from public;
revoke all on function syndikat_private.is_active_player(text) from public;
revoke all on function syndikat_private.lobby_is_joinable(text) from public;

grant usage on schema syndikat_private to anon;
grant execute on function syndikat_private.request_header(text) to anon;
grant execute on function syndikat_private.token_hash() to anon;
grant execute on function syndikat_private.is_participant(text) to anon;
grant execute on function syndikat_private.is_host(text) to anon;
grant execute on function syndikat_private.is_active_player(text) to anon;
grant execute on function syndikat_private.lobby_is_joinable(text) to anon;

drop policy if exists syndikat_save_read on public.syndikat_cloud_saves;
create policy syndikat_save_read on public.syndikat_cloud_saves
for select to anon
using (
  save_code = syndikat_private.request_header('x-syndikat-game')
  and owner_token_hash = syndikat_private.token_hash()
);

drop policy if exists syndikat_save_insert on public.syndikat_cloud_saves;
create policy syndikat_save_insert on public.syndikat_cloud_saves
for insert to anon
with check (
  save_code = syndikat_private.request_header('x-syndikat-game')
  and owner_token_hash = syndikat_private.token_hash()
);

drop policy if exists syndikat_save_update on public.syndikat_cloud_saves;
create policy syndikat_save_update on public.syndikat_cloud_saves
for update to anon
using (
  save_code = syndikat_private.request_header('x-syndikat-game')
  and owner_token_hash = syndikat_private.token_hash()
)
with check (
  save_code = syndikat_private.request_header('x-syndikat-game')
  and owner_token_hash = syndikat_private.token_hash()
);

drop policy if exists syndikat_save_delete on public.syndikat_cloud_saves;
create policy syndikat_save_delete on public.syndikat_cloud_saves
for delete to anon
using (
  save_code = syndikat_private.request_header('x-syndikat-game')
  and owner_token_hash = syndikat_private.token_hash()
);

drop policy if exists syndikat_game_read on public.syndikat_online_games;
create policy syndikat_game_read on public.syndikat_online_games
for select to anon
using (
  game_code = syndikat_private.request_header('x-syndikat-game')
  and (
    status = 'lobby'
    or syndikat_private.is_participant(game_code)
  )
);

drop policy if exists syndikat_game_insert on public.syndikat_online_games;
create policy syndikat_game_insert on public.syndikat_online_games
for insert to anon
with check (
  game_code = syndikat_private.request_header('x-syndikat-game')
  and host_token_hash = syndikat_private.token_hash()
);

drop policy if exists syndikat_game_update on public.syndikat_online_games;
create policy syndikat_game_update on public.syndikat_online_games
for update to anon
using (
  game_code = syndikat_private.request_header('x-syndikat-game')
  and (
    (status = 'lobby' and syndikat_private.is_host(game_code))
    or (status = 'playing' and syndikat_private.is_active_player(game_code))
    or (
      status in ('finished','abandoned')
      and syndikat_private.is_host(game_code)
    )
  )
)
with check (
  game_code = syndikat_private.request_header('x-syndikat-game')
);

drop policy if exists syndikat_player_read on public.syndikat_online_players;
create policy syndikat_player_read on public.syndikat_online_players
for select to anon
using (
  game_code = syndikat_private.request_header('x-syndikat-game')
  and syndikat_private.is_participant(game_code)
);

drop policy if exists syndikat_player_insert on public.syndikat_online_players;
create policy syndikat_player_insert on public.syndikat_online_players
for insert to anon
with check (
  game_code = syndikat_private.request_header('x-syndikat-game')
  and player_token_hash = syndikat_private.token_hash()
  and syndikat_private.lobby_is_joinable(game_code)
);

drop policy if exists syndikat_player_update on public.syndikat_online_players;
create policy syndikat_player_update on public.syndikat_online_players
for update to anon
using (
  game_code = syndikat_private.request_header('x-syndikat-game')
  and player_token_hash = syndikat_private.token_hash()
)
with check (
  game_code = syndikat_private.request_header('x-syndikat-game')
  and player_token_hash = syndikat_private.token_hash()
);

drop policy if exists syndikat_player_delete on public.syndikat_online_players;
create policy syndikat_player_delete on public.syndikat_online_players
for delete to anon
using (
  game_code = syndikat_private.request_header('x-syndikat-game')
  and player_token_hash = syndikat_private.token_hash()
);

create or replace function syndikat_private.guard_game_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.game_code <> old.game_code
     or new.host_participant_id <> old.host_participant_id
     or new.host_token_hash <> old.host_token_hash then
    raise exception 'immutable game identity';
  end if;

  if new.revision <> old.revision + 1 then
    raise exception 'revision must increment by exactly one';
  end if;

  if new.active_participant_id is not null
     and not exists (
       select 1
       from public.syndikat_online_players p
       where p.game_code = new.game_code
         and p.participant_id = new.active_participant_id
     ) then
    raise exception 'active participant must belong to game';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists syndikat_game_update_guard
on public.syndikat_online_games;
create trigger syndikat_game_update_guard
before update on public.syndikat_online_games
for each row execute function syndikat_private.guard_game_update();

create or replace function syndikat_private.touch_save()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists syndikat_save_touch
on public.syndikat_cloud_saves;
create trigger syndikat_save_touch
before update on public.syndikat_cloud_saves
for each row execute function syndikat_private.touch_save();


-- v5.3: server-validated online turns and audit history.
create table if not exists public.syndikat_turn_audit (
  id bigint generated always as identity primary key,
  game_code text not null references public.syndikat_online_games(game_code) on delete cascade,
  revision bigint not null,
  participant_id uuid,
  round integer not null,
  state_hash text not null,
  created_at timestamptz not null default now(),
  unique(game_code, revision)
);
alter table public.syndikat_turn_audit enable row level security;
revoke all on table public.syndikat_turn_audit from anon, authenticated;

create or replace function syndikat_private.public_game(g public.syndikat_online_games)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'game_code',g.game_code,'host_participant_id',g.host_participant_id,
    'active_participant_id',g.active_participant_id,'status',g.status,
    'revision',g.revision,'settings',g.settings,'game_state',g.game_state,
    'winner_participant_id',g.winner_participant_id,'created_at',g.created_at,'updated_at',g.updated_at
  );
$$;
revoke all on function syndikat_private.public_game(public.syndikat_online_games) from public;
grant execute on function syndikat_private.public_game(public.syndikat_online_games) to anon;

create or replace function public.syndikat_start_game(p_game_code text,p_revision bigint,p_game_state jsonb,p_first_participant_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, syndikat_private, extensions
as $$
declare g public.syndikat_online_games; participant_count integer; current_online text;
begin
  select * into g from public.syndikat_online_games where game_code=p_game_code for update;
  if not found or g.status<>'lobby' or g.revision<>p_revision then raise exception 'invalid lobby state'; end if;
  if g.host_token_hash<>syndikat_private.token_hash() then raise exception 'host authorization failed'; end if;
  select count(*) into participant_count from public.syndikat_online_players where game_code=p_game_code;
  if participant_count<2 or exists(select 1 from public.syndikat_online_players where game_code=p_game_code and ready=false) then raise exception 'players not ready'; end if;
  if not exists(select 1 from public.syndikat_online_players where game_code=p_game_code and participant_id=p_first_participant_id) then raise exception 'invalid first participant'; end if;
  if jsonb_typeof(p_game_state)<>'object' or jsonb_typeof(p_game_state->'players')<>'array' or jsonb_array_length(p_game_state->'players')>8 or length(p_game_state::text)>1500000 then raise exception 'invalid game state'; end if;
  if exists(select 1 from public.syndikat_online_players op where op.game_code=p_game_code and not exists(select 1 from jsonb_array_elements(p_game_state->'players') e where nullif(e->>'onlineParticipantId','')::uuid=op.participant_id)) then raise exception 'participant missing from state'; end if;
  current_online:=p_game_state->'players'->((p_game_state->>'currentIndex')::integer)->>'onlineParticipantId';
  if current_online is distinct from p_first_participant_id::text then raise exception 'active participant mismatch'; end if;
  update public.syndikat_online_games set status='playing',revision=g.revision+1,game_state=p_game_state,active_participant_id=p_first_participant_id,winner_participant_id=null where game_code=p_game_code returning * into g;
  insert into public.syndikat_turn_audit(game_code,revision,participant_id,round,state_hash) values(p_game_code,g.revision,g.host_participant_id,coalesce((p_game_state->>'round')::integer,1),encode(extensions.digest(p_game_state::text,'sha256'),'hex'));
  return syndikat_private.public_game(g);
end;
$$;

create or replace function public.syndikat_submit_turn(p_game_code text,p_revision bigint,p_game_state jsonb,p_next_participant_id uuid,p_status text default 'playing',p_winner_participant_id uuid default null)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, syndikat_private, extensions
as $$
declare g public.syndikat_online_games; caller_id uuid; old_round integer; new_round integer; old_ids text[]; new_ids text[]; current_online text;
begin
  select * into g from public.syndikat_online_games where game_code=p_game_code for update;
  if not found or g.status<>'playing' or g.revision<>p_revision then raise exception 'invalid online revision'; end if;
  select p.participant_id into caller_id from public.syndikat_online_players p where p.game_code=p_game_code and p.participant_id=g.active_participant_id and p.player_token_hash=syndikat_private.token_hash();
  if caller_id is null then raise exception 'not active participant'; end if;
  if p_status not in ('playing','finished') or jsonb_typeof(p_game_state)<>'object' or jsonb_typeof(p_game_state->'players')<>'array' or length(p_game_state::text)>1500000 then raise exception 'invalid submission'; end if;
  if g.game_state is not null then
    if jsonb_array_length(g.game_state->'players')<>jsonb_array_length(p_game_state->'players') then raise exception 'player count changed'; end if;
    select array_agg(e->>'id' order by e->>'id') into old_ids from jsonb_array_elements(g.game_state->'players') e;
    select array_agg(e->>'id' order by e->>'id') into new_ids from jsonb_array_elements(p_game_state->'players') e;
    if old_ids is distinct from new_ids then raise exception 'player identities changed'; end if;
    old_round:=coalesce((g.game_state->>'round')::integer,1);new_round:=coalesce((p_game_state->>'round')::integer,1);
    if new_round<old_round or new_round>old_round+1 or coalesce(g.game_state->>'startedAt','')<>coalesce(p_game_state->>'startedAt','') then raise exception 'invalid game progression'; end if;
  end if;
  if exists(select 1 from jsonb_array_elements(p_game_state->'players') e where jsonb_typeof(e)<>'object' or jsonb_typeof(e->'clean')<>'number' or jsonb_typeof(e->'dirty')<>'number' or jsonb_typeof(e->'debt')<>'number' or (e->>'clean')::numeric<0 or (e->>'dirty')::numeric<0 or (e->>'debt')::numeric<0 or (e->>'clean')::numeric>1000000000000 or (e->>'dirty')::numeric>1000000000000 or (e->>'debt')::numeric>1000000000000) then raise exception 'invalid financial state'; end if;
  if p_status='playing' then
    if p_next_participant_id is null or not exists(select 1 from public.syndikat_online_players where game_code=p_game_code and participant_id=p_next_participant_id) then raise exception 'invalid next participant'; end if;
    current_online:=p_game_state->'players'->((p_game_state->>'currentIndex')::integer)->>'onlineParticipantId';
    if current_online is distinct from p_next_participant_id::text then raise exception 'next participant mismatch'; end if;
  end if;
  update public.syndikat_online_games set revision=g.revision+1,game_state=p_game_state,active_participant_id=case when p_status='finished' then null else p_next_participant_id end,status=p_status,winner_participant_id=p_winner_participant_id where game_code=p_game_code returning * into g;
  insert into public.syndikat_turn_audit(game_code,revision,participant_id,round,state_hash) values(p_game_code,g.revision,caller_id,coalesce((p_game_state->>'round')::integer,1),encode(extensions.digest(p_game_state::text,'sha256'),'hex'));
  return syndikat_private.public_game(g);
end;
$$;
revoke all on function public.syndikat_start_game(text,bigint,jsonb,uuid) from public;
revoke all on function public.syndikat_submit_turn(text,bigint,jsonb,uuid,text,uuid) from public;
grant execute on function public.syndikat_start_game(text,bigint,jsonb,uuid) to anon;
grant execute on function public.syndikat_submit_turn(text,bigint,jsonb,uuid,text,uuid) to anon;
revoke update on public.syndikat_online_games from anon;


-- v5.3: optional authenticated cloud account with five cross-device save slots.
create table if not exists public.syndikat_account_saves (
  user_id uuid not null references auth.users(id) on delete cascade,
  slot smallint not null check (slot between 1 and 5),
  family text not null default '',
  round integer not null default 1 check (round > 0),
  revision bigint not null default 1 check (revision > 0),
  game_state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,slot)
);
alter table public.syndikat_account_saves enable row level security;
revoke all on table public.syndikat_account_saves from anon, authenticated;

create or replace function public.syndikat_account_list_saves()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth
as $$
declare u uuid:=auth.uid(); result jsonb;
begin
  if u is null then raise exception 'authentication required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('slot',slot,'family',family,'round',round,'revision',revision,'created_at',created_at,'updated_at',updated_at) order by slot),'[]'::jsonb)
  into result from public.syndikat_account_saves where user_id=u;
  return result;
end;
$$;

create or replace function public.syndikat_account_load_save(p_slot smallint)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth
as $$
declare u uuid:=auth.uid(); s public.syndikat_account_saves;
begin
  if u is null then raise exception 'authentication required'; end if;
  select * into s from public.syndikat_account_saves where user_id=u and slot=p_slot;
  if not found then return null; end if;
  return jsonb_build_object('slot',s.slot,'family',s.family,'round',s.round,'revision',s.revision,'game_state',s.game_state,'updated_at',s.updated_at);
end;
$$;

create or replace function public.syndikat_account_save_slot(p_slot smallint,p_game_state jsonb,p_expected_revision bigint default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,auth
as $$
declare u uuid:=auth.uid(); s public.syndikat_account_saves; fam text; rnd integer;
begin
  if u is null then raise exception 'authentication required'; end if;
  if p_slot<1 or p_slot>5 or jsonb_typeof(p_game_state)<>'object' or jsonb_typeof(p_game_state->'players')<>'array' or length(p_game_state::text)>1500000 then raise exception 'invalid save'; end if;
  rnd:=greatest(1,coalesce((p_game_state->>'round')::integer,1));
  fam:=coalesce(p_game_state->'players'->coalesce((p_game_state->>'currentIndex')::integer,0)->>'family','Syndikat');
  select * into s from public.syndikat_account_saves where user_id=u and slot=p_slot for update;
  if found then
    if p_expected_revision is not null and s.revision<>p_expected_revision then raise exception 'revision conflict'; end if;
    update public.syndikat_account_saves set family=fam,round=rnd,revision=s.revision+1,game_state=p_game_state,updated_at=now() where user_id=u and slot=p_slot returning * into s;
  else
    insert into public.syndikat_account_saves(user_id,slot,family,round,revision,game_state) values(u,p_slot,fam,rnd,1,p_game_state) returning * into s;
  end if;
  return jsonb_build_object('slot',s.slot,'family',s.family,'round',s.round,'revision',s.revision,'updated_at',s.updated_at);
end;
$$;

create or replace function public.syndikat_account_delete_save(p_slot smallint)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,auth
as $$
declare u uuid:=auth.uid();
begin
  if u is null then raise exception 'authentication required'; end if;
  delete from public.syndikat_account_saves where user_id=u and slot=p_slot;
  return found;
end;
$$;

revoke all on function public.syndikat_account_list_saves() from public;
revoke all on function public.syndikat_account_load_save(smallint) from public;
revoke all on function public.syndikat_account_save_slot(smallint,jsonb,bigint) from public;
revoke all on function public.syndikat_account_delete_save(smallint) from public;
grant execute on function public.syndikat_account_list_saves() to authenticated;
grant execute on function public.syndikat_account_load_save(smallint) to authenticated;
grant execute on function public.syndikat_account_save_slot(smallint,jsonb,bigint) to authenticated;
grant execute on function public.syndikat_account_delete_save(smallint) to authenticated;

-- syndikat_account_revoke_anon
revoke execute on function public.syndikat_account_list_saves() from anon;
revoke execute on function public.syndikat_account_load_save(smallint) from anon;
revoke execute on function public.syndikat_account_save_slot(smallint,jsonb,bigint) from anon;
revoke execute on function public.syndikat_account_delete_save(smallint) from anon;
  
-- Explicit deny-all direct table access. Account/audit data is accessible only through validated RPCs.
drop policy if exists syndikat_account_saves_no_direct on public.syndikat_account_saves;
create policy syndikat_account_saves_no_direct on public.syndikat_account_saves
for all to anon, authenticated using (false) with check (false);

drop policy if exists syndikat_turn_audit_no_direct on public.syndikat_turn_audit;
create policy syndikat_turn_audit_no_direct on public.syndikat_turn_audit
for all to anon, authenticated using (false) with check (false);


-- v5.5: privileged turn/save implementations live outside the exposed public schema.
create or replace function syndikat_private.validate_game_state(p_state jsonb, p_min_players integer default 1)
returns void language plpgsql security invoker set search_path=pg_catalog
as $$
declare n integer; idx integer; rnd integer;
begin
  if jsonb_typeof(p_state)<>'object' or jsonb_typeof(p_state->'players')<>'array' then raise exception 'invalid game state'; end if;
  n:=jsonb_array_length(p_state->'players');
  if n<p_min_players or n>8 then raise exception 'invalid player count'; end if;
  if length(p_state::text)>1500000 then raise exception 'game state too large'; end if;
  if coalesce(p_state->>'currentIndex','') !~ '^[0-9]+$' then raise exception 'invalid current index'; end if;
  idx:=(p_state->>'currentIndex')::integer;
  if idx<0 or idx>=n then raise exception 'current index out of range'; end if;
  if coalesce(p_state->>'round','') !~ '^[0-9]+$' then raise exception 'invalid round'; end if;
  rnd:=(p_state->>'round')::integer;
  if rnd<1 or rnd>1000000 then raise exception 'invalid round'; end if;
  if exists(
    select 1 from jsonb_array_elements(p_state->'players') e
    where jsonb_typeof(e)<>'object'
       or nullif(e->>'id','') is null or length(e->>'id')>128
       or length(coalesce(e->>'name',''))>80 or length(coalesce(e->>'family',''))>80
       or jsonb_typeof(e->'clean')<>'number' or jsonb_typeof(e->'dirty')<>'number' or jsonb_typeof(e->'debt')<>'number'
       or (e->>'clean')::numeric<0 or (e->>'clean')::numeric>1000000000000
       or (e->>'dirty')::numeric<0 or (e->>'dirty')::numeric>1000000000000
       or (e->>'debt')::numeric<0 or (e->>'debt')::numeric>1000000000000
       or (e ? 'heat' and (jsonb_typeof(e->'heat')<>'number' or (e->>'heat')::numeric<0 or (e->>'heat')::numeric>100))
       or (e ? 'reputation' and (jsonb_typeof(e->'reputation')<>'number' or (e->>'reputation')::numeric<0 or (e->>'reputation')::numeric>100))
       or (e ? 'actionPoints' and (jsonb_typeof(e->'actionPoints')<>'number' or (e->>'actionPoints')::numeric<0 or (e->>'actionPoints')::numeric>20))
       or (e ? 'jailed' and (jsonb_typeof(e->'jailed')<>'number' or (e->>'jailed')::numeric<0 or (e->>'jailed')::numeric>1000))
  ) then raise exception 'invalid player state'; end if;
  if (select count(*) from jsonb_array_elements(p_state->'players')) <>
     (select count(distinct e->>'id') from jsonb_array_elements(p_state->'players') e) then raise exception 'duplicate player ids'; end if;
  if exists(
    select 1 from jsonb_array_elements(p_state->'players') e
    where nullif(e->>'onlineParticipantId','') is not null
      and (e->>'onlineParticipantId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) then raise exception 'invalid online participant id'; end if;
end;
$$;

alter function public.syndikat_start_game(text,bigint,jsonb,uuid) set schema syndikat_private;
alter function syndikat_private.syndikat_start_game(text,bigint,jsonb,uuid) rename to start_game_impl;
alter function public.syndikat_submit_turn(text,bigint,jsonb,uuid,text,uuid) set schema syndikat_private;
alter function syndikat_private.syndikat_submit_turn(text,bigint,jsonb,uuid,text,uuid) rename to submit_turn_impl;
alter function public.syndikat_account_list_saves() set schema syndikat_private;
alter function syndikat_private.syndikat_account_list_saves() rename to account_list_saves_impl;
alter function public.syndikat_account_load_save(smallint) set schema syndikat_private;
alter function syndikat_private.syndikat_account_load_save(smallint) rename to account_load_save_impl;
alter function public.syndikat_account_save_slot(smallint,jsonb,bigint) set schema syndikat_private;
alter function syndikat_private.syndikat_account_save_slot(smallint,jsonb,bigint) rename to account_save_slot_impl;
alter function public.syndikat_account_delete_save(smallint) set schema syndikat_private;
alter function syndikat_private.syndikat_account_delete_save(smallint) rename to account_delete_save_impl;

revoke all on all functions in schema syndikat_private from public,anon,authenticated;
grant usage on schema syndikat_private to anon,authenticated;
grant execute on function syndikat_private.validate_game_state(jsonb,integer) to anon,authenticated;
grant execute on function syndikat_private.start_game_impl(text,bigint,jsonb,uuid) to anon,authenticated;
grant execute on function syndikat_private.submit_turn_impl(text,bigint,jsonb,uuid,text,uuid) to anon,authenticated;
grant execute on function syndikat_private.account_list_saves_impl() to authenticated;
grant execute on function syndikat_private.account_load_save_impl(smallint) to authenticated;
grant execute on function syndikat_private.account_save_slot_impl(smallint,jsonb,bigint) to authenticated;
grant execute on function syndikat_private.account_delete_save_impl(smallint) to authenticated;

create or replace function public.syndikat_start_game(p_game_code text,p_revision bigint,p_game_state jsonb,p_first_participant_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,syndikat_private
as $$ begin perform syndikat_private.validate_game_state(p_game_state,2); return syndikat_private.start_game_impl(p_game_code,p_revision,p_game_state,p_first_participant_id); end; $$;
create or replace function public.syndikat_submit_turn(p_game_code text,p_revision bigint,p_game_state jsonb,p_next_participant_id uuid,p_status text default 'playing',p_winner_participant_id uuid default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,syndikat_private
as $$ begin perform syndikat_private.validate_game_state(p_game_state,2); return syndikat_private.submit_turn_impl(p_game_code,p_revision,p_game_state,p_next_participant_id,p_status,p_winner_participant_id); end; $$;
create or replace function public.syndikat_account_list_saves()
returns jsonb language sql security invoker set search_path=pg_catalog,syndikat_private
as $$ select syndikat_private.account_list_saves_impl(); $$;
create or replace function public.syndikat_account_load_save(p_slot smallint)
returns jsonb language sql security invoker set search_path=pg_catalog,syndikat_private
as $$ select syndikat_private.account_load_save_impl(p_slot); $$;
create or replace function public.syndikat_account_save_slot(p_slot smallint,p_game_state jsonb,p_expected_revision bigint default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,syndikat_private
as $$ begin perform syndikat_private.validate_game_state(p_game_state,1); return syndikat_private.account_save_slot_impl(p_slot,p_game_state,p_expected_revision); end; $$;
create or replace function public.syndikat_account_delete_save(p_slot smallint)
returns boolean language sql security invoker set search_path=pg_catalog,syndikat_private
as $$ select syndikat_private.account_delete_save_impl(p_slot); $$;

revoke all on function public.syndikat_start_game(text,bigint,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.syndikat_submit_turn(text,bigint,jsonb,uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.syndikat_account_list_saves() from public,anon,authenticated;
revoke all on function public.syndikat_account_load_save(smallint) from public,anon,authenticated;
revoke all on function public.syndikat_account_save_slot(smallint,jsonb,bigint) from public,anon,authenticated;
revoke all on function public.syndikat_account_delete_save(smallint) from public,anon,authenticated;
grant execute on function public.syndikat_start_game(text,bigint,jsonb,uuid) to anon,authenticated;
grant execute on function public.syndikat_submit_turn(text,bigint,jsonb,uuid,text,uuid) to anon,authenticated;
grant execute on function public.syndikat_account_list_saves() to authenticated;
grant execute on function public.syndikat_account_load_save(smallint) to authenticated;
grant execute on function public.syndikat_account_save_slot(smallint,jsonb,bigint) to authenticated;
grant execute on function public.syndikat_account_delete_save(smallint) to authenticated;


-- v5.5: RLS policy helpers remain callable by anon while privileged implementations stay private.
grant execute on function syndikat_private.request_header(text) to anon;
grant execute on function syndikat_private.token_hash() to anon;
grant execute on function syndikat_private.is_participant(text) to anon;
grant execute on function syndikat_private.is_host(text) to anon;
grant execute on function syndikat_private.is_active_player(text) to anon;
grant execute on function syndikat_private.lobby_is_joinable(text) to anon;


-- v5.6 multiplayer transition hardening + web push storage.
create or replace function syndikat_private.validate_turn_transition(
  p_game_code text,p_old_state jsonb,p_new_state jsonb,p_actor uuid,p_next uuid,p_status text,p_winner uuid
) returns void language plpgsql security definer set search_path=pg_catalog,public,syndikat_private
as $$
declare oldp jsonb; newp jsonb; pid text; old_count integer; new_count integer; current_online text; state_winner_online text;
begin
  if p_old_state is null then return; end if;
  if p_new_state->'settings' is distinct from p_old_state->'settings' then raise exception 'game settings changed'; end if;
  if p_old_state->'players'->((p_old_state->>'currentIndex')::integer)->>'onlineParticipantId' is distinct from p_actor::text then raise exception 'actor does not match active player'; end if;
  if jsonb_array_length(p_old_state->'players')<>jsonb_array_length(p_new_state->'players') then raise exception 'player count changed'; end if;
  for oldp in select value from jsonb_array_elements(p_old_state->'players') loop
    pid:=oldp->>'id'; select value into newp from jsonb_array_elements(p_new_state->'players') where value->>'id'=pid;
    if newp is null then raise exception 'player identity removed'; end if;
    if coalesce(oldp->>'family','')<>coalesce(newp->>'family','') or coalesce(oldp->>'onlineParticipantId','')<>coalesce(newp->>'onlineParticipantId','') or coalesce(oldp->>'type','')<>coalesce(newp->>'type','') then raise exception 'immutable player identity changed'; end if;
    if abs(coalesce((newp->>'clean')::numeric,0)-coalesce((oldp->>'clean')::numeric,0))>100000000 or abs(coalesce((newp->>'dirty')::numeric,0)-coalesce((oldp->>'dirty')::numeric,0))>100000000 or abs(coalesce((newp->>'debt')::numeric,0)-coalesce((oldp->>'debt')::numeric,0))>100000000 then raise exception 'implausible financial transition'; end if;
    old_count:=case when jsonb_typeof(oldp->'businesses')='array' then jsonb_array_length(oldp->'businesses') else 0 end;new_count:=case when jsonb_typeof(newp->'businesses')='array' then jsonb_array_length(newp->'businesses') else 0 end;if new_count>old_count+4 then raise exception 'implausible business transition'; end if;
    old_count:=case when jsonb_typeof(oldp->'staffRoster')='array' then jsonb_array_length(oldp->'staffRoster') else 0 end;new_count:=case when jsonb_typeof(newp->'staffRoster')='array' then jsonb_array_length(newp->'staffRoster') else 0 end;if new_count>old_count+8 then raise exception 'implausible staff transition'; end if;
    old_count:=case when jsonb_typeof(oldp->'propertyIds')='array' then jsonb_array_length(oldp->'propertyIds') else 0 end;new_count:=case when jsonb_typeof(newp->'propertyIds')='array' then jsonb_array_length(newp->'propertyIds') else 0 end;if new_count>old_count+4 then raise exception 'implausible property transition'; end if;
    old_count:=case when jsonb_typeof(oldp->'gear')='array' then jsonb_array_length(oldp->'gear') else 0 end;new_count:=case when jsonb_typeof(newp->'gear')='array' then jsonb_array_length(newp->'gear') else 0 end;if new_count>old_count+10 then raise exception 'implausible gear transition'; end if;
  end loop;
  if p_status='playing' then
    if coalesce((p_new_state->>'gameOver')::boolean,false) then raise exception 'playing state cannot be game over'; end if;
    current_online:=p_new_state->'players'->((p_new_state->>'currentIndex')::integer)->>'onlineParticipantId';
    if current_online is distinct from p_next::text then raise exception 'next participant mismatch'; end if;
  elsif p_status='finished' then
    if not coalesce((p_new_state->>'gameOver')::boolean,false) then raise exception 'invalid finished state'; end if;
    if p_new_state->>'winnerId' is null then
      if p_winner is not null or exists(select 1 from jsonb_array_elements(p_new_state->'players') e where not coalesce((e->>'eliminated')::boolean,false)) then raise exception 'invalid draw'; end if;
      return;
    end if;
    if not exists(select 1 from jsonb_array_elements(p_new_state->'players') e where e->>'id'=p_new_state->>'winnerId' and not coalesce((e->>'eliminated')::boolean,false)) then raise exception 'invalid winner'; end if;
    select e->>'onlineParticipantId' into state_winner_online from jsonb_array_elements(p_new_state->'players') e where e->>'id'=p_new_state->>'winnerId';
    if state_winner_online is distinct from p_winner::text then raise exception 'winner does not match game state'; end if;
  end if;
end;
$$;

create table if not exists public.syndikat_push_config(id smallint primary key default 1 check(id=1),public_key text not null,private_key text not null,created_at timestamptz not null default now());
alter table public.syndikat_push_config enable row level security; revoke all on public.syndikat_push_config from anon,authenticated;
create table if not exists public.syndikat_push_subscriptions(id uuid primary key default gen_random_uuid(),game_code text not null references public.syndikat_online_games(game_code) on delete cascade,participant_id uuid not null references public.syndikat_online_players(participant_id) on delete cascade,endpoint text not null,p256dh text not null,auth text not null,user_agent text not null default '',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(game_code,participant_id,endpoint));
alter table public.syndikat_push_subscriptions enable row level security; revoke all on public.syndikat_push_subscriptions from anon,authenticated;
create index if not exists syndikat_push_target_idx on public.syndikat_push_subscriptions(game_code,participant_id);

-- v5.6 host cleanup for abandoned/test online games.
grant delete on public.syndikat_online_games to anon;
drop policy if exists syndikat_game_delete on public.syndikat_online_games;
create policy syndikat_game_delete on public.syndikat_online_games
for delete to anon
using (
  game_code = syndikat_private.request_header('x-syndikat-game')
  and syndikat_private.is_host(game_code)
);


-- v5.6 live submit_turn_impl sync
CREATE OR REPLACE FUNCTION syndikat_private.submit_turn_impl(p_game_code text, p_revision bigint, p_game_state jsonb, p_next_participant_id uuid, p_status text DEFAULT 'playing'::text, p_winner_participant_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'syndikat_private', 'extensions'
AS $function$
declare
  g public.syndikat_online_games; caller_id uuid; old_round integer; new_round integer;
  old_ids text[]; new_ids text[]; current_online text;
begin
  select * into g from public.syndikat_online_games where game_code=p_game_code for update;
  if not found then raise exception 'game not found'; end if;
  if g.status<>'playing' then raise exception 'game is not active'; end if;
  if g.revision<>p_revision then raise exception 'revision conflict'; end if;

  select p.participant_id into caller_id
  from public.syndikat_online_players p
  where p.game_code=p_game_code and p.participant_id=g.active_participant_id
    and p.player_token_hash=syndikat_private.token_hash();
  if caller_id is null then raise exception 'not active participant'; end if;

  perform syndikat_private.validate_game_state(p_game_state,2);
  if p_status not in ('playing','finished') then raise exception 'invalid status'; end if;

  if g.game_state is not null then
    if jsonb_array_length(g.game_state->'players')<>jsonb_array_length(p_game_state->'players') then raise exception 'player count cannot change during a turn'; end if;
    select array_agg(e->>'id' order by e->>'id') into old_ids from jsonb_array_elements(g.game_state->'players') e;
    select array_agg(e->>'id' order by e->>'id') into new_ids from jsonb_array_elements(p_game_state->'players') e;
    if old_ids is distinct from new_ids then raise exception 'player identities cannot change'; end if;
    old_round:=coalesce((g.game_state->>'round')::integer,1);
    new_round:=coalesce((p_game_state->>'round')::integer,1);
    if new_round<old_round or new_round>old_round+1 then raise exception 'invalid round progression'; end if;
    if coalesce(g.game_state->>'startedAt','')<>coalesce(p_game_state->>'startedAt','') then raise exception 'game identity changed'; end if;
  end if;

  if exists(
    select 1 from jsonb_array_elements(p_game_state->'players') e
    where nullif(e->>'onlineParticipantId','') is not null
      and not exists(select 1 from public.syndikat_online_players op
                     where op.game_code=p_game_code and op.participant_id=(e->>'onlineParticipantId')::uuid)
  ) then raise exception 'unknown online participant in state'; end if;

  if p_status='playing' then
    if p_next_participant_id is null
       or not exists(select 1 from public.syndikat_online_players where game_code=p_game_code and participant_id=p_next_participant_id)
    then raise exception 'invalid next participant'; end if;
  end if;

  if p_winner_participant_id is not null
     and not exists(select 1 from public.syndikat_online_players where game_code=p_game_code and participant_id=p_winner_participant_id)
  then raise exception 'invalid winner participant'; end if;

  perform syndikat_private.validate_turn_transition(
    p_game_code,g.game_state,p_game_state,caller_id,p_next_participant_id,p_status,p_winner_participant_id
  );

  update public.syndikat_online_games
  set revision=g.revision+1,game_state=p_game_state,
      active_participant_id=case when p_status='finished' then null else p_next_participant_id end,
      status=p_status,winner_participant_id=p_winner_participant_id
  where game_code=p_game_code returning * into g;

  insert into public.syndikat_turn_audit(game_code,revision,participant_id,round,state_hash)
  values(p_game_code,g.revision,caller_id,coalesce((p_game_state->>'round')::integer,1),
         encode(extensions.digest(p_game_state::text,'sha256'),'hex'));
  return syndikat_private.public_game(g);
end;
$function$


drop policy if exists syndikat_push_config_deny on public.syndikat_push_config;
create policy syndikat_push_config_deny on public.syndikat_push_config for all to anon,authenticated using(false) with check(false);
drop policy if exists syndikat_push_subscriptions_deny on public.syndikat_push_subscriptions;
create policy syndikat_push_subscriptions_deny on public.syndikat_push_subscriptions for all to anon,authenticated using(false) with check(false);

create index if not exists syndikat_push_participant_idx on public.syndikat_push_subscriptions(participant_id);

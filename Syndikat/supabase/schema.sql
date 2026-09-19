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


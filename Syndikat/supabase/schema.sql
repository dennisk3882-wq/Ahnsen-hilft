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

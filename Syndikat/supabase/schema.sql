-- Syndikat Cloud/Online backend (prepared for a dedicated Supabase project)
-- Apply only to a separate Syndikat project. Uses publishable-key clients + RLS.
create extension if not exists pgcrypto;

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
  game_code text primary key check (char_length(game_code) between 12 and 40),
  host_participant_id uuid not null,
  host_token_hash text not null check (char_length(host_token_hash) = 64),
  active_participant_id uuid,
  active_token_hash text check (active_token_hash is null or char_length(active_token_hash) = 64),
  status text not null default 'lobby' check (status in ('lobby','playing','finished','abandoned')),
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

create index if not exists syndikat_players_game_idx on public.syndikat_online_players(game_code, joined_at);
create index if not exists syndikat_games_updated_idx on public.syndikat_online_games(updated_at desc);

alter table public.syndikat_cloud_saves enable row level security;
alter table public.syndikat_online_games enable row level security;
alter table public.syndikat_online_players enable row level security;

grant select, insert, update, delete on table public.syndikat_cloud_saves to anon;
grant select, insert, update, delete on table public.syndikat_online_games to anon;
grant select, insert, update, delete on table public.syndikat_online_players to anon;

-- Helpers intentionally live outside public API surface.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.syndikat_header(name text)
returns text
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select coalesce(current_setting('request.headers', true)::json ->> lower(name), '');
$$;

create or replace function private.syndikat_token_hash()
returns text
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select encode(digest(private.syndikat_header('x-syndikat-player'), 'sha256'), 'hex');
$$;

revoke all on function private.syndikat_header(text) from public;
revoke all on function private.syndikat_token_hash() from public;
grant usage on schema private to anon;
grant execute on function private.syndikat_header(text) to anon;
grant execute on function private.syndikat_token_hash() to anon;

drop policy if exists syndikat_save_read on public.syndikat_cloud_saves;
create policy syndikat_save_read on public.syndikat_cloud_saves
for select to anon
using (
  save_code = private.syndikat_header('x-syndikat-game')
  and owner_token_hash = private.syndikat_token_hash()
);

drop policy if exists syndikat_save_insert on public.syndikat_cloud_saves;
create policy syndikat_save_insert on public.syndikat_cloud_saves
for insert to anon
with check (
  save_code = private.syndikat_header('x-syndikat-game')
  and owner_token_hash = private.syndikat_token_hash()
);

drop policy if exists syndikat_save_update on public.syndikat_cloud_saves;
create policy syndikat_save_update on public.syndikat_cloud_saves
for update to anon
using (
  save_code = private.syndikat_header('x-syndikat-game')
  and owner_token_hash = private.syndikat_token_hash()
)
with check (
  save_code = private.syndikat_header('x-syndikat-game')
  and owner_token_hash = private.syndikat_token_hash()
);

drop policy if exists syndikat_save_delete on public.syndikat_cloud_saves;
create policy syndikat_save_delete on public.syndikat_cloud_saves
for delete to anon
using (
  save_code = private.syndikat_header('x-syndikat-game')
  and owner_token_hash = private.syndikat_token_hash()
);

drop policy if exists syndikat_game_read on public.syndikat_online_games;
create policy syndikat_game_read on public.syndikat_online_games
for select to anon
using (game_code = private.syndikat_header('x-syndikat-game'));

drop policy if exists syndikat_game_insert on public.syndikat_online_games;
create policy syndikat_game_insert on public.syndikat_online_games
for insert to anon
with check (
  game_code = private.syndikat_header('x-syndikat-game')
  and host_token_hash = private.syndikat_token_hash()
  and (active_token_hash is null or active_token_hash = private.syndikat_token_hash())
);

drop policy if exists syndikat_game_update on public.syndikat_online_games;
create policy syndikat_game_update on public.syndikat_online_games
for update to anon
using (
  game_code = private.syndikat_header('x-syndikat-game')
  and (
    host_token_hash = private.syndikat_token_hash()
    or active_token_hash = private.syndikat_token_hash()
  )
)
with check (game_code = private.syndikat_header('x-syndikat-game'));

drop policy if exists syndikat_player_read on public.syndikat_online_players;
create policy syndikat_player_read on public.syndikat_online_players
for select to anon
using (game_code = private.syndikat_header('x-syndikat-game'));

drop policy if exists syndikat_player_insert on public.syndikat_online_players;
create policy syndikat_player_insert on public.syndikat_online_players
for insert to anon
with check (
  game_code = private.syndikat_header('x-syndikat-game')
  and player_token_hash = private.syndikat_token_hash()
);

drop policy if exists syndikat_player_update on public.syndikat_online_players;
create policy syndikat_player_update on public.syndikat_online_players
for update to anon
using (
  game_code = private.syndikat_header('x-syndikat-game')
  and player_token_hash = private.syndikat_token_hash()
)
with check (
  game_code = private.syndikat_header('x-syndikat-game')
  and player_token_hash = private.syndikat_token_hash()
);

drop policy if exists syndikat_player_delete on public.syndikat_online_players;
create policy syndikat_player_delete on public.syndikat_online_players
for delete to anon
using (
  game_code = private.syndikat_header('x-syndikat-game')
  and player_token_hash = private.syndikat_token_hash()
);

create or replace function private.syndikat_guard_game_update()
returns trigger
language plpgsql
security invoker
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
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists syndikat_game_update_guard on public.syndikat_online_games;
create trigger syndikat_game_update_guard
before update on public.syndikat_online_games
for each row execute function private.syndikat_guard_game_update();

create or replace function private.syndikat_touch_save()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists syndikat_save_touch on public.syndikat_cloud_saves;
create trigger syndikat_save_touch
before update on public.syndikat_cloud_saves
for each row execute function private.syndikat_touch_save();

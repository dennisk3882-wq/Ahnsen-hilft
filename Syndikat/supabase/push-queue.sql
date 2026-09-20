-- Turn notifications are enqueued in the same transaction as the accepted turn.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create table if not exists public.syndikat_push_jobs (
 id uuid primary key default gen_random_uuid(),
 game_code text not null references public.syndikat_online_games(game_code) on delete cascade,
 revision bigint not null, participant_id uuid not null,
 token text not null default encode(extensions.gen_random_bytes(32),'hex'),
 status text not null default 'pending' check(status in ('pending','processing','sent','obsolete','failed')),
 attempts integer not null default 0, request_id bigint,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(game_code,revision)
);
alter table public.syndikat_push_jobs enable row level security;
revoke all on public.syndikat_push_jobs from public,anon,authenticated;
grant all on public.syndikat_push_jobs to service_role;
create policy push_jobs_deny on public.syndikat_push_jobs for all to anon,authenticated using(false) with check(false);
create index if not exists syndikat_push_jobs_due on public.syndikat_push_jobs(status,updated_at);

create or replace function syndikat_private.dispatch_push_jobs() returns void
language plpgsql security definer set search_path=pg_catalog,public,syndikat_private as $$
declare j public.syndikat_push_jobs; req bigint;
begin
 for j in select * from public.syndikat_push_jobs
   where attempts<6 and (status in ('pending','failed') or (status='processing' and updated_at<now()-interval '2 minutes'))
   and (attempts=0 or updated_at<now()-interval '1 minute') for update skip locked
 loop
   select net.http_post(
     url:='https://fnknttplbqwkzarbkbzb.supabase.co/functions/v1/syndikat-turn-push',
     body:=jsonb_build_object('action','dispatch','jobId',j.id,'jobToken',j.token),
     headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=10000) into req;
   update public.syndikat_push_jobs set attempts=attempts+1,request_id=req,status='pending',updated_at=now() where id=j.id;
 end loop;
end $$;
revoke all on function syndikat_private.dispatch_push_jobs() from public,anon,authenticated;

create or replace function syndikat_private.enqueue_turn_push() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,syndikat_private as $$
begin
 if new.status='playing' and new.active_participant_id is not null
    and (old.active_participant_id is distinct from new.active_participant_id or old.status is distinct from new.status)
    and exists(select 1 from public.syndikat_push_subscriptions where game_code=new.game_code and participant_id=new.active_participant_id) then
   insert into public.syndikat_push_jobs(game_code,revision,participant_id)
    values(new.game_code,new.revision,new.active_participant_id) on conflict do nothing;
   perform syndikat_private.dispatch_push_jobs();
 end if;
 return new;
end $$;
revoke all on function syndikat_private.enqueue_turn_push() from public,anon,authenticated;
drop trigger if exists syndikat_turn_push on public.syndikat_online_games;
create trigger syndikat_turn_push after update on public.syndikat_online_games
 for each row execute function syndikat_private.enqueue_turn_push();
select cron.schedule('syndikat-push-retry','* * * * *','select syndikat_private.dispatch_push_jobs()');

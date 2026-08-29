create table if not exists public.client_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 40),
  level text not null default 'error' check (level in ('info','warn','error')),
  code text not null check (char_length(code) between 1 and 80),
  message text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists client_events_household_created_idx on public.client_events(household_id,created_at desc);
alter table public.client_events enable row level security;
grant select,insert,delete on public.client_events to authenticated;
drop policy if exists client_events_insert_member on public.client_events;
create policy client_events_insert_member on public.client_events for insert to authenticated with check (private.is_household_member(household_id,auth.uid()) and user_id=auth.uid());
drop policy if exists client_events_select_admin on public.client_events;
create policy client_events_select_admin on public.client_events for select to authenticated using (private.household_role(household_id,auth.uid()) in ('owner','admin'));
drop policy if exists client_events_delete_owner on public.client_events;
create policy client_events_delete_owner on public.client_events for delete to authenticated using (private.household_role(household_id,auth.uid())='owner');

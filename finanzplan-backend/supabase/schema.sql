-- Finanzplan V3.1: Supabase schema for optional multiuser/cloud mode.
-- Run once in a NEW Supabase project via SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'adult' check (role in ('owner','admin','adult','limited')),
  display_name text not null default '',
  created_at timestamptz not null default now(),
  primary key (household_id,user_id)
);

create or replace function public.is_household_member(p_household uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.household_members m where m.household_id=p_household and m.user_id=auth.uid()) $$;

create or replace function public.household_role(p_household uuid)
returns text language sql stable security definer set search_path=public
as $$ select m.role from public.household_members m where m.household_id=p_household and m.user_id=auth.uid() limit 1 $$;

create or replace function public.add_household_owner()
returns trigger language plpgsql security definer set search_path=public
as $$ begin
  insert into public.household_members(household_id,user_id,role) values(new.id,new.owner_id,'owner') on conflict do nothing;
  return new;
end $$;

drop trigger if exists trg_household_owner on public.households;
create trigger trg_household_owner after insert on public.households for each row execute function public.add_household_owner();

create table if not exists public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  email text not null,
  role text not null default 'adult' check (role in ('admin','adult','limited')),
  token text not null unique,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id)
);

create table if not exists public.finance_records (
  household_id uuid not null references public.households(id) on delete cascade,
  collection text not null check (char_length(collection) between 1 and 60),
  record_id text not null check (char_length(record_id) between 1 and 200),
  payload jsonb not null default '{}'::jsonb,
  version bigint not null default 1 check (version>0),
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key(household_id,collection,record_id)
);
create index if not exists finance_records_updated_idx on public.finance_records(household_id,updated_at);

create table if not exists public.bank_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  provider text not null,
  bank text not null,
  session_id text not null,
  accounts jsonb not null default '[]'::jsonb,
  authorized_at timestamptz not null default now(),
  valid_until timestamptz,
  updated_at timestamptz not null default now(),
  unique(user_id,household_id,provider)
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  device_name text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.push_jobs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  source_key text not null,
  due_at timestamptz not null,
  title text not null,
  body text not null default '',
  url text not null default '',
  tag text not null default '',
  sent boolean not null default false,
  sent_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(household_id,source_key)
);
create index if not exists push_jobs_due_idx on public.push_jobs(sent,due_at);

create or replace function public.accept_household_invite(p_token text)
returns table(household_id uuid, role text)
language plpgsql security definer set search_path=public
as $$
declare inv public.household_invites%rowtype; mail text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  mail:=lower(coalesce(auth.jwt()->>'email',''));
  select * into inv from public.household_invites i
    where i.token=p_token and i.accepted_at is null and i.expires_at>now() for update;
  if not found then raise exception 'invite_invalid_or_expired'; end if;
  if lower(inv.email)<>mail then raise exception 'invite_email_mismatch'; end if;
  insert into public.household_members(household_id,user_id,role)
    values(inv.household_id,auth.uid(),inv.role)
    on conflict(household_id,user_id) do update set role=excluded.role;
  update public.household_invites set accepted_at=now(),accepted_by=auth.uid() where id=inv.id;
  return query select inv.household_id,inv.role;
end $$;

-- Optimistic concurrency: every cloud write carries the version last observed by the client.
create or replace function public.upsert_finance_record(
  p_household_id uuid,p_collection text,p_record_id text,p_payload jsonb,p_base_version bigint,p_deleted boolean default false
) returns public.finance_records
language plpgsql security definer set search_path=public
as $$
declare r public.finance_records%rowtype; role_now text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select public.household_role(p_household_id) into role_now;
  if role_now is null or role_now='limited' then raise exception 'write_not_allowed'; end if;
  select * into r from public.finance_records
    where household_id=p_household_id and collection=p_collection and record_id=p_record_id for update;
  if found then
    if r.version<>coalesce(p_base_version,0) then raise exception 'version_conflict'; end if;
    update public.finance_records set payload=coalesce(p_payload,'{}'::jsonb),deleted=coalesce(p_deleted,false),version=r.version+1,updated_at=now(),updated_by=auth.uid()
      where household_id=p_household_id and collection=p_collection and record_id=p_record_id returning * into r;
  else
    if coalesce(p_base_version,0)<>0 then raise exception 'version_conflict'; end if;
    insert into public.finance_records(household_id,collection,record_id,payload,version,deleted,updated_by)
      values(p_household_id,p_collection,p_record_id,coalesce(p_payload,'{}'::jsonb),1,coalesce(p_deleted,false),auth.uid()) returning * into r;
  end if;
  return r;
end $$;

grant execute on function public.accept_household_invite(text) to authenticated;
grant execute on function public.upsert_finance_record(uuid,text,text,jsonb,bigint,boolean) to authenticated;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.finance_records enable row level security;
alter table public.bank_sessions enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_jobs enable row level security;

-- Households
create policy "households_select_member" on public.households for select to authenticated using (public.is_household_member(id) or owner_id=auth.uid());
create policy "households_insert_owner" on public.households for insert to authenticated with check (owner_id=auth.uid());
create policy "households_update_admin" on public.households for update to authenticated using (owner_id=auth.uid() or public.household_role(id)='admin') with check (owner_id=auth.uid() or public.household_role(id)='admin');
create policy "households_delete_owner" on public.households for delete to authenticated using (owner_id=auth.uid());

-- Membership is visible to members; only owner/admin may directly alter it.
create policy "members_select_household" on public.household_members for select to authenticated using (public.is_household_member(household_id));
create policy "members_insert_admin" on public.household_members for insert to authenticated with check (public.household_role(household_id) in ('owner','admin'));
create policy "members_update_admin" on public.household_members for update to authenticated using (public.household_role(household_id) in ('owner','admin')) with check (public.household_role(household_id) in ('owner','admin'));
create policy "members_delete_admin" on public.household_members for delete to authenticated using (public.household_role(household_id) in ('owner','admin') and role<>'owner');

-- Invites
create policy "invites_select_admin" on public.household_invites for select to authenticated using (public.household_role(household_id) in ('owner','admin'));
create policy "invites_insert_admin" on public.household_invites for insert to authenticated with check (public.household_role(household_id) in ('owner','admin') and created_by=auth.uid());
create policy "invites_delete_admin" on public.household_invites for delete to authenticated using (public.household_role(household_id) in ('owner','admin'));

-- Finance records: limited members are read-only.
create policy "records_select_member" on public.finance_records for select to authenticated using (public.is_household_member(household_id));
create policy "records_insert_writer" on public.finance_records for insert to authenticated with check (public.household_role(household_id) in ('owner','admin','adult'));
create policy "records_update_writer" on public.finance_records for update to authenticated using (public.household_role(household_id) in ('owner','admin','adult')) with check (public.household_role(household_id) in ('owner','admin','adult'));
create policy "records_delete_writer" on public.finance_records for delete to authenticated using (public.household_role(household_id) in ('owner','admin','adult'));

-- Bank sessions and raw push subscriptions are backend/service-role only; no authenticated policies on purpose.

-- Push schedule may be managed by full household members and read by all household members.
create policy "push_jobs_select_member" on public.push_jobs for select to authenticated using (public.is_household_member(household_id));
create policy "push_jobs_insert_writer" on public.push_jobs for insert to authenticated with check (public.household_role(household_id) in ('owner','admin','adult') and created_by=auth.uid());
create policy "push_jobs_update_writer" on public.push_jobs for update to authenticated using (public.household_role(household_id) in ('owner','admin','adult')) with check (public.household_role(household_id) in ('owner','admin','adult'));
create policy "push_jobs_delete_writer" on public.push_jobs for delete to authenticated using (public.household_role(household_id) in ('owner','admin','adult'));

-- Receipt/document storage bucket. Files are stored as <household_uuid>/<document_id>.
insert into storage.buckets(id,name,public,file_size_limit) values('finance-documents','finance-documents',false,20971520)
on conflict(id) do update set public=false,file_size_limit=20971520;

create policy "finance_documents_select" on storage.objects for select to authenticated
using (bucket_id='finance-documents' and public.is_household_member(((storage.foldername(name))[1])::uuid));
create policy "finance_documents_insert" on storage.objects for insert to authenticated
with check (bucket_id='finance-documents' and public.household_role(((storage.foldername(name))[1])::uuid) in ('owner','admin','adult'));
create policy "finance_documents_update" on storage.objects for update to authenticated
using (bucket_id='finance-documents' and public.household_role(((storage.foldername(name))[1])::uuid) in ('owner','admin','adult'))
with check (bucket_id='finance-documents' and public.household_role(((storage.foldername(name))[1])::uuid) in ('owner','admin','adult'));
create policy "finance_documents_delete" on storage.objects for delete to authenticated
using (bucket_id='finance-documents' and public.household_role(((storage.foldername(name))[1])::uuid) in ('owner','admin','adult'));

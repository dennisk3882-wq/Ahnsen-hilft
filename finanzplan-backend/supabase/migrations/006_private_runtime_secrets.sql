-- V3.2 server-secret storage. Actual secret values are provisioned directly in Supabase and never committed.
create table if not exists private.runtime_secrets (
  name text primary key,
  secret text not null,
  updated_at timestamptz not null default now()
);

revoke all on private.runtime_secrets from public, anon, authenticated;
grant usage on schema private to service_role;
grant select on private.runtime_secrets to service_role;

create or replace function public.get_runtime_secret(p_name text)
returns text
language sql
stable
security invoker
set search_path=''
as $$
  select secret from private.runtime_secrets where name=p_name
$$;

revoke all on function public.get_runtime_secret(text) from public, anon, authenticated;
grant execute on function public.get_runtime_secret(text) to service_role;

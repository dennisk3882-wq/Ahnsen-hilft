-- Finanzplan V3.1 follow-up hardening. Apply after schema.sql on existing installations.
-- Hosted project yhsuuoexxjejboqbrvuk already has the equivalent migration applied.

alter table public.households alter column owner_id set default auth.uid();

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.is_household_member(p_household uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.household_members m where m.household_id=p_household and m.user_id=p_user) $$;

create or replace function private.household_role(p_household uuid, p_user uuid default auth.uid())
returns text language sql stable security definer set search_path=''
as $$ select m.role from public.household_members m where m.household_id=p_household and m.user_id=p_user limit 1 $$;

create or replace function private.add_household_owner()
returns trigger language plpgsql security definer set search_path=''
as $$ begin insert into public.household_members(household_id,user_id,role) values(new.id,new.owner_id,'owner') on conflict do nothing; return new; end $$;

drop trigger if exists trg_household_owner on public.households;
create trigger trg_household_owner after insert on public.households for each row execute function private.add_household_owner();

create or replace function private.accept_household_invite_impl(p_token text)
returns table(household_id uuid, role text)
language plpgsql security definer set search_path=''
as $$
declare inv public.household_invites%rowtype; mail text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  mail:=lower(coalesce(auth.jwt()->>'email',''));
  select * into inv from public.household_invites i where i.token=p_token and i.accepted_at is null and i.expires_at>now() for update;
  if not found then raise exception 'invite_invalid_or_expired'; end if;
  if lower(inv.email)<>mail then raise exception 'invite_email_mismatch'; end if;
  insert into public.household_members(household_id,user_id,role) values(inv.household_id,auth.uid(),inv.role)
    on conflict(household_id,user_id) do update set role=excluded.role;
  update public.household_invites set accepted_at=now(),accepted_by=auth.uid() where id=inv.id;
  return query select inv.household_id,inv.role;
end $$;

create or replace function private.upsert_finance_record_impl(
  p_household_id uuid,p_collection text,p_record_id text,p_payload jsonb,p_base_version bigint,p_deleted boolean default false
) returns public.finance_records
language plpgsql security definer set search_path=''
as $$
declare r public.finance_records%rowtype; role_now text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select private.household_role(p_household_id,auth.uid()) into role_now;
  if role_now is null or role_now='limited' then raise exception 'write_not_allowed'; end if;
  select * into r from public.finance_records where household_id=p_household_id and collection=p_collection and record_id=p_record_id for update;
  if found then
    if r.version<>coalesce(p_base_version,0) then raise exception 'version_conflict'; end if;
    update public.finance_records set payload=coalesce(p_payload,'{}'::jsonb),deleted=coalesce(p_deleted,false),version=r.version+1,
      updated_at=now(),updated_by=auth.uid()
      where household_id=p_household_id and collection=p_collection and record_id=p_record_id returning * into r;
  else
    if coalesce(p_base_version,0)<>0 then raise exception 'version_conflict'; end if;
    insert into public.finance_records(household_id,collection,record_id,payload,version,deleted,updated_by)
      values(p_household_id,p_collection,p_record_id,coalesce(p_payload,'{}'::jsonb),1,coalesce(p_deleted,false),auth.uid()) returning * into r;
  end if;
  return r;
end $$;

create or replace function public.accept_household_invite(p_token text)
returns table(household_id uuid, role text)
language sql security invoker set search_path=''
as $$ select * from private.accept_household_invite_impl(p_token) $$;

create or replace function public.upsert_finance_record(
  p_household_id uuid,p_collection text,p_record_id text,p_payload jsonb,p_base_version bigint,p_deleted boolean default false
) returns public.finance_records
language sql security invoker set search_path=''
as $$ select private.upsert_finance_record_impl(p_household_id,p_collection,p_record_id,p_payload,p_base_version,p_deleted) $$;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke all on function private.accept_household_invite_impl(text) from public,anon;
revoke all on function private.upsert_finance_record_impl(uuid,text,text,jsonb,bigint,boolean) from public,anon;
grant execute on function private.accept_household_invite_impl(text) to authenticated;
grant execute on function private.upsert_finance_record_impl(uuid,text,text,jsonb,bigint,boolean) to authenticated;
revoke all on function public.accept_household_invite(text) from public,anon;
revoke all on function public.upsert_finance_record(uuid,text,text,jsonb,bigint,boolean) from public,anon;
grant execute on function public.accept_household_invite(text) to authenticated;
grant execute on function public.upsert_finance_record(uuid,text,text,jsonb,bigint,boolean) to authenticated;

-- Backend-only tables: service role bypasses RLS; ordinary authenticated clients are explicitly denied.
drop policy if exists bank_sessions_deny_authenticated on public.bank_sessions;
create policy bank_sessions_deny_authenticated on public.bank_sessions as restrictive for all to authenticated using (false) with check (false);
drop policy if exists push_subscriptions_deny_authenticated on public.push_subscriptions;
create policy push_subscriptions_deny_authenticated on public.push_subscriptions as restrictive for all to authenticated using (false) with check (false);

-- Replace public helper calls in RLS/storage policies with private helpers.
drop policy if exists households_select_member on public.households;
drop policy if exists households_insert_owner on public.households;
drop policy if exists households_update_admin on public.households;
drop policy if exists households_delete_owner on public.households;
create policy households_select_member on public.households for select to authenticated using (private.is_household_member(id,auth.uid()) or owner_id=auth.uid());
create policy households_insert_owner on public.households for insert to authenticated with check (owner_id=auth.uid());
create policy households_update_admin on public.households for update to authenticated using (owner_id=auth.uid() or private.household_role(id,auth.uid())='admin') with check (owner_id=auth.uid() or private.household_role(id,auth.uid())='admin');
create policy households_delete_owner on public.households for delete to authenticated using (owner_id=auth.uid());

drop policy if exists members_select_household on public.household_members;
drop policy if exists members_insert_admin on public.household_members;
drop policy if exists members_update_admin on public.household_members;
drop policy if exists members_delete_admin on public.household_members;
create policy members_select_household on public.household_members for select to authenticated using (private.is_household_member(household_id,auth.uid()));
create policy members_insert_admin on public.household_members for insert to authenticated with check (private.household_role(household_id,auth.uid()) in ('owner','admin'));
create policy members_update_admin on public.household_members for update to authenticated using (private.household_role(household_id,auth.uid()) in ('owner','admin')) with check (private.household_role(household_id,auth.uid()) in ('owner','admin'));
create policy members_delete_admin on public.household_members for delete to authenticated using (private.household_role(household_id,auth.uid()) in ('owner','admin') and role<>'owner');

drop policy if exists invites_select_admin on public.household_invites;
drop policy if exists invites_insert_admin on public.household_invites;
drop policy if exists invites_delete_admin on public.household_invites;
create policy invites_select_admin on public.household_invites for select to authenticated using (private.household_role(household_id,auth.uid()) in ('owner','admin'));
create policy invites_insert_admin on public.household_invites for insert to authenticated with check (private.household_role(household_id,auth.uid()) in ('owner','admin') and created_by=auth.uid());
create policy invites_delete_admin on public.household_invites for delete to authenticated using (private.household_role(household_id,auth.uid()) in ('owner','admin'));

drop policy if exists records_select_member on public.finance_records;
drop policy if exists records_insert_writer on public.finance_records;
drop policy if exists records_update_writer on public.finance_records;
drop policy if exists records_delete_writer on public.finance_records;
create policy records_select_member on public.finance_records for select to authenticated using (private.is_household_member(household_id,auth.uid()));
create policy records_insert_writer on public.finance_records for insert to authenticated with check (private.household_role(household_id,auth.uid()) in ('owner','admin','adult'));
create policy records_update_writer on public.finance_records for update to authenticated using (private.household_role(household_id,auth.uid()) in ('owner','admin','adult')) with check (private.household_role(household_id,auth.uid()) in ('owner','admin','adult'));
create policy records_delete_writer on public.finance_records for delete to authenticated using (private.household_role(household_id,auth.uid()) in ('owner','admin','adult'));

drop policy if exists push_jobs_select_member on public.push_jobs;
drop policy if exists push_jobs_insert_writer on public.push_jobs;
drop policy if exists push_jobs_update_writer on public.push_jobs;
drop policy if exists push_jobs_delete_writer on public.push_jobs;
create policy push_jobs_select_member on public.push_jobs for select to authenticated using (private.is_household_member(household_id,auth.uid()));
create policy push_jobs_insert_writer on public.push_jobs for insert to authenticated with check (private.household_role(household_id,auth.uid()) in ('owner','admin','adult') and created_by=auth.uid());
create policy push_jobs_update_writer on public.push_jobs for update to authenticated using (private.household_role(household_id,auth.uid()) in ('owner','admin','adult')) with check (private.household_role(household_id,auth.uid()) in ('owner','admin','adult'));
create policy push_jobs_delete_writer on public.push_jobs for delete to authenticated using (private.household_role(household_id,auth.uid()) in ('owner','admin','adult'));

drop policy if exists finance_documents_select on storage.objects;
drop policy if exists finance_documents_insert on storage.objects;
drop policy if exists finance_documents_update on storage.objects;
drop policy if exists finance_documents_delete on storage.objects;
create policy finance_documents_select on storage.objects for select to authenticated using (bucket_id='finance-documents' and private.is_household_member(((storage.foldername(name))[1])::uuid,auth.uid()));
create policy finance_documents_insert on storage.objects for insert to authenticated with check (bucket_id='finance-documents' and private.household_role(((storage.foldername(name))[1])::uuid,auth.uid()) in ('owner','admin','adult'));
create policy finance_documents_update on storage.objects for update to authenticated using (bucket_id='finance-documents' and private.household_role(((storage.foldername(name))[1])::uuid,auth.uid()) in ('owner','admin','adult')) with check (bucket_id='finance-documents' and private.household_role(((storage.foldername(name))[1])::uuid,auth.uid()) in ('owner','admin','adult'));
create policy finance_documents_delete on storage.objects for delete to authenticated using (bucket_id='finance-documents' and private.household_role(((storage.foldername(name))[1])::uuid,auth.uid()) in ('owner','admin','adult'));

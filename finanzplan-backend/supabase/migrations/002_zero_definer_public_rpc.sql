-- Finanzplan V3.1 final RLS/RPC hardening.
-- Public RPCs stay SECURITY INVOKER; all authorization is enforced by RLS.

drop policy if exists invites_select_invitee on public.household_invites;
create policy invites_select_invitee on public.household_invites for select to authenticated
using (accepted_at is null and expires_at>now() and lower(email)=lower(coalesce(auth.jwt()->>'email','')));

drop policy if exists invites_accept_invitee on public.household_invites;
create policy invites_accept_invitee on public.household_invites for update to authenticated
using (accepted_at is null and expires_at>now() and lower(email)=lower(coalesce(auth.jwt()->>'email','')))
with check (lower(email)=lower(coalesce(auth.jwt()->>'email','')) and accepted_at is not null and accepted_by=auth.uid());

drop policy if exists members_insert_invitee on public.household_members;
create policy members_insert_invitee on public.household_members for insert to authenticated
with check (
  user_id=auth.uid() and exists(
    select 1 from public.household_invites i
    where i.household_id=household_members.household_id
      and i.role=household_members.role
      and i.accepted_at is null and i.expires_at>now()
      and lower(i.email)=lower(coalesce(auth.jwt()->>'email',''))
  )
);

revoke update on public.household_invites from authenticated;
grant update(accepted_at,accepted_by) on public.household_invites to authenticated;

create or replace function public.accept_household_invite(p_token text)
returns table(household_id uuid, role text)
language plpgsql security invoker set search_path=''
as $$
declare inv public.household_invites%rowtype; mail text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  mail:=lower(coalesce(auth.jwt()->>'email',''));
  select * into inv from public.household_invites i
    where i.token=p_token and i.accepted_at is null and i.expires_at>now() and lower(i.email)=mail for update;
  if not found then raise exception 'invite_invalid_expired_or_email_mismatch'; end if;
  insert into public.household_members(household_id,user_id,role)
    values(inv.household_id,auth.uid(),inv.role)
    on conflict(household_id,user_id) do nothing;
  update public.household_invites set accepted_at=now(),accepted_by=auth.uid() where id=inv.id;
  return query select inv.household_id,inv.role;
end $$;

create or replace function public.upsert_finance_record(
  p_household_id uuid,p_collection text,p_record_id text,p_payload jsonb,p_base_version bigint,p_deleted boolean default false
) returns public.finance_records
language plpgsql security invoker set search_path=''
as $$
declare r public.finance_records%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into r from public.finance_records
    where household_id=p_household_id and collection=p_collection and record_id=p_record_id for update;
  if found then
    if r.version<>coalesce(p_base_version,0) then raise exception 'version_conflict'; end if;
    update public.finance_records
      set payload=coalesce(p_payload,'{}'::jsonb),deleted=coalesce(p_deleted,false),version=r.version+1,updated_at=now(),updated_by=auth.uid()
      where household_id=p_household_id and collection=p_collection and record_id=p_record_id returning * into r;
  else
    if coalesce(p_base_version,0)<>0 then raise exception 'version_conflict'; end if;
    insert into public.finance_records(household_id,collection,record_id,payload,version,deleted,updated_by)
      values(p_household_id,p_collection,p_record_id,coalesce(p_payload,'{}'::jsonb),1,coalesce(p_deleted,false),auth.uid()) returning * into r;
  end if;
  return r;
end $$;

revoke all on function public.accept_household_invite(text) from public,anon;
revoke all on function public.upsert_finance_record(uuid,text,text,jsonb,bigint,boolean) from public,anon;
grant execute on function public.accept_household_invite(text) to authenticated;
grant execute on function public.upsert_finance_record(uuid,text,text,jsonb,bigint,boolean) to authenticated;

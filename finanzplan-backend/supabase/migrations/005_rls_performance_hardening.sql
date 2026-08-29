create index if not exists bank_sessions_household_idx on public.bank_sessions(household_id);
create index if not exists client_events_user_idx on public.client_events(user_id);
create index if not exists finance_records_updated_by_idx on public.finance_records(updated_by);
create index if not exists household_invites_accepted_by_idx on public.household_invites(accepted_by);
create index if not exists household_invites_created_by_idx on public.household_invites(created_by);
create index if not exists household_invites_household_idx on public.household_invites(household_id);
create index if not exists household_members_user_idx on public.household_members(user_id);
create index if not exists households_owner_idx on public.households(owner_id);
create index if not exists push_jobs_created_by_idx on public.push_jobs(created_by);
create index if not exists push_subscriptions_household_idx on public.push_subscriptions(household_id);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

drop policy if exists households_select_member on public.households;
create policy households_select_member on public.households for select to authenticated using (private.is_household_member(id,(select auth.uid())) or owner_id=(select auth.uid()));
drop policy if exists households_insert_owner on public.households;
create policy households_insert_owner on public.households for insert to authenticated with check (owner_id=(select auth.uid()));
drop policy if exists households_update_admin on public.households;
create policy households_update_admin on public.households for update to authenticated using (owner_id=(select auth.uid()) or private.household_role(id,(select auth.uid()))='admin') with check (owner_id=(select auth.uid()) or private.household_role(id,(select auth.uid()))='admin');
drop policy if exists households_delete_owner on public.households;
create policy households_delete_owner on public.households for delete to authenticated using (owner_id=(select auth.uid()));

drop policy if exists members_select_household on public.household_members;
create policy members_select_household on public.household_members for select to authenticated using (private.is_household_member(household_id,(select auth.uid())));
drop policy if exists members_insert_admin on public.household_members;
drop policy if exists members_insert_invitee on public.household_members;
create policy members_insert_allowed on public.household_members for insert to authenticated with check (
  private.household_role(household_id,(select auth.uid())) in ('owner','admin')
  or (
    user_id=(select auth.uid()) and exists (
      select 1 from public.household_invites i
      where i.household_id=household_members.household_id
        and i.role=household_members.role
        and i.accepted_at is null
        and i.expires_at>now()
        and lower(i.email)=lower(coalesce((select auth.jwt())->>'email',''))
    )
  )
);
drop policy if exists members_update_admin on public.household_members;
create policy members_update_admin on public.household_members for update to authenticated using (private.household_role(household_id,(select auth.uid())) in ('owner','admin')) with check (private.household_role(household_id,(select auth.uid())) in ('owner','admin'));
drop policy if exists members_delete_admin on public.household_members;
create policy members_delete_admin on public.household_members for delete to authenticated using (private.household_role(household_id,(select auth.uid())) in ('owner','admin') and role<>'owner');

drop policy if exists invites_select_admin on public.household_invites;
drop policy if exists invites_select_invitee on public.household_invites;
create policy invites_select_allowed on public.household_invites for select to authenticated using (
  private.household_role(household_id,(select auth.uid())) in ('owner','admin')
  or (accepted_at is null and expires_at>now() and lower(email)=lower(coalesce((select auth.jwt())->>'email','')))
);
drop policy if exists invites_insert_admin on public.household_invites;
create policy invites_insert_admin on public.household_invites for insert to authenticated with check (private.household_role(household_id,(select auth.uid())) in ('owner','admin') and created_by=(select auth.uid()));
drop policy if exists invites_accept_invitee on public.household_invites;
create policy invites_accept_invitee on public.household_invites for update to authenticated using (accepted_at is null and expires_at>now() and lower(email)=lower(coalesce((select auth.jwt())->>'email',''))) with check (lower(email)=lower(coalesce((select auth.jwt())->>'email','')) and accepted_at is not null and accepted_by=(select auth.uid()));
drop policy if exists invites_delete_admin on public.household_invites;
create policy invites_delete_admin on public.household_invites for delete to authenticated using (private.household_role(household_id,(select auth.uid())) in ('owner','admin'));

drop policy if exists records_select_member on public.finance_records;
create policy records_select_member on public.finance_records for select to authenticated using (private.is_household_member(household_id,(select auth.uid())));
drop policy if exists records_insert_writer on public.finance_records;
create policy records_insert_writer on public.finance_records for insert to authenticated with check (private.household_role(household_id,(select auth.uid())) in ('owner','admin','adult'));
drop policy if exists records_update_writer on public.finance_records;
create policy records_update_writer on public.finance_records for update to authenticated using (private.household_role(household_id,(select auth.uid())) in ('owner','admin','adult')) with check (private.household_role(household_id,(select auth.uid())) in ('owner','admin','adult'));
drop policy if exists records_delete_writer on public.finance_records;
create policy records_delete_writer on public.finance_records for delete to authenticated using (private.household_role(household_id,(select auth.uid())) in ('owner','admin','adult'));

drop policy if exists push_jobs_select_member on public.push_jobs;
create policy push_jobs_select_member on public.push_jobs for select to authenticated using (private.is_household_member(household_id,(select auth.uid())));
drop policy if exists push_jobs_insert_writer on public.push_jobs;
create policy push_jobs_insert_writer on public.push_jobs for insert to authenticated with check (private.household_role(household_id,(select auth.uid())) in ('owner','admin','adult') and created_by=(select auth.uid()));
drop policy if exists push_jobs_update_writer on public.push_jobs;
create policy push_jobs_update_writer on public.push_jobs for update to authenticated using (private.household_role(household_id,(select auth.uid())) in ('owner','admin','adult')) with check (private.household_role(household_id,(select auth.uid())) in ('owner','admin','adult'));
drop policy if exists push_jobs_delete_writer on public.push_jobs;
create policy push_jobs_delete_writer on public.push_jobs for delete to authenticated using (private.household_role(household_id,(select auth.uid())) in ('owner','admin','adult'));

drop policy if exists client_events_insert_member on public.client_events;
create policy client_events_insert_member on public.client_events for insert to authenticated with check (private.is_household_member(household_id,(select auth.uid())) and user_id=(select auth.uid()));
drop policy if exists client_events_select_admin on public.client_events;
create policy client_events_select_admin on public.client_events for select to authenticated using (private.household_role(household_id,(select auth.uid())) in ('owner','admin'));
drop policy if exists client_events_delete_owner on public.client_events;
create policy client_events_delete_owner on public.client_events for delete to authenticated using (private.household_role(household_id,(select auth.uid()))='owner');

-- Allow one Finanzplan user to connect more than one PSD2 institution
-- (for example N26 and a Sparkasse) inside the same household.
alter table public.bank_sessions
  drop constraint if exists bank_sessions_user_id_household_id_provider_key;

alter table public.bank_sessions
  add constraint bank_sessions_user_household_provider_bank_key
  unique (user_id, household_id, provider, bank);

create index if not exists bank_sessions_user_household_idx
  on public.bank_sessions (user_id, household_id);

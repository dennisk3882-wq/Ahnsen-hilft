-- The dispatcher token is read at runtime from private.runtime_secrets.
-- No credential is stored in this migration.
create or replace function private.dispatch_finanzplan_push()
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  tok text;
  request_id bigint;
begin
  select secret into tok from private.runtime_secrets where name='dispatch_token';
  if tok is null or tok='' then
    raise exception 'dispatch_token missing';
  end if;

  select net.http_post(
    url:='https://yhsuuoexxjejboqbrvuk.supabase.co/functions/v1/finanzplan-push-dispatch',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'x-finanzplan-dispatch-token',tok
    ),
    body:='{}'::jsonb,
    timeout_milliseconds:=10000
  ) into request_id;

  return request_id;
end $$;

revoke all on function private.dispatch_finanzplan_push() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('finanzplan-push-dispatch');
exception when others then null;
end $$;

select cron.schedule(
  'finanzplan-push-dispatch',
  '*/5 * * * *',
  'select private.dispatch_finanzplan_push();'
);

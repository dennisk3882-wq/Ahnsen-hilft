-- Keep pg_net out of the public API schema and recreate the Finanzplan push cron.
-- The dispatcher endpoint is idempotent and processes only already-due server-side jobs.

do $$
declare r record;
begin
  for r in select jobid from cron.job where jobname='finanzplan-push-dispatch' loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;

drop extension if exists pg_net;
drop schema if exists net cascade;
create extension pg_net schema extensions;

select cron.schedule(
  'finanzplan-push-dispatch',
  '*/5 * * * *',
  $$select net.http_post(
    url:='https://yhsuuoexxjejboqbrvuk.supabase.co/functions/v1/finanzplan-push-dispatch',
    headers:='{"Content-Type":"application/json"}'::jsonb,
    body:='{}'::jsonb,
    timeout_milliseconds:=10000
  ) as request_id;$$
);

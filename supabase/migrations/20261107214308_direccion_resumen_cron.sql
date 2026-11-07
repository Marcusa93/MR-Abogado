-- Resumen de dirección los lunes 8:00 (Argentina) = 11:00 UTC.
-- Reemplaza a resumen-semanal y sin-movimiento-notify-semanal (quedan dados de baja).
-- Además, caja-resumen-telegram-lunes y agenda-telegram-diaria leían el secreto de
-- current_setting('app.cron_secret'), que no existe: pasan a public.functions_cron_secret().

SELECT cron.unschedule(jobid) FROM cron.job
WHERE jobname IN ('resumen-semanal', 'sin-movimiento-notify-semanal', 'direccion-resumen-lunes');

SELECT cron.schedule(
  'direccion-resumen-lunes',
  '0 11 * * 1',
  $cron$
  SELECT net.http_post(
    url := 'https://ftxpilbvjfxfkjkrbrnl.supabase.co/functions/v1/direccion-resumen',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.functions_cron_secret()),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);

SELECT cron.alter_job(jobid, command := $cron$
  SELECT net.http_post(
    url := 'https://ftxpilbvjfxfkjkrbrnl.supabase.co/functions/v1/caja-resumen-telegram',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.functions_cron_secret()),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$)
FROM cron.job WHERE jobname = 'caja-resumen-telegram-lunes';

SELECT cron.alter_job(jobid, command := $cron$
  SELECT net.http_post(
    url := 'https://ftxpilbvjfxfkjkrbrnl.supabase.co/functions/v1/agenda-telegram',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.functions_cron_secret()),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$)
FROM cron.job WHERE jobname = 'agenda-telegram-diaria';

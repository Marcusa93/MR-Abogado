-- Dos crons fallaban con 401:
--   sae-daily-reminders → leía 'cron_secret' de Vault, desactualizado respecto de CRON_SECRET.
--   caja-analisis-ia    → mandaba x-cron-secret vacío.
-- Ambos pasan a usar public.functions_cron_secret() (ver 20261007232714).

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'sae-daily-reminders'),
  command := $cron$
  SELECT net.http_post(
    url := 'https://ftxpilbvjfxfkjkrbrnl.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.functions_cron_secret()
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'caja-analisis-ia'),
  command := $cron$
  SELECT net.http_post(
    url := 'https://ftxpilbvjfxfkjkrbrnl.supabase.co/functions/v1/caja-analisis-ia',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.functions_cron_secret()
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);

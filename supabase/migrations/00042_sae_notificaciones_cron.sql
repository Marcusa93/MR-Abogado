-- ============================================================
-- Cron 2x al día para sae-poll-notificaciones.
--
-- 00:15 AR = 03:15 UTC  (UTC-3, sin horario de verano en AR)
-- 08:30 AR = 11:30 UTC
--
-- Captura las notificaciones digitales publicadas durante la
-- madrugada y a primera hora.
--
-- Requiere que el secret CRON_SECRET esté seteado tanto en
-- pg_settings (app.cron_secret) como en los secrets de Edge Functions
-- — mismo flujo que la migración 00030.
-- ============================================================

-- Cron de medianoche
SELECT cron.schedule(
  'sae-notif-poll-medianoche',
  '15 3 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://ftxpilbvjfxfkjkrbrnl.supabase.co/functions/v1/sae-poll-notificaciones',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);

-- Cron de la mañana (también procesa pushes diferidos por quiet hours)
SELECT cron.schedule(
  'sae-notif-poll-manana',
  '30 11 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://ftxpilbvjfxfkjkrbrnl.supabase.co/functions/v1/sae-poll-notificaciones',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);

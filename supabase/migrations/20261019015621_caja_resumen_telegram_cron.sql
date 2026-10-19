-- Cron: resumen semanal de caja por Telegram (lunes 08:00 AR = 11:00 UTC)
SELECT cron.schedule(
  'caja-resumen-telegram-lunes',
  '0 11 * * 1',
  $cron$
  SELECT net.http_post(
    url := 'https://ftxpilbvjfxfkjkrbrnl.supabase.co/functions/v1/caja-resumen-telegram',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);
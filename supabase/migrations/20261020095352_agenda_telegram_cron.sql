-- Cron: agenda diaria por Telegram (lunes a viernes 10:00 UTC = 07:00 AR)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agenda-telegram-diaria') THEN
    PERFORM cron.unschedule('agenda-telegram-diaria');
  END IF;
END $$;

SELECT cron.schedule(
  'agenda-telegram-diaria',
  '0 10 * * 1-5',
  $cron$
  SELECT net.http_post(
    url := 'https://ftxpilbvjfxfkjkrbrnl.supabase.co/functions/v1/agenda-telegram',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);
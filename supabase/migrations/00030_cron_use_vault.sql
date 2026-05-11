-- ============================================================
-- Migración 030: Cron de recordatorios lee secret desde Supabase Vault
--
-- En la nube de Supabase el rol postgres no tiene permiso para
-- ALTER DATABASE SET app.cron_secret, así que migramos a Vault, que es
-- el mecanismo soportado para almacenar secrets accesibles desde SQL.
--
-- Pre-requisito (configurado a mano por el dev en SQL Editor):
--   SELECT vault.create_secret('<valor>', 'cron_secret', 'Secret for daily reminders cron job');
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sae-daily-reminders') THEN
    PERFORM cron.unschedule('sae-daily-reminders');
  END IF;
END $$;

SELECT cron.schedule(
  'sae-daily-reminders',
  '0 11 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://ftxpilbvjfxfkjkrbrnl.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'cron_secret'
        LIMIT 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);

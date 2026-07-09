-- ============================================================
-- Cron diario para sincronización automática de actuaciones SAE.
--
-- 09:00 UTC = 06:00 Argentina (UTC-3, sin horario de verano)
-- Corre antes de que el estudio abra: el abogado llega y ya tiene
-- las notificaciones push de las novedades del día.
--
-- La función sae-sync-all itera todos los expedientes con
-- credenciales SAE activas y llama a sae-sync con service_role.
-- Saltea expedientes sincronizados en las últimas 20h.
--
-- Requiere CRON_SECRET en pg_settings (app.cron_secret) y en
-- los secrets de Edge Functions — mismo flujo que 00042.
-- ============================================================

SELECT cron.schedule(
  'sae-sync-all-manana',
  '0 9 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://ftxpilbvjfxfkjkrbrnl.supabase.co/functions/v1/sae-sync-all',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);

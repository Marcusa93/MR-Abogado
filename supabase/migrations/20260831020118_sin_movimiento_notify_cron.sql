-- ──────────────────────────────────────────────────────────────────────────
-- Cron semanal: aviso de asuntos sin movimiento
--
-- Lunes 11:00 UTC = 8:00 Argentina (UTC-3, sin horario de verano).
-- Llama a la edge function sin-movimiento-notify con el secreto de cron.
-- Umbral por defecto: 30 días (configurable con ?dias=N o env SIN_MOVIMIENTO_DIAS).
-- ──────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sin-movimiento-notify-semanal') THEN
    PERFORM cron.schedule(
      'sin-movimiento-notify-semanal',
      '0 11 * * 1',
      $cron$
      SELECT net.http_post(
        url := 'https://ftxpilbvjfxfkjkrbrnl.supabase.co/functions/v1/sin-movimiento-notify',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', current_setting('app.cron_secret', true)
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      );
      $cron$
    );
  END IF;
END;
$$;

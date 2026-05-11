-- ============================================================
-- Migración 029: Recordatorios diarios automáticos vía pg_cron
--
-- Agrega columna last_reminder_at a tareas/audiencias para idempotencia,
-- y programa un job de pg_cron que llama a la edge function send-reminders
-- todos los días a las 11:00 UTC (= 8 AM Argentina, UTC-3).
--
-- Pre-requisitos (configurados a mano por el dev):
--   - Extensiones pg_cron y pg_net habilitadas (Dashboard → Extensions)
--   - Setting Postgres app.cron_secret seteado con:
--       ALTER DATABASE postgres SET app.cron_secret = 'mismo-valor-que-CRON_SECRET';
-- ============================================================

ALTER TABLE public.tareas
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz;

ALTER TABLE public.audiencias
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz;

-- Índice parcial para que la edge function encuentre rápido los pendientes
CREATE INDEX IF NOT EXISTS idx_tareas_pending_reminders
  ON public.tareas (fecha_vencimiento, estado)
  WHERE fecha_vencimiento IS NOT NULL AND estado IN ('PENDIENTE', 'EN_PROGRESO');

CREATE INDEX IF NOT EXISTS idx_audiencias_pending_reminders
  ON public.audiencias (fecha, estado)
  WHERE estado IN ('PENDIENTE', 'CONFIRMADA');

-- ── Cron job ──────────────────────────────────────────────────────────
-- Borra el job si ya existía (para que el migrate sea idempotente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sae-daily-reminders') THEN
    PERFORM cron.unschedule('sae-daily-reminders');
  END IF;
END $$;

-- Programa el job: todos los días 11:00 UTC (8 AM Argentina, UTC-3)
SELECT cron.schedule(
  'sae-daily-reminders',
  '0 11 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://ftxpilbvjfxfkjkrbrnl.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);

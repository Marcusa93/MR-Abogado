-- ============================================================
-- Contenidos: columna imagen_url + cron recordatorio
-- ============================================================

ALTER TABLE public.contenidos ADD COLUMN IF NOT EXISTS imagen_url text;

COMMENT ON COLUMN public.contenidos.imagen_url IS
  'URL pública de la imagen adjunta al contenido (Supabase Storage, bucket contenidos-media).';

-- ── Cron: recordatorio diario de contenidos programados ──────────────────────
-- 12:00 UTC = 9:00 Argentina (UTC-3)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'contenido-recordatorio') THEN
    PERFORM cron.unschedule('contenido-recordatorio');
  END IF;
END $$;

SELECT cron.schedule(
  'contenido-recordatorio',
  '0 12 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://ftxpilbvjfxfkjkrbrnl.supabase.co/functions/v1/contenido-recordatorio',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);

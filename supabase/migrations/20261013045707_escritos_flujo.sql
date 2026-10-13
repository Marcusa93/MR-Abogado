-- Escritos: después de generar. Presentación manual (portal SAE / mesa de
-- entradas), tarea de seguimiento, detección del proveído y recordatorios.

ALTER TABLE public.escritos
  ADD COLUMN IF NOT EXISTS presentado_at timestamptz,
  ADD COLUMN IF NOT EXISTS presentacion_manual jsonb,          -- { medio, comprobante, nota }
  ADD COLUMN IF NOT EXISTS tarea_seguimiento_id uuid REFERENCES public.tareas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proveido_movement_id uuid REFERENCES public.sae_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proveido_at timestamptz,
  ADD COLUMN IF NOT EXISTS revision_ia jsonb,                  -- último control de calidad
  ADD COLUMN IF NOT EXISTS revision_ia_at timestamptz;

CREATE INDEX IF NOT EXISTS escritos_esperando_proveido_idx ON public.escritos (expediente_id)
  WHERE estado IN ('presentado', 'presentado_sae') AND proveido_movement_id IS NULL;

-- Proveídos: L-V cada 2 horas entre 8 y 20 (AR); los lunes además el resumen de borradores
SELECT cron.unschedule('escritos-seguimiento') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'escritos-seguimiento');
SELECT cron.schedule('escritos-seguimiento', '20 11-23/2 * * 1-5', $cron$
  SELECT net.http_post(
    url := 'https://ftxpilbvjfxfkjkrbrnl.supabase.co/functions/v1/escritos-seguimiento',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.functions_cron_secret()),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$cron$);

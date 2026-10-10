-- Procuración automática por expediente.
--
-- Con el interruptor activo, la function procuracion-procesar (cron) toma cada
-- actuación nueva del SAE, la clasifica, calcula el plazo, crea la tarea para el
-- responsable y, si corresponde, deja el borrador del escrito. Nunca presenta:
-- el escrito queda en 'borrador' para revisión del abogado.

-- ── 1. Interruptor por expediente ─────────────────────────────────────────────

ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS procuracion_auto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS procuracion_desde timestamptz,
  ADD COLUMN IF NOT EXISTS procuracion_responsable_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expedientes_procuracion_auto
  ON public.expedientes(procuracion_auto) WHERE procuracion_auto;

-- procuracion_desde se fija al activar: solo se procesan actuaciones desde ahí
-- (más una ventana corta hacia atrás, ver la function).
CREATE OR REPLACE FUNCTION public.set_procuracion_desde()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.procuracion_auto AND NOT coalesce(OLD.procuracion_auto, false) THEN
    NEW.procuracion_desde := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_procuracion_desde ON public.expedientes;
CREATE TRIGGER set_procuracion_desde
  BEFORE UPDATE OF procuracion_auto ON public.expedientes
  FOR EACH ROW EXECUTE FUNCTION public.set_procuracion_desde();

-- ── 2. Registro de lo que hizo el procurador con cada actuación ───────────────

CREATE TABLE IF NOT EXISTS public.procuracion_eventos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id  uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  movement_id    uuid NOT NULL UNIQUE REFERENCES public.sae_movements(id) ON DELETE CASCADE,
  estado         text NOT NULL CHECK (estado IN ('procesado', 'sin_accion', 'error')),
  tipo_acto      text,
  resumen        text,
  accion         text,
  dias           integer,
  es_habiles     boolean,
  base_legal     text,
  vencimiento    date,
  escrito_tipo   text,
  tarea_id       uuid REFERENCES public.tareas(id) ON DELETE SET NULL,
  escrito_id     uuid REFERENCES public.escritos(id) ON DELETE SET NULL,
  error          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_procuracion_eventos_expediente
  ON public.procuracion_eventos(expediente_id, created_at DESC);

ALTER TABLE public.procuracion_eventos ENABLE ROW LEVEL SECURITY;

-- Lectura para quien ve el expediente; solo la service role escribe.
DROP POLICY IF EXISTS procuracion_eventos_select ON public.procuracion_eventos;
CREATE POLICY procuracion_eventos_select ON public.procuracion_eventos
  FOR SELECT USING (public.can_view_expediente(expediente_id));

REVOKE ALL ON public.procuracion_eventos FROM anon;
GRANT SELECT ON public.procuracion_eventos TO authenticated;

-- ── 3. Cron: cada hora de 7 a 20 (AR), lunes a viernes ─────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'procuracion-procesar') THEN
    PERFORM cron.unschedule('procuracion-procesar');
  END IF;
END $$;

SELECT cron.schedule(
  'procuracion-procesar',
  '0 10-23 * * 1-5',
  $cron$
  SELECT net.http_post(
    url := 'https://ftxpilbvjfxfkjkrbrnl.supabase.co/functions/v1/procuracion-procesar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.functions_cron_secret()
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $cron$
);

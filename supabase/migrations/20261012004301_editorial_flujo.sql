-- Editorial: devoluciones con observaciones, lecturas (para comparar versiones),
-- verificación de citas contra la base, plazos/seguimiento y propuestas de
-- actualización de artículos ya aprobados o publicados.

ALTER TABLE public.editorial_articulos
  ADD COLUMN IF NOT EXISTS observaciones text,
  ADD COLUMN IF NOT EXISTS devuelto_at timestamptz,
  ADD COLUMN IF NOT EXISTS verificacion_citas jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS citas_verificadas_at timestamptz,
  ADD COLUMN IF NOT EXISTS recordado_at timestamptz;

ALTER TABLE public.editorial_propuestas
  ADD COLUMN IF NOT EXISTS fecha_limite date,
  ADD COLUMN IF NOT EXISTS articulo_id uuid REFERENCES public.editorial_articulos(id) ON DELETE CASCADE;

ALTER TABLE public.editorial_propuestas DROP CONSTRAINT IF EXISTS editorial_propuestas_origen_check;
ALTER TABLE public.editorial_propuestas ADD CONSTRAINT editorial_propuestas_origen_check
  CHECK (origen IN ('radar', 'sentencia', 'manual', 'actuacion', 'actualizacion'));

-- Última versión que cada persona leyó de cada artículo
CREATE TABLE IF NOT EXISTS public.editorial_lecturas (
  articulo_id uuid NOT NULL REFERENCES public.editorial_articulos(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE DEFAULT auth.uid(),
  version     integer NOT NULL,
  leido_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (articulo_id, profile_id)
);
ALTER TABLE public.editorial_lecturas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS editorial_lecturas_propias ON public.editorial_lecturas;
CREATE POLICY editorial_lecturas_propias ON public.editorial_lecturas FOR ALL
  USING (public.can_access_editorial() AND profile_id = auth.uid())
  WITH CHECK (public.can_access_editorial() AND profile_id = auth.uid());
GRANT SELECT, INSERT, UPDATE ON public.editorial_lecturas TO authenticated;

-- Seguimiento: recordatorios diarios (L-V 8:30 AR) y resumen semanal (lunes)
SELECT cron.unschedule('editorial-seguimiento') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'editorial-seguimiento');
SELECT cron.schedule('editorial-seguimiento', '30 11 * * 1-5', $cron$
  SELECT net.http_post(
    url := 'https://ftxpilbvjfxfkjkrbrnl.supabase.co/functions/v1/editorial-ia',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.functions_cron_secret()),
    body := '{"modo":"seguimiento"}'::jsonb,
    timeout_milliseconds := 60000
  );
$cron$);

-- Actualización: revisa artículos aprobados/publicados contra novedades (miércoles 7 AR)
SELECT cron.unschedule('editorial-actualizacion') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'editorial-actualizacion');
SELECT cron.schedule('editorial-actualizacion', '0 10 * * 3', $cron$
  SELECT net.http_post(
    url := 'https://ftxpilbvjfxfkjkrbrnl.supabase.co/functions/v1/editorial-ia',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.functions_cron_secret()),
    body := '{"modo":"actualizacion"}'::jsonb,
    timeout_milliseconds := 150000
  );
$cron$);

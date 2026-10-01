-- ============================================================
-- Caja IA: observaciones generadas por análisis con LLM
-- Solo accesibles por DIRECTOR (Marco) via is_director()
-- ============================================================

CREATE TABLE IF NOT EXISTS public.caja_ia_observaciones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo           text NOT NULL CHECK (tipo IN ('gasto', 'ingreso')),
  registro_id    uuid NOT NULL,
  nivel          text NOT NULL CHECK (nivel IN ('alerta', 'error')),
  observacion    text NOT NULL,
  sugerencia     text,
  campo_afectado text,
  valor_sugerido text,
  analizado_at   timestamptz NOT NULL DEFAULT now(),
  aplicado_at    timestamptz,
  descartado_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_caja_ia_obs_registro
  ON public.caja_ia_observaciones(registro_id);

CREATE INDEX IF NOT EXISTS idx_caja_ia_obs_activas
  ON public.caja_ia_observaciones(nivel, tipo)
  WHERE aplicado_at IS NULL AND descartado_at IS NULL;

ALTER TABLE public.caja_ia_observaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "director_only_caja_ia"
  ON public.caja_ia_observaciones
  FOR ALL TO authenticated
  USING (public.is_director())
  WITH CHECK (public.is_director());

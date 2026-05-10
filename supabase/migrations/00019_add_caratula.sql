-- ============================================================
-- Marco Rossi Estudio Jurídico - Migración 019: Agrega caratula
-- Agrega el campo caratula (texto libre) a expedientes.
-- ============================================================

ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS caratula text;

CREATE INDEX IF NOT EXISTS idx_exp_caratula_trgm
  ON public.expedientes USING gin (caratula gin_trgm_ops)
  WHERE caratula IS NOT NULL;

COMMENT ON COLUMN public.expedientes.caratula IS 'Carátula del expediente (denominación del caso)';

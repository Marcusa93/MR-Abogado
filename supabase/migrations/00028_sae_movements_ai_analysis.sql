-- ============================================================
-- Migración 028: Análisis IA de actuaciones SAE
--
-- Agrega columnas para resumen, datos extraídos y acción sugerida
-- generadas por LLM durante el sync. Si el análisis falla, se guarda
-- el error en ai_error para poder reintentar manualmente.
-- ============================================================

ALTER TABLE public.sae_movements
  ADD COLUMN IF NOT EXISTS ai_summary           text,
  ADD COLUMN IF NOT EXISTS ai_extracted         jsonb,
  ADD COLUMN IF NOT EXISTS ai_suggested_action  jsonb,
  ADD COLUMN IF NOT EXISTS ai_analyzed_at       timestamptz,
  ADD COLUMN IF NOT EXISTS ai_model             text,
  ADD COLUMN IF NOT EXISTS ai_error             text;

-- Índice para encontrar rápido las actuaciones pendientes de análisis
CREATE INDEX IF NOT EXISTS idx_sae_movements_pending_ai
  ON public.sae_movements (expediente_id)
  WHERE ai_analyzed_at IS NULL AND ai_error IS NULL;

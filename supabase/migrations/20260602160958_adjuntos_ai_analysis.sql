-- ============================================================
-- Análisis IA de adjuntos (PDFs subidos)
--
-- Mismo patrón que sae_movements (00028): columnas para texto
-- crudo, resumen, extracción estructurada y errores. Permite
-- "conversar" con el doc (usa ai_full_text) y aporta datos al
-- brief del expediente (ai_extracted, ai_summary).
-- ============================================================

ALTER TABLE public.adjuntos
  ADD COLUMN IF NOT EXISTS ai_full_text         text,
  ADD COLUMN IF NOT EXISTS ai_summary           text,
  ADD COLUMN IF NOT EXISTS ai_extracted         jsonb,
  ADD COLUMN IF NOT EXISTS ai_analyzed_at       timestamptz,
  ADD COLUMN IF NOT EXISTS ai_model             text,
  ADD COLUMN IF NOT EXISTS ai_error             text,
  ADD COLUMN IF NOT EXISTS ai_token_usage       jsonb;

COMMENT ON COLUMN public.adjuntos.ai_full_text IS
  'Texto crudo extraído del PDF (pdf-parse). Se reusa para chat sin re-extraer.';
COMMENT ON COLUMN public.adjuntos.ai_extracted IS
  'Extracción estructurada: rubros + montos, normativa, jurisprudencia, hechos, resultado.';

-- Índice para encontrar adjuntos pendientes de análisis (auto-trigger
-- solo corre para 4 categorías; el resto entra acá si el usuario lo dispara
-- manualmente).
CREATE INDEX IF NOT EXISTS idx_adjuntos_pending_ai
  ON public.adjuntos (expediente_id)
  WHERE ai_analyzed_at IS NULL AND ai_error IS NULL AND deleted_at IS NULL;

-- ============================================================
-- Migración 031: Brief del expediente generado por IA
--
-- Una columna por expediente que guarda el resumen narrativo
-- generado on-demand. No se regenera automáticamente — el usuario
-- decide cuándo (botón "Actualizar brief").
-- ============================================================

ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS ai_brief               text,
  ADD COLUMN IF NOT EXISTS ai_brief_generated_at  timestamptz,
  ADD COLUMN IF NOT EXISTS ai_brief_model         text;

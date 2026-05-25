-- ============================================================
-- Migración 056: normativa puede venir de URL/paste (sin archivo)
--
-- Permite ingesta de normativa desde URL (InfoLEG/SAIJ) o pegando texto,
-- no solo subiendo archivo. Espejo de jurisprudencia_documentos.
--
-- Aplicada vía MCP el 2026-05-24.
-- ============================================================

ALTER TABLE public.normativa_documentos
  ALTER COLUMN source_file_path DROP NOT NULL,
  ALTER COLUMN source_file_name DROP NOT NULL,
  ALTER COLUMN source_mime_type DROP NOT NULL;

ALTER TABLE public.normativa_documentos
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual_upload'
    CHECK (source IN ('manual_upload', 'manual_paste', 'infoleg', 'saij', 'csjn', 'otro')),
  ADD COLUMN IF NOT EXISTS source_doc_id TEXT,
  ADD COLUMN IF NOT EXISTS source_url    TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_normativa_documentos_user_source_doc
  ON public.normativa_documentos (user_id, source, source_doc_id)
  WHERE source_doc_id IS NOT NULL;

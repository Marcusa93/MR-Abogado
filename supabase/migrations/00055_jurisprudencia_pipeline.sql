-- ============================================================
-- Migración 055: Módulo Jurisprudencia con chunking + RAG
--
-- Espejo de normativa (037) pero adaptado a fallos:
-- - jurisprudencia_documentos: cabecera (un fallo = un documento)
-- - jurisprudencia_chunks: chunks con embedding vector(1536)
-- - expediente_jurisprudencia: fija fallos a un expediente
-- - RPC match_jurisprudencia_chunks: similarity search vía pgvector
--
-- Diferencias clave vs normativa:
-- - source_file_path es OPCIONAL (puede venir de URL o paste)
-- - source/source_url para trazar la fuente (infoleg/saij/csjn/manual)
-- - chunker debe respetar encabezado/considerandos/resuelve (lógica edge)
--
-- Aplicada vía MCP el 2026-05-24.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.jurisprudencia_documentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  caratula        text NOT NULL,
  tribunal        text,
  jurisdiccion    text,
  fecha           date,
  tipo            text NOT NULL DEFAULT 'sentencia'
                  CHECK (tipo IN ('sentencia', 'auto', 'fallo_plenario', 'sumario', 'dictamen', 'otro')),
  numero          text,
  sumario         text,
  source          text NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('manual_upload', 'manual_paste', 'infoleg', 'saij', 'csjn', 'otro')),
  source_doc_id   text,
  source_url      text,
  source_file_path  text,
  source_file_name  text,
  source_mime_type  text,
  checksum        text,
  estado          text NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente', 'procesando', 'indexado', 'error')),
  error_message   text,
  chunk_count     int NOT NULL DEFAULT 0,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_jurisprudencia_documentos_user_checksum
  ON public.jurisprudencia_documentos (user_id, checksum)
  WHERE checksum IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_jurisprudencia_documentos_user_source_doc
  ON public.jurisprudencia_documentos (user_id, source, source_doc_id)
  WHERE source_doc_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jurisprudencia_documentos_user
  ON public.jurisprudencia_documentos (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jurisprudencia_documentos_user_estado
  ON public.jurisprudencia_documentos (user_id, estado);

CREATE TABLE IF NOT EXISTS public.jurisprudencia_chunks (
  id              bigserial PRIMARY KEY,
  documento_id    uuid NOT NULL REFERENCES public.jurisprudencia_documentos(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chunk_uid       text NOT NULL UNIQUE,
  orden           int NOT NULL,
  contenido       text NOT NULL,
  embedding       vector(1536) NOT NULL,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jurisprudencia_chunks_embedding_hnsw
  ON public.jurisprudencia_chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_jurisprudencia_chunks_documento
  ON public.jurisprudencia_chunks (documento_id, orden);

CREATE INDEX IF NOT EXISTS idx_jurisprudencia_chunks_user
  ON public.jurisprudencia_chunks (user_id);

CREATE INDEX IF NOT EXISTS idx_jurisprudencia_chunks_metadata_gin
  ON public.jurisprudencia_chunks USING gin (metadata);

CREATE TABLE IF NOT EXISTS public.expediente_jurisprudencia (
  expediente_id   uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  documento_id    uuid NOT NULL REFERENCES public.jurisprudencia_documentos(id) ON DELETE CASCADE,
  fijado_por      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  nota            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (expediente_id, documento_id)
);

CREATE INDEX IF NOT EXISTS idx_expediente_jurisprudencia_expediente
  ON public.expediente_jurisprudencia (expediente_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_expediente_jurisprudencia_documento
  ON public.expediente_jurisprudencia (documento_id);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'jurisprudencia-originales',
  'jurisprudencia-originales',
  false,
  52428800,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.jurisprudencia_documentos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jurisprudencia_chunks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expediente_jurisprudencia   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jurisprudencia_documentos_owner_all" ON public.jurisprudencia_documentos
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "jurisprudencia_chunks_owner_select" ON public.jurisprudencia_chunks
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "expediente_jurisprudencia_select" ON public.expediente_jurisprudencia
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.expedientes e
      WHERE e.id = expediente_jurisprudencia.expediente_id
        AND (
          e.created_by = auth.uid()
          OR EXISTS (SELECT 1 FROM public.expediente_miembros em
                     WHERE em.expediente_id = e.id AND em.profile_id = auth.uid())
        )
    )
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rol = 'ADMIN')
  );

CREATE POLICY "expediente_jurisprudencia_insert" ON public.expediente_jurisprudencia
  FOR INSERT WITH CHECK (
    fijado_por = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.expedientes e
      WHERE e.id = expediente_id
        AND (
          e.created_by = auth.uid()
          OR EXISTS (SELECT 1 FROM public.expediente_miembros em
                     WHERE em.expediente_id = e.id AND em.profile_id = auth.uid())
        )
    )
    AND EXISTS (
      SELECT 1 FROM public.jurisprudencia_documentos d
      WHERE d.id = documento_id AND d.user_id = auth.uid()
    )
  );

CREATE POLICY "expediente_jurisprudencia_delete" ON public.expediente_jurisprudencia
  FOR DELETE USING (
    fijado_por = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.expedientes e
      WHERE e.id = expediente_id AND e.created_by = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rol = 'ADMIN')
  );

CREATE OR REPLACE FUNCTION public.match_jurisprudencia_chunks(
  query_embedding         vector(1536),
  filter_user_id          uuid,
  match_count             int DEFAULT 8,
  exclude_documento_ids   uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS TABLE (
  chunk_id       bigint,
  documento_id   uuid,
  contenido      text,
  metadata       jsonb,
  score          double precision
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id           AS chunk_id,
    c.documento_id,
    c.contenido,
    c.metadata,
    (1 - (c.embedding <=> query_embedding))::double precision AS score
  FROM public.jurisprudencia_chunks c
  WHERE c.user_id = filter_user_id
    AND (exclude_documento_ids IS NULL OR c.documento_id <> ALL (exclude_documento_ids))
  ORDER BY c.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_jurisprudencia_chunks(vector, uuid, int, uuid[]) TO authenticated;

DROP TRIGGER IF EXISTS set_updated_at ON public.jurisprudencia_documentos;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.jurisprudencia_documentos
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

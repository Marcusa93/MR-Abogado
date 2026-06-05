-- ============================================================
-- Conexiones cross-expediente: embeddings sobre adjuntos analizados
--
-- 1) adjunto_chunks: chunks de ai_full_text con embedding vector(1536).
--    Mismo patrón que audiencia_transcript_chunks (RLS via
--    can_view_expediente, expediente_id denormalizado).
-- 2) match_adjunto_chunks: similarity search RLS-aware con filtros
--    opcionales (excluir expediente, filtrar tipo_documento).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────────────────────────
-- 1) Chunks indexados de adjuntos
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.adjunto_chunks (
  id              bigserial PRIMARY KEY,
  adjunto_id      uuid NOT NULL REFERENCES public.adjuntos(id) ON DELETE CASCADE,
  expediente_id   uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  categoria       text,
  tipo_documento  text,           -- viene de ai_extracted->>tipo_documento, denormalizado
  chunk_index     int NOT NULL,
  content         text NOT NULL,
  embedding       vector(1536) NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (adjunto_id, chunk_index)
);

COMMENT ON TABLE public.adjunto_chunks IS
  'Chunks embebidos del texto crudo de adjuntos analizados (ai_full_text). Habilita búsqueda semántica cross-expediente entre demandas/sentencias del corpus del propio abogado.';

CREATE INDEX IF NOT EXISTS idx_adjunto_chunks_embedding_hnsw
  ON public.adjunto_chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_adjunto_chunks_adjunto
  ON public.adjunto_chunks (adjunto_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_adjunto_chunks_expediente
  ON public.adjunto_chunks (expediente_id);

CREATE INDEX IF NOT EXISTS idx_adjunto_chunks_tipo
  ON public.adjunto_chunks (tipo_documento) WHERE tipo_documento IS NOT NULL;

ALTER TABLE public.adjunto_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS adjunto_chunks_select_visible ON public.adjunto_chunks;
CREATE POLICY adjunto_chunks_select_visible ON public.adjunto_chunks
  FOR SELECT USING (public.can_view_expediente(expediente_id));

DROP POLICY IF EXISTS adjunto_chunks_insert_blocked ON public.adjunto_chunks;
CREATE POLICY adjunto_chunks_insert_blocked ON public.adjunto_chunks
  FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS adjunto_chunks_update_blocked ON public.adjunto_chunks;
CREATE POLICY adjunto_chunks_update_blocked ON public.adjunto_chunks
  FOR UPDATE USING (false);

DROP POLICY IF EXISTS adjunto_chunks_delete_blocked ON public.adjunto_chunks;
CREATE POLICY adjunto_chunks_delete_blocked ON public.adjunto_chunks
  FOR DELETE USING (false);

-- ─────────────────────────────────────────────────────────────
-- 2) RPC: similarity search RLS-aware
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.match_adjunto_chunks(
  query_embedding         vector(1536),
  match_count             int DEFAULT 20,
  exclude_expediente_id   uuid DEFAULT NULL,
  filter_tipos_documento  text[] DEFAULT NULL,
  min_score               double precision DEFAULT 0.3
)
RETURNS TABLE (
  chunk_id          bigint,
  adjunto_id        uuid,
  expediente_id     uuid,
  tipo_documento    text,
  categoria         text,
  chunk_index       int,
  content           text,
  score             double precision
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'P0401';
  END IF;

  RETURN QUERY
  SELECT
    c.id              AS chunk_id,
    c.adjunto_id,
    c.expediente_id,
    c.tipo_documento,
    c.categoria,
    c.chunk_index,
    c.content,
    (1 - (c.embedding <=> query_embedding))::double precision AS score
  FROM public.adjunto_chunks c
  WHERE public.can_view_expediente(c.expediente_id)
    AND (exclude_expediente_id IS NULL OR c.expediente_id <> exclude_expediente_id)
    AND (filter_tipos_documento IS NULL OR c.tipo_documento = ANY(filter_tipos_documento))
    AND (1 - (c.embedding <=> query_embedding)) >= min_score
  ORDER BY c.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_adjunto_chunks(vector, int, uuid, text[], double precision) TO authenticated;

COMMENT ON FUNCTION public.match_adjunto_chunks IS
  'Top-K búsqueda semántica sobre adjunto_chunks visibles para el usuario actual. Permite excluir un expediente (para búsqueda cross-expediente) y filtrar por tipo_documento.';

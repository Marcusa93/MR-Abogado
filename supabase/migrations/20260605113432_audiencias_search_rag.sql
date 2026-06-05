-- ============================================================
-- Búsqueda semántica cross-audiencias + personas recurrentes
--
-- 1) audiencia_transcript_chunks: chunks con embedding vector(1536),
--    HNSW index, RLS vía can_view_expediente.
-- 2) match_audiencia_transcripts: RPC de similarity search.
-- 3) audiencias_personas_recurrentes: RPC que agrega
--    ai_analysis->'partes_presentes' del usuario, normaliza y cuenta.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────────────────────────
-- 1) Chunks indexados de transcripts
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audiencia_transcript_chunks (
  id              bigserial PRIMARY KEY,
  transcript_id   uuid NOT NULL REFERENCES public.audiencia_transcripts(id) ON DELETE CASCADE,
  expediente_id   uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  chunk_index     int NOT NULL,
  content         text NOT NULL,
  embedding       vector(1536) NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transcript_id, chunk_index)
);

COMMENT ON TABLE public.audiencia_transcript_chunks IS
  'Chunks embebidos del transcript de audiencias para búsqueda semántica cross-expediente. expediente_id está denormalizado para acelerar el filtro RLS via can_view_expediente.';

CREATE INDEX IF NOT EXISTS idx_audiencia_chunks_embedding_hnsw
  ON public.audiencia_transcript_chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_audiencia_chunks_transcript
  ON public.audiencia_transcript_chunks (transcript_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_audiencia_chunks_expediente
  ON public.audiencia_transcript_chunks (expediente_id);

ALTER TABLE public.audiencia_transcript_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audiencia_chunks_select_visible ON public.audiencia_transcript_chunks;
CREATE POLICY audiencia_chunks_select_visible ON public.audiencia_transcript_chunks
  FOR SELECT USING (public.can_view_expediente(expediente_id));

DROP POLICY IF EXISTS audiencia_chunks_insert_blocked ON public.audiencia_transcript_chunks;
CREATE POLICY audiencia_chunks_insert_blocked ON public.audiencia_transcript_chunks
  FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS audiencia_chunks_update_blocked ON public.audiencia_transcript_chunks;
CREATE POLICY audiencia_chunks_update_blocked ON public.audiencia_transcript_chunks
  FOR UPDATE USING (false);

DROP POLICY IF EXISTS audiencia_chunks_delete_blocked ON public.audiencia_transcript_chunks;
CREATE POLICY audiencia_chunks_delete_blocked ON public.audiencia_transcript_chunks
  FOR DELETE USING (false);

-- ─────────────────────────────────────────────────────────────
-- 2) RPC: similarity search RLS-aware
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.match_audiencia_transcripts(
  query_embedding         vector(1536),
  match_count             int DEFAULT 12,
  filter_expediente_id    uuid DEFAULT NULL
)
RETURNS TABLE (
  chunk_id          bigint,
  transcript_id     uuid,
  expediente_id     uuid,
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
    c.id            AS chunk_id,
    c.transcript_id,
    c.expediente_id,
    c.chunk_index,
    c.content,
    (1 - (c.embedding <=> query_embedding))::double precision AS score
  FROM public.audiencia_transcript_chunks c
  WHERE public.can_view_expediente(c.expediente_id)
    AND (filter_expediente_id IS NULL OR c.expediente_id = filter_expediente_id)
  ORDER BY c.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_audiencia_transcripts(vector, int, uuid) TO authenticated;

COMMENT ON FUNCTION public.match_audiencia_transcripts IS
  'Top-K búsqueda semántica sobre transcripts del usuario. Score = 1 - cos_dist (1.0 = idéntico). RLS se aplica por can_view_expediente.';

-- ─────────────────────────────────────────────────────────────
-- 3) Personas recurrentes: agregación de partes_presentes
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.audiencias_personas_recurrentes(
  min_apariciones int DEFAULT 1,
  limit_personas  int DEFAULT 100
)
RETURNS TABLE (
  nombre_normalizado    text,
  nombre_display        text,
  apariciones           int,
  transcript_ids        uuid[],
  expediente_ids        uuid[],
  ultima_aparicion      timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'P0401';
  END IF;

  RETURN QUERY
  WITH expandidas AS (
    SELECT
      t.id AS transcript_id,
      t.expediente_id,
      t.transcript_at,
      btrim(jsonb_array_elements_text(t.ai_analysis->'partes_presentes')) AS nombre_raw
    FROM public.audiencia_transcripts t
    WHERE t.ai_analysis IS NOT NULL
      AND jsonb_typeof(t.ai_analysis->'partes_presentes') = 'array'
      AND public.can_view_expediente(t.expediente_id)
  ),
  normalizadas AS (
    SELECT
      transcript_id,
      expediente_id,
      transcript_at,
      nombre_raw,
      -- Normalización: lowercase, sin acentos, sin múltiples espacios
      lower(translate(
        regexp_replace(nombre_raw, '\s+', ' ', 'g'),
        'áéíóúÁÉÍÓÚñÑüÜ',
        'aeiouAEIOUnNuU'
      )) AS nombre_norm
    FROM expandidas
    WHERE length(btrim(nombre_raw)) >= 3
  )
  SELECT
    nombre_norm AS nombre_normalizado,
    (array_agg(nombre_raw ORDER BY length(nombre_raw) DESC))[1] AS nombre_display,
    count(*)::int AS apariciones,
    array_agg(DISTINCT transcript_id) AS transcript_ids,
    array_agg(DISTINCT expediente_id) AS expediente_ids,
    max(transcript_at) AS ultima_aparicion
  FROM normalizadas
  GROUP BY nombre_norm
  HAVING count(*) >= min_apariciones
  ORDER BY count(*) DESC, max(transcript_at) DESC NULLS LAST
  LIMIT limit_personas;
END;
$$;

GRANT EXECUTE ON FUNCTION public.audiencias_personas_recurrentes(int, int) TO authenticated;

COMMENT ON FUNCTION public.audiencias_personas_recurrentes IS
  'Agrega partes_presentes de las audiencias visibles para el usuario actual, normaliza nombres (lower + sin tildes) y devuelve top con conteo + transcripts donde aparecieron.';

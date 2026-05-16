-- ============================================================
-- Migración 037: Módulo Normativa con chunking + RAG
--
-- - normativa_documentos: cabecera (un PDF/DOCX = un documento)
-- - normativa_chunks:     chunks con embedding vector(1536)
-- - expediente_normativa: fija documentos a un expediente
-- - escrito_citas:        trazabilidad de qué chunks citó cada escrito
-- - storage bucket:       normativa-originales (privado)
-- - RPC match_normativa_chunks: similarity search vía pgvector
--
-- Modelo: biblioteca global del usuario; cada expediente fija
-- los documentos que SIEMPRE deben ir al prompt, y el resto se
-- recupera dinámicamente vía retrieval semántico.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ── Documentos (cabecera) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.normativa_documentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  titulo          text NOT NULL,
  tipo            text NOT NULL,            -- libre: ley, decreto, codigo, ordenanza, resolucion, otro
  numero          text,                     -- ej "24.240", "26.994"
  fecha           date,
  jurisdiccion    text,                     -- ej "nacional", "tucuman", "caba"
  fuente          text,                     -- ej "Boletín Oficial", "InfoLEG"
  source_file_path  text NOT NULL,          -- storage path en normativa-originales
  source_file_name  text NOT NULL,
  source_mime_type  text NOT NULL,
  checksum        text,                     -- sha256 del archivo, para deduplicar
  estado          text NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente', 'procesando', 'indexado', 'error')),
  error_message   text,
  chunk_count     int NOT NULL DEFAULT 0,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_normativa_documentos_user_checksum
  ON public.normativa_documentos (user_id, checksum)
  WHERE checksum IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_normativa_documentos_user
  ON public.normativa_documentos (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_normativa_documentos_user_estado
  ON public.normativa_documentos (user_id, estado);

-- ── Chunks ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.normativa_chunks (
  id              bigserial PRIMARY KEY,
  documento_id    uuid NOT NULL REFERENCES public.normativa_documentos(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chunk_uid       text NOT NULL UNIQUE,     -- "<doc_id>:<idx>:<random>"
  orden           int NOT NULL,
  contenido       text NOT NULL,
  embedding       vector(1536) NOT NULL,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
                  -- { articulo?, seccion?, tipo, numero?, jurisdiccion?, titulo_documento }
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- HNSW para cosine similarity (pgvector >= 0.5)
CREATE INDEX IF NOT EXISTS idx_normativa_chunks_embedding_hnsw
  ON public.normativa_chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_normativa_chunks_documento
  ON public.normativa_chunks (documento_id, orden);

CREATE INDEX IF NOT EXISTS idx_normativa_chunks_user
  ON public.normativa_chunks (user_id);

CREATE INDEX IF NOT EXISTS idx_normativa_chunks_metadata_gin
  ON public.normativa_chunks USING gin (metadata);

-- ── Fijación: documentos pinned a un expediente ─────────────────
CREATE TABLE IF NOT EXISTS public.expediente_normativa (
  expediente_id   uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  documento_id    uuid NOT NULL REFERENCES public.normativa_documentos(id) ON DELETE CASCADE,
  fijado_por      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  nota            text,                     -- por qué se fijó (opcional)
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (expediente_id, documento_id)
);

CREATE INDEX IF NOT EXISTS idx_expediente_normativa_expediente
  ON public.expediente_normativa (expediente_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_expediente_normativa_documento
  ON public.expediente_normativa (documento_id);

-- ── Trazabilidad: citas usadas por cada escrito ─────────────────
CREATE TABLE IF NOT EXISTS public.escrito_citas (
  id              bigserial PRIMARY KEY,
  escrito_id      uuid NOT NULL REFERENCES public.escritos(id) ON DELETE CASCADE,
  chunk_id        bigint REFERENCES public.normativa_chunks(id) ON DELETE SET NULL,
  documento_id    uuid REFERENCES public.normativa_documentos(id) ON DELETE SET NULL,
  cita_texto      text,
  score           numeric(5,4),
  was_pinned      boolean NOT NULL DEFAULT false,
  orden           int NOT NULL,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_escrito_citas_escrito
  ON public.escrito_citas (escrito_id, orden);

CREATE INDEX IF NOT EXISTS idx_escrito_citas_documento
  ON public.escrito_citas (documento_id) WHERE documento_id IS NOT NULL;

-- ── Storage bucket ──────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'normativa-originales',
  'normativa-originales',
  false,
  31457280, -- 30 MB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ── RLS ─────────────────────────────────────────────────────────
ALTER TABLE public.normativa_documentos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.normativa_chunks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expediente_normativa    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escrito_citas           ENABLE ROW LEVEL SECURITY;

-- normativa_documentos: biblioteca privada del usuario
CREATE POLICY "normativa_documentos_owner_all" ON public.normativa_documentos
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- normativa_chunks: lectura para el owner; insert lo hace la edge function con service role
CREATE POLICY "normativa_chunks_owner_select" ON public.normativa_chunks
  FOR SELECT USING (user_id = auth.uid());

-- expediente_normativa: cualquier miembro del expediente lee; el que tiene acceso fija/desfija
CREATE POLICY "expediente_normativa_select" ON public.expediente_normativa
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.expedientes e
      WHERE e.id = expediente_normativa.expediente_id
        AND (
          e.created_by = auth.uid()
          OR EXISTS (SELECT 1 FROM public.expediente_miembros em
                     WHERE em.expediente_id = e.id AND em.profile_id = auth.uid())
        )
    )
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rol = 'ADMIN')
  );

CREATE POLICY "expediente_normativa_insert" ON public.expediente_normativa
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
      SELECT 1 FROM public.normativa_documentos d
      WHERE d.id = documento_id AND d.user_id = auth.uid()
    )
  );

CREATE POLICY "expediente_normativa_delete" ON public.expediente_normativa
  FOR DELETE USING (
    fijado_por = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.expedientes e
      WHERE e.id = expediente_id AND e.created_by = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rol = 'ADMIN')
  );

-- escrito_citas: misma visibilidad que el escrito padre
CREATE POLICY "escrito_citas_select" ON public.escrito_citas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.escritos esc
      WHERE esc.id = escrito_citas.escrito_id
        AND (
          esc.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.expedientes e
            WHERE e.id = esc.expediente_id
              AND (
                e.created_by = auth.uid()
                OR EXISTS (SELECT 1 FROM public.expediente_miembros em
                           WHERE em.expediente_id = e.id AND em.profile_id = auth.uid())
              )
          )
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rol = 'ADMIN')
        )
    )
  );

-- ── RPC: similarity search ──────────────────────────────────────
-- Devuelve top-N chunks del corpus del usuario, opcionalmente
-- excluyendo documentos ya pinned al expediente.
CREATE OR REPLACE FUNCTION public.match_normativa_chunks(
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
  FROM public.normativa_chunks c
  WHERE c.user_id = filter_user_id
    AND (exclude_documento_ids IS NULL OR c.documento_id <> ALL (exclude_documento_ids))
  ORDER BY c.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_normativa_chunks(vector, uuid, int, uuid[]) TO authenticated;

-- ── updated_at triggers (reutiliza convención del repo) ─────────
DROP TRIGGER IF EXISTS set_updated_at ON public.normativa_documentos;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.normativa_documentos
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ============================================================
-- Migración 034: Transcripciones de audiencia (Whisper) + análisis IA
--
-- Tabla unificada que linkea con:
--   - sae_movements (cuando la audiencia viene de una actuación SAE), o
--   - audiencias (cuando es una audiencia agendada manualmente)
-- Constraint: exactamente uno de los dos FKs.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audiencia_transcripts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_id              uuid REFERENCES public.sae_movements(id) ON DELETE CASCADE,
  audiencia_id             uuid REFERENCES public.audiencias(id) ON DELETE CASCADE,
  expediente_id            uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  status                   text NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'transcribing', 'completed', 'error')),
  audio_source             text NOT NULL
                           CHECK (audio_source IN ('sae_attachment', 'upload')),
  audio_storage_path       text,           -- path en Supabase Storage si fue upload
  audio_filename           text,           -- nombre del archivo
  audio_duration_seconds   int,
  transcript               text,
  transcript_model         text,
  transcript_at            timestamptz,
  ai_analysis              jsonb,          -- {resumen, partes_presentes[], decisiones[], proximos_pasos[]}
  ai_analyzed_at           timestamptz,
  ai_analysis_model        text,
  error_message            text,
  created_by               uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT one_source CHECK (
    (movement_id IS NOT NULL AND audiencia_id IS NULL)
    OR (movement_id IS NULL AND audiencia_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_audiencia_transcripts_expediente
  ON public.audiencia_transcripts (expediente_id);
CREATE INDEX IF NOT EXISTS idx_audiencia_transcripts_movement
  ON public.audiencia_transcripts (movement_id) WHERE movement_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audiencia_transcripts_audiencia
  ON public.audiencia_transcripts (audiencia_id) WHERE audiencia_id IS NOT NULL;

-- ── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.audiencia_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audiencia_transcripts_select" ON public.audiencia_transcripts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.expedientes e
      WHERE e.id = audiencia_transcripts.expediente_id
        AND (
          e.created_by = auth.uid()
          OR EXISTS (SELECT 1 FROM public.expediente_miembros em WHERE em.expediente_id = e.id AND em.profile_id = auth.uid())
        )
    )
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rol = 'ADMIN')
  );

-- INSERT/UPDATE solo via edge functions (service role). Bloqueamos para clientes.
CREATE POLICY "audiencia_transcripts_insert_blocked" ON public.audiencia_transcripts
  FOR INSERT WITH CHECK (false);

CREATE POLICY "audiencia_transcripts_update_blocked" ON public.audiencia_transcripts
  FOR UPDATE USING (false);

-- DELETE permitido al owner / admin (por si quiere descartar una transcripción)
CREATE POLICY "audiencia_transcripts_delete_owner" ON public.audiencia_transcripts
  FOR DELETE USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rol = 'ADMIN')
  );

-- ── Storage bucket para audios subidos manualmente ──────────────────────
-- (si no existe; idempotente)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audiencias-audio',
  'audiencias-audio',
  false,
  524288000, -- 500 MB
  ARRAY['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/opus', 'audio/webm', 'audio/flac', 'audio/aac', 'audio/x-m4a']
)
ON CONFLICT (id) DO NOTHING;

-- RLS del bucket: cada usuario solo ve/sube/borra sus propios audios
-- (path convention: <user_id>/<audiencia_or_movement_id>/<filename>)
CREATE POLICY "audiencias_audio_owner_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'audiencias-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "audiencias_audio_owner_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'audiencias-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "audiencias_audio_owner_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'audiencias-audio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

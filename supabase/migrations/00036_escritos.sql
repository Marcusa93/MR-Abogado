-- ============================================================
-- Migración 036: Módulo de Escritos con IA
--
-- - profiles: columnas para datos profesionales del abogado
--   (matrícula, domicilio legal, CUIT, casillero) usados en el
--   encabezado de cada escrito.
-- - escrito_templates: modelos de escritos cargados por el usuario
--   (PDF/DOCX) que la IA usa como base de estilo.
-- - escritos: escritos generados/editados por el usuario, asociados
--   a un expediente.
-- - storage bucket: escritos-templates (privado, PDF/DOCX).
-- ============================================================

-- ── Datos profesionales del abogado en profiles ─────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS matricula        text,
  ADD COLUMN IF NOT EXISTS matricula_libro  text,
  ADD COLUMN IF NOT EXISTS matricula_folio  text,
  ADD COLUMN IF NOT EXISTS domicilio_legal  text,
  ADD COLUMN IF NOT EXISTS casillero_notif  text,
  ADD COLUMN IF NOT EXISTS cuit             text;

-- ── Plantillas (modelos de escritos del usuario) ────────────────
CREATE TABLE IF NOT EXISTS public.escrito_templates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nombre             text NOT NULL,
  tipo               text NOT NULL,                  -- libre: contestacion / alegato / recurso / etc.
  descripcion        text,
  source_file_path   text,                           -- storage path en bucket escritos-templates
  source_file_name   text,
  source_text        text,                           -- texto plano extraído del PDF/DOCX
  analysis           jsonb,                          -- { secciones[], tono, muletillas[], estructura_encabezado, formato_firma }
  analyzed_at        timestamptz,
  analysis_model     text,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_escrito_templates_user
  ON public.escrito_templates (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_escrito_templates_tipo
  ON public.escrito_templates (user_id, tipo) WHERE is_active = true;

-- ── Escritos generados / editados ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.escritos (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id            uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  user_id                  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  template_id              uuid REFERENCES public.escrito_templates(id) ON DELETE SET NULL,
  titulo                   text NOT NULL,
  tipo                     text NOT NULL,            -- libre, definido por el usuario
  estado                   text NOT NULL DEFAULT 'borrador'
                           CHECK (estado IN ('borrador', 'final', 'presentado')),
  -- Contenido estructurado (devuelto por la IA, editable por el usuario)
  contenido                jsonb NOT NULL,           -- { titulo, encabezado_juez, caratula, secciones: [{ titulo, parrafos[] }] }
  -- Auditoría del prompt
  contexto_movement_ids    uuid[] DEFAULT ARRAY[]::uuid[],
  instrucciones_usuario    text,
  registro_tonal           text,                     -- 'retorico' | 'procesal'
  modelo_ia                text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_escritos_expediente
  ON public.escritos (expediente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_escritos_user
  ON public.escritos (user_id, created_at DESC);

-- ── RLS: escrito_templates ──────────────────────────────────────
ALTER TABLE public.escrito_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "escrito_templates_owner_all" ON public.escrito_templates
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── RLS: escritos ───────────────────────────────────────────────
ALTER TABLE public.escritos ENABLE ROW LEVEL SECURITY;

-- SELECT: el autor del escrito o cualquier miembro del expediente
CREATE POLICY "escritos_select" ON public.escritos
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.expedientes e
      WHERE e.id = escritos.expediente_id
        AND (
          e.created_by = auth.uid()
          OR EXISTS (SELECT 1 FROM public.expediente_miembros em WHERE em.expediente_id = e.id AND em.profile_id = auth.uid())
        )
    )
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rol = 'ADMIN')
  );

-- INSERT: solo a su propio user_id, y debe tener acceso al expediente
CREATE POLICY "escritos_insert_owner" ON public.escritos
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.expedientes e
      WHERE e.id = expediente_id
        AND (
          e.created_by = auth.uid()
          OR EXISTS (SELECT 1 FROM public.expediente_miembros em WHERE em.expediente_id = e.id AND em.profile_id = auth.uid())
        )
    )
  );

-- UPDATE/DELETE: solo el autor o ADMIN
CREATE POLICY "escritos_update_owner" ON public.escritos
  FOR UPDATE USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rol = 'ADMIN')
  );

CREATE POLICY "escritos_delete_owner" ON public.escritos
  FOR DELETE USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rol = 'ADMIN')
  );

-- ── Storage bucket: modelos de escritos del usuario ─────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'escritos-templates',
  'escritos-templates',
  false,
  20971520, -- 20 MB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Path convention: <user_id>/<template_id>.<ext>
CREATE POLICY "escritos_templates_owner_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'escritos-templates'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "escritos_templates_owner_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'escritos-templates'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "escritos_templates_owner_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'escritos-templates'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── Trigger de updated_at ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS escrito_templates_updated_at ON public.escrito_templates;
CREATE TRIGGER escrito_templates_updated_at
  BEFORE UPDATE ON public.escrito_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS escritos_updated_at ON public.escritos;
CREATE TRIGGER escritos_updated_at
  BEFORE UPDATE ON public.escritos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

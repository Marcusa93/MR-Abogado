-- Escritos standalone: expediente_id opcional + modelos compartidos

-- 1. Permitir escritos sin expediente (independientes)
ALTER TABLE public.escritos
  ALTER COLUMN expediente_id DROP NOT NULL;

-- Índice auxiliar para listar por usuario (sin expediente)
CREATE INDEX IF NOT EXISTS idx_escritos_user_created
  ON public.escritos (user_id, created_at DESC);

-- 2. Ampliar escrito_templates con soporte de modelos estructurales compartidos
ALTER TABLE public.escrito_templates
  ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT 'estilo'
    CHECK (categoria IN ('estilo', 'modelo')),
  ADD COLUMN IF NOT EXISTS contenido_modelo jsonb,
  ADD COLUMN IF NOT EXISTS compartido boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_escrito_templates_modelos
  ON public.escrito_templates (categoria, compartido) WHERE is_active = true;

-- 3. Actualizar RLS en escritos
--    SELECT ya cubre al author (user_id = auth.uid()), así que escritos sin
--    expediente quedan accesibles solo para el autor y admins — correcto.

-- INSERT: permitir escritos sin expediente (el user solo necesita ser el propietario)
DROP POLICY IF EXISTS "escritos_insert_owner" ON public.escritos;
CREATE POLICY "escritos_insert_owner" ON public.escritos
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND (
      expediente_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.expedientes e
        WHERE e.id = expediente_id
          AND (
            e.created_by = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.expediente_miembros em
              WHERE em.expediente_id = e.id AND em.profile_id = auth.uid()
            )
          )
      )
    )
  );

-- 4. RLS en escrito_templates: cualquier usuario autenticado puede leer modelos compartidos
DROP POLICY IF EXISTS "escrito_templates_owner_all" ON public.escrito_templates;

CREATE POLICY "escrito_templates_owner_all" ON public.escrito_templates
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "escrito_templates_shared_read" ON public.escrito_templates
  FOR SELECT USING (compartido = true AND categoria = 'modelo' AND is_active = true);

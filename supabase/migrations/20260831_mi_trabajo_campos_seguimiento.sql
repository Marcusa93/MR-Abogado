-- Módulo Mi Trabajo: campos de seguimiento
-- Agrega: prioridad a consultas, next_action + blocker + folder_url a ambas tablas.
-- Agrega: tipo a expediente_notas para registro de actividad tipada.

ALTER TABLE public.consultas
  ADD COLUMN IF NOT EXISTS prioridad   text DEFAULT 'MEDIA'
    CHECK (prioridad IN ('BAJA','MEDIA','ALTA','URGENTE')),
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS blocker     text,
  ADD COLUMN IF NOT EXISTS folder_url  text;

ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS blocker     text,
  ADD COLUMN IF NOT EXISTS folder_url  text;

ALTER TABLE public.expediente_notas
  ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'nota'
    CHECK (tipo IN ('nota','llamada','email','reunion','documento','tarea','otro'));

CREATE INDEX IF NOT EXISTS idx_consultas_prioridad ON public.consultas(prioridad);
CREATE INDEX IF NOT EXISTS idx_consultas_blocker   ON public.consultas(blocker)   WHERE blocker IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expedientes_blocker ON public.expedientes(blocker) WHERE blocker IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expedientes_folder  ON public.expedientes(folder_url) WHERE folder_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consultas_folder    ON public.consultas(folder_url)   WHERE folder_url IS NOT NULL;

-- Registrar migración
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260831120000', 'mi_trabajo_campos_seguimiento', 1)
ON CONFLICT DO NOTHING;

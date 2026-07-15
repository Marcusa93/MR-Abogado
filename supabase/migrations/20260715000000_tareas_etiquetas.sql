-- Reemplaza tipo_tarea_id (FK a catálogo rígido) por etiquetas libres (text[]).
-- La columna tipo_tarea_id se deja intacta en DB para no romper datos existentes;
-- queda deprecated y no se usa desde el frontend.

ALTER TABLE public.tareas
  ADD COLUMN IF NOT EXISTS etiquetas text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.tareas.etiquetas IS 'Etiquetas libres: array de strings en minúsculas, sin FK. Ej: {cobro, urgente, trámite}';

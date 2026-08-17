-- Columna de deduplicación: si la función ya creó una tarea automática
-- para esta actuación, guarda el id acá para no duplicarla en re-análisis.
ALTER TABLE public.sae_movements
  ADD COLUMN IF NOT EXISTS auto_tarea_id uuid REFERENCES public.tareas(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.sae_movements.auto_tarea_id IS
  'Tarea creada automáticamente por el analizador IA cuando detecta un plazo procesal. Null si no se creó ninguna.';
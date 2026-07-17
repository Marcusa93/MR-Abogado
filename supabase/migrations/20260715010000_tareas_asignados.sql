-- Soporte de múltiples asignados en tareas
-- Se agrega un array de UUIDs; asignado_a queda como primer elemento (backward-compat).
ALTER TABLE public.tareas
  ADD COLUMN IF NOT EXISTS asignados uuid[] NOT NULL DEFAULT '{}';

-- Poblar desde asignado_a existente
UPDATE public.tareas
  SET asignados = ARRAY[asignado_a]::uuid[]
  WHERE asignado_a IS NOT NULL;

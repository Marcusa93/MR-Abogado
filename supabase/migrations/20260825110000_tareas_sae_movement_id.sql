-- Vincula tareas a actuaciones SAE.
-- Permite navegar desde la tarea directamente a la actuación que la originó.

ALTER TABLE public.tareas
  ADD COLUMN IF NOT EXISTS sae_movement_id uuid
    REFERENCES public.sae_movements(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tareas.sae_movement_id IS
  'Actuación SAE que originó esta tarea (si fue creada desde tab-actuaciones).';

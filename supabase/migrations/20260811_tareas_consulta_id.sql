-- Vincula tareas a consultas (para consultas asignadas a Claudio)
ALTER TABLE public.tareas ADD COLUMN IF NOT EXISTS consulta_id uuid REFERENCES public.consultas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tareas_consulta_id ON public.tareas(consulta_id);

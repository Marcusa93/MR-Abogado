-- Agenda rápida: fecha y hora de reunión/audiencia inicial sobre consulta previa
ALTER TABLE public.consultas
  ADD COLUMN IF NOT EXISTS fecha_turno timestamptz;

CREATE INDEX IF NOT EXISTS idx_consultas_fecha_turno
  ON public.consultas(fecha_turno)
  WHERE fecha_turno IS NOT NULL;

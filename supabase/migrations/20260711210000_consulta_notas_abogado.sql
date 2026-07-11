-- Agrega campo para que el abogado agregue observaciones propias al diagnóstico IA
ALTER TABLE public.consultas
  ADD COLUMN IF NOT EXISTS notas_abogado text;

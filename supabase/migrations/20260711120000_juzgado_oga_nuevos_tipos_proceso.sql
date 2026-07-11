-- Agrega juzgado_numero y oga a expedientes, e incorpora nuevos tipos de proceso
ALTER TABLE public.expedientes ADD COLUMN IF NOT EXISTS juzgado_numero integer;
ALTER TABLE public.expedientes ADD COLUMN IF NOT EXISTS oga text;

-- Nuevos tipos de proceso (fuero 'universal' = aplica a todos los fueros)
INSERT INTO public.tipos_proceso_judicial (codigo, nombre, fuero, jurisdiccion, descripcion, norma_base, orden)
VALUES
  ('mediacion', 'Mediación', 'universal', 'tucuman',
   'Proceso de mediación prejudicial o intrajudicial.',
   NULL, 50),
  ('incidente_embargo', 'Incidente de Embargo', 'universal', 'tucuman',
   'Incidente cautelar de embargo dentro de un proceso principal.',
   NULL, 60),
  ('cuaderno_prueba', 'Cuaderno de Prueba', 'universal', 'tucuman',
   'Cuaderno de prueba separado dentro del proceso principal.',
   NULL, 70)
ON CONFLICT (codigo) DO NOTHING;

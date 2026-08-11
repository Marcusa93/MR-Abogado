-- Pipeline de estados para consultas

-- 1. Columna para notas de transición (ej: "Falta DNI del demandado")
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS estado_notas text;

-- 2. Migrar en_revision → con_claudio (estado previo que ya existía)
UPDATE public.consultas SET estado = 'con_claudio' WHERE estado = 'en_revision';

-- 3. Reemplazar constraint con todos los estados del pipeline
ALTER TABLE public.consultas DROP CONSTRAINT IF EXISTS consultas_estado_check;
ALTER TABLE public.consultas
  ADD CONSTRAINT consultas_estado_check
  CHECK (estado IN (
    'pendiente','en_proceso','presupuestada',
    'con_claudio','requiere_info','redactando',
    'convertida','resuelta','descartada'
  ));

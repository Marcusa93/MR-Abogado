-- Agrega fuero "documentos_locaciones" (ejecuciones de pagaré, alquileres, cheques, etc.)
-- Requiere alterar los CHECK constraints en expedientes y tipos_proceso_judicial.

-- 1. expedientes.fuero
ALTER TABLE public.expedientes
  DROP CONSTRAINT IF EXISTS expedientes_fuero_check;

ALTER TABLE public.expedientes
  ADD CONSTRAINT expedientes_fuero_check
  CHECK (fuero IS NULL OR fuero IN (
    'civil', 'laboral', 'penal', 'familia',
    'administrativo', 'comercial', 'previsional',
    'documentos_locaciones', 'otro'
  ));

-- 2. tipos_proceso_judicial.fuero
ALTER TABLE public.tipos_proceso_judicial
  DROP CONSTRAINT IF EXISTS tipos_proceso_judicial_fuero_check;

ALTER TABLE public.tipos_proceso_judicial
  ADD CONSTRAINT tipos_proceso_judicial_fuero_check
  CHECK (fuero IN (
    'civil', 'comercial', 'laboral', 'penal', 'familia',
    'administrativo', 'previsional',
    'documentos_locaciones', 'otro'
  ));

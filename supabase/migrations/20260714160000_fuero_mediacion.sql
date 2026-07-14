-- Agrega fuero "mediacion" para expedientes de mediación prejudicial y extrajudicial.
-- Sigue el mismo patrón que 20260711180000_fuero_documentos_locaciones.sql.

-- 1. expedientes.fuero
ALTER TABLE public.expedientes
  DROP CONSTRAINT IF EXISTS expedientes_fuero_check;

ALTER TABLE public.expedientes
  ADD CONSTRAINT expedientes_fuero_check
  CHECK (fuero IS NULL OR fuero IN (
    'civil', 'laboral', 'penal', 'familia',
    'administrativo', 'comercial', 'previsional',
    'documentos_locaciones', 'mediacion', 'otro'
  ));

-- 2. tipos_proceso_judicial.fuero
ALTER TABLE public.tipos_proceso_judicial
  DROP CONSTRAINT IF EXISTS tipos_proceso_judicial_fuero_check;

ALTER TABLE public.tipos_proceso_judicial
  ADD CONSTRAINT tipos_proceso_judicial_fuero_check
  CHECK (fuero IN (
    'civil', 'comercial', 'laboral', 'penal', 'familia',
    'administrativo', 'previsional',
    'documentos_locaciones', 'mediacion', 'otro'
  ));

-- 3. Tipos de proceso para mediación
INSERT INTO public.tipos_proceso_judicial (codigo, nombre, fuero, jurisdiccion, descripcion, norma_base, orden)
VALUES
  (
    'mediacion_prejudicial_tucuman',
    'Mediación Prejudicial',
    'mediacion',
    'tucuman',
    'Proceso de mediación prejudicial obligatoria. Culmina con acuerdo homologable o acta de fracaso que habilita la vía judicial.',
    'Ley 26.589 / Ley Prov. Tucumán 7.844',
    10
  ),
  (
    'mediacion_extrajudicial_tucuman',
    'Mediación Extrajudicial / Voluntaria',
    'mediacion',
    'tucuman',
    'Mediación voluntaria entre las partes, sin obligación procesal previa. Puede versar sobre cualquier materia disponible.',
    'Ley 26.589',
    20
  )
ON CONFLICT (codigo) DO NOTHING;

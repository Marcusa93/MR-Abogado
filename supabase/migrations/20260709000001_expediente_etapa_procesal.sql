-- Etapa procesal del expediente (distinta de estado_interno, que es más un
-- estado de gestión). Texto libre con valores sugeridos en el front (Demanda,
-- Contestación, Apertura a prueba, Etapa probatoria, Alegatos, Sentencia, etc.)
-- y posibilidad de sugerencia por IA.
ALTER TABLE public.expedientes ADD COLUMN IF NOT EXISTS etapa_procesal text;

COMMENT ON COLUMN public.expedientes.etapa_procesal IS
  'Etapa procesal actual del expediente (Demanda, Contestación, Apertura a prueba, etc.). Texto libre.';

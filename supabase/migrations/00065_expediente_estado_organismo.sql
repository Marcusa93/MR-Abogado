-- ============================================================
-- Migración 065: estado del expediente en el organismo (SAE)
--
-- Captura el "estado de trámite" que muestra el SAE en la cabecera del
-- expediente (ej "NO EN LETRA (PARA RESOLVER) desde 27/05/2026"). Este
-- dato existía como columna estado_organismo (text) pero nunca se poblaba.
--
-- Ahora:
-- - estado_organismo_desde: fecha desde la que está en ese estado
-- - sae_proceeding_entry: entry crudo de /api/user/proceedings (jsonb)
--   útil para debug y para extraer campos nuevos sin migrar
-- ============================================================

ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS estado_organismo_desde date,
  ADD COLUMN IF NOT EXISTS sae_proceeding_entry jsonb;

COMMENT ON COLUMN public.expedientes.estado_organismo IS
  'Estado del expediente en el organismo (texto literal del SAE, ej "NO EN LETRA (PARA RESOLVER)"). Se actualiza en cada sae-sync.';
COMMENT ON COLUMN public.expedientes.estado_organismo_desde IS
  'Fecha desde la que el expediente está en estado_organismo (parsea "Desde el dd/mm/yyyy" del SAE).';
COMMENT ON COLUMN public.expedientes.sae_proceeding_entry IS
  'Entry completo (jsonb) de /api/user/proceedings para este expediente. Útil para debug y para extraer campos nuevos sin migrar.';

CREATE INDEX IF NOT EXISTS idx_expedientes_estado_organismo
  ON public.expedientes(estado_organismo) WHERE estado_organismo IS NOT NULL;

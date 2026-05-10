-- ============================================================================
-- Marco Rossi Estudio Jurídico - Migración 012: Tipos de alertas + soft delete notas
-- ============================================================================

-- Actualizar alertas.tipo check constraint para usar valores uppercase
-- consistentes con la definición en 00003.
ALTER TABLE public.alertas DROP CONSTRAINT IF EXISTS alertas_tipo_check;
ALTER TABLE public.alertas ADD CONSTRAINT alertas_tipo_check
  CHECK (tipo IN (
    'SEGUIMIENTO_PENDIENTE',
    'AUDIENCIA_PROXIMA',
    'TAREA_VENCIDA',
    'SIN_RESPONSABLE',
    'DOCUMENTO_FALTANTE',
    'ESTADO_CAMBIO',
    'SISTEMA',
    'MENCION',
    'CUSTOM'
  ));

-- Soft delete para expediente_notas (ya incluido en 00003 con columnas
-- eliminada y eliminada_at, pero se mantiene aquí para idempotencia)
ALTER TABLE public.expediente_notas
  ADD COLUMN IF NOT EXISTS eliminada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS eliminada_at timestamptz;

-- Policy de soft-delete para notas (ya incluida en 00004 como notas_update_soft_delete)
DROP POLICY IF EXISTS notas_update_soft_delete ON public.expediente_notas;
CREATE POLICY notas_update_soft_delete ON public.expediente_notas
  FOR UPDATE
  USING (created_by = auth.uid() OR public.is_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_admin());

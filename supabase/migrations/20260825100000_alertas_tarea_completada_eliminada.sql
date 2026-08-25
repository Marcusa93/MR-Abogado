-- Agrega TAREA_COMPLETADA y TAREA_ELIMINADA al CHECK de alertas.tipo.
-- Permite disparar notificaciones push a socios cuando una tarea se completa o elimina.

ALTER TABLE public.alertas DROP CONSTRAINT IF EXISTS alertas_tipo_check;

ALTER TABLE public.alertas
  ADD CONSTRAINT alertas_tipo_check CHECK (tipo IN (
    'SEGUIMIENTO_PENDIENTE',
    'AUDIENCIA_PROXIMA',
    'TURNO_PROXIMO',
    'TAREA_VENCIDA',
    'VENCIMIENTO_TAREA',
    'TAREA_ASIGNADA',
    'TAREA_COMPLETADA',
    'TAREA_ELIMINADA',
    'SIN_RESPONSABLE',
    'DOCUMENTO_FALTANTE',
    'ESTADO_CAMBIO',
    'COBRO_PENDIENTE',
    'SISTEMA',
    'MENCION',
    'CUSTOM'
  ));

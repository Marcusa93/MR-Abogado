-- Plazo judicial workflow: propuesta IA + escalada + recordatorio T-3
-- 1) Columna plazo_sugerido en sae_notificaciones
ALTER TABLE public.sae_notificaciones
  ADD COLUMN IF NOT EXISTS plazo_sugerido jsonb;

-- 2) Nuevo tipo PLAZO_PROPUESTO en alertas + columna escalada_at
ALTER TABLE public.alertas
  DROP CONSTRAINT IF EXISTS alertas_tipo_check;

ALTER TABLE public.alertas
  ADD CONSTRAINT alertas_tipo_check CHECK (tipo IN (
    'SEGUIMIENTO_PENDIENTE',
    'AUDIENCIA_PROXIMA',
    'TURNO_PROXIMO',
    'TAREA_VENCIDA',
    'VENCIMIENTO_TAREA',
    'TAREA_ASIGNADA',
    'SIN_RESPONSABLE',
    'DOCUMENTO_FALTANTE',
    'ESTADO_CAMBIO',
    'COBRO_PENDIENTE',
    'SISTEMA',
    'MENCION',
    'CUSTOM',
    'PLAZO_PROPUESTO'
  ));

ALTER TABLE public.alertas
  ADD COLUMN IF NOT EXISTS escalada_at timestamptz;

-- 3) Flag para tareas que son plazos judiciales (activa recordatorio T-3)
ALTER TABLE public.tareas
  ADD COLUMN IF NOT EXISTS es_plazo_judicial boolean DEFAULT false;

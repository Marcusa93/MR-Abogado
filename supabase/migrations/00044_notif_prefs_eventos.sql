-- ============================================================
-- Migración 044: Preferencias granulares de notificación por evento.
--
-- profiles.notif_prefs: jsonb con shape
--   { "<EVENT_KEY>": { "push": bool, "email": bool } }
--
-- Si una key no está, el sistema asume defaults sensatos (push=true
-- para los más críticos, email solo para urgentes). El usuario puede
-- override cualquiera en /configuracion → Notificaciones de la app.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notif_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.notif_prefs IS
  'Preferencias por tipo de evento. Shape: { MENCION: {push: true, email: false}, ... }. Si una key falta, se aplica el default canónico definido en _shared/notif-events.ts.';

-- Ampliar el CHECK constraint de alertas.tipo para incluir los eventos
-- nuevos que estamos disparando desde el código (TAREA_ASIGNADA) y el
-- legacy que el frontend ya usa pero que no estaba en el enum original
-- (VENCIMIENTO_TAREA). Estaba fallando silenciosamente porque el código
-- no captura el error del insert.
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
    'CUSTOM'
  ));

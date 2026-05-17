-- ============================================================
-- Migración 050: Prioridad automática (IA) para notificaciones SAE.
--
-- Cuando llega una notif nueva, sae-poll-notificaciones le pide a Claude
-- Haiku que estime urgencia + plazo aproximado en días, y un resumen
-- de una sola línea. Los urgentes disparan push aunque las prefs del
-- user lo tengan apagado para el tipo SAE.
-- ============================================================

ALTER TABLE public.sae_notificaciones
  ADD COLUMN IF NOT EXISTS prioridad text
    CHECK (prioridad IN ('urgente', 'normal', 'info')),
  ADD COLUMN IF NOT EXISTS plazo_estimado_dias int,
  ADD COLUMN IF NOT EXISTS ia_resumen text,
  ADD COLUMN IF NOT EXISTS ia_analyzed_at timestamptz;

COMMENT ON COLUMN public.sae_notificaciones.prioridad IS
  'Categoría estimada por IA al ingresar la notif: urgente (<48hs, plazo perentorio), normal (acción esperable), info (puro registro).';

COMMENT ON COLUMN public.sae_notificaciones.plazo_estimado_dias IS
  'Estimación en días hábiles del plazo procesal. Es un valor orientativo basado en el texto, NO un plazo legal vinculante.';

COMMENT ON COLUMN public.sae_notificaciones.ia_resumen IS
  'Resumen de una sola línea generado por IA para mostrar en el feed sin que el abogado tenga que abrir la notif.';

CREATE INDEX IF NOT EXISTS sae_notificaciones_prioridad_idx
  ON public.sae_notificaciones (profile_id, prioridad)
  WHERE prioridad IS NOT NULL AND leida = false;

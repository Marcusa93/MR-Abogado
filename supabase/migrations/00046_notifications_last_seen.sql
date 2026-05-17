-- ============================================================
-- Migración 046: Marca temporal de "última visita" al feed de notificaciones.
--
-- Se actualiza cada vez que el usuario abre la campanita o entra a
-- /notificaciones, /alertas o /notificaciones-sae. En el dropdown
-- usamos este timestamp para mostrar un separador "Nuevas" arriba
-- y "Anteriores" debajo.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notifications_last_seen_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.profiles.notifications_last_seen_at IS
  'Última vez que el usuario abrió el feed de notificaciones. Items con created_at > este valor se marcan como "nuevos" en el dropdown.';

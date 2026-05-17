-- ============================================================
-- Migración 051: Payload jsonb en alertas para acciones rápidas.
--
-- Cuando una alerta refiere a una entidad concreta (tarea, audiencia,
-- nota), guardamos el id ahí. Habilita acciones rápidas inline desde
-- el feed: "Marcar tarea hecha", "Responder mención", etc.
--
-- Shape sugerido:
--   { "tarea_id": "...", "nota_id": "...", "audiencia_id": "..." }
-- ============================================================

ALTER TABLE public.alertas
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.alertas.payload IS
  'Referencias a entidades relacionadas (tarea_id, nota_id, etc.). Habilita acciones rápidas desde la UI sin entrar al expediente.';

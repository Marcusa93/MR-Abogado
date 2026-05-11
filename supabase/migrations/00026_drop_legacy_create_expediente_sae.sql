-- ============================================================
-- Migración 026: Eliminar versión legacy de create_expediente_sae
-- Había dos overloads (p_prioridad text vs p_tipo_tramite_id uuid)
-- y PostgREST no podía resolver cuál llamar.
-- ============================================================

DROP FUNCTION IF EXISTS public.create_expediente_sae(text, text, uuid, text);

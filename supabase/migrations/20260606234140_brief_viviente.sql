-- ============================================================
-- Brief viviente: marca de "pendiente de actualizar" cuando hay
-- novedades importantes en el expediente desde la última generación.
--
-- - ai_brief_pending_refresh: true si hubo eventos relevantes desde
--   ai_brief_generated_at.
-- - ai_brief_pending_reasons: jsonb con la lista de motivos (ej:
--   "Nueva sentencia analizada", "Audiencia transcripta").
-- - RPC marcar_brief_pendiente: usada por triggers de edge functions.
-- ============================================================

ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS ai_brief_pending_refresh boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_brief_pending_reasons jsonb;

COMMENT ON COLUMN public.expedientes.ai_brief_pending_refresh IS
  'true si hubo cambios relevantes en el expediente desde la última generación del brief. La UI lo usa para avisar al usuario.';
COMMENT ON COLUMN public.expedientes.ai_brief_pending_reasons IS
  'Array JSONB con los motivos pendientes (ej: [{kind: "sentencia_sae", at: ISO, ref: movement_id}, ...]).';

CREATE INDEX IF NOT EXISTS idx_expedientes_brief_pending
  ON public.expedientes(updated_at DESC)
  WHERE ai_brief_pending_refresh = true AND deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- RPC: marca un expediente como pendiente de refresh del brief
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.marcar_brief_pendiente(
  p_expediente_id uuid,
  p_kind text,
  p_ref uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_new_reason jsonb;
  v_current jsonb;
BEGIN
  -- No requerimos auth.uid() porque esta RPC es invocada por edge functions
  -- con service role o por el usuario que ya pasó RLS.

  v_new_reason := jsonb_build_object(
    'kind', p_kind,
    'at', now(),
    'ref', p_ref
  );

  SELECT ai_brief_pending_reasons INTO v_current
  FROM public.expedientes
  WHERE id = p_expediente_id;

  IF v_current IS NULL OR jsonb_typeof(v_current) <> 'array' THEN
    v_current := '[]'::jsonb;
  END IF;

  -- Cap de 20 motivos para no inflar
  v_current := (v_current || v_new_reason);
  IF jsonb_array_length(v_current) > 20 THEN
    v_current := (
      SELECT jsonb_agg(elem)
      FROM (
        SELECT elem FROM jsonb_array_elements(v_current) elem
        OFFSET (jsonb_array_length(v_current) - 20)
      ) s
    );
  END IF;

  UPDATE public.expedientes
  SET ai_brief_pending_refresh = true,
      ai_brief_pending_reasons = v_current
  WHERE id = p_expediente_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.marcar_brief_pendiente(uuid, text, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- Helper para limpiar el flag cuando el brief se regenera
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.limpiar_brief_pendiente(p_expediente_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.expedientes
  SET ai_brief_pending_refresh = false,
      ai_brief_pending_reasons = NULL
  WHERE id = p_expediente_id;
$$;

GRANT EXECUTE ON FUNCTION public.limpiar_brief_pendiente(uuid) TO authenticated;

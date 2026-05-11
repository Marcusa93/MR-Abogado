-- ============================================================
-- Migración 033: Marcado manual de actuaciones SAE como "audiencia"
--
-- Mismo patrón que is_key:
--   NULL  = sin opinión (auto-detección si tiene adjunto de audio)
--   TRUE  = marcada explícitamente como audiencia
--   FALSE = explícitamente excluida
-- ============================================================

ALTER TABLE public.sae_movements
  ADD COLUMN IF NOT EXISTS is_audiencia boolean;

CREATE INDEX IF NOT EXISTS idx_sae_movements_is_audiencia
  ON public.sae_movements (expediente_id, is_audiencia)
  WHERE is_audiencia IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_sae_movement_audiencia(
  p_movement_id uuid,
  p_is_audiencia boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expediente_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'P0401';
  END IF;

  SELECT expediente_id INTO v_expediente_id
  FROM public.sae_movements
  WHERE id = p_movement_id;

  IF v_expediente_id IS NULL THEN
    RAISE EXCEPTION 'Actuación no encontrada' USING ERRCODE = 'P0404';
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1 FROM public.expedientes e
      WHERE e.id = v_expediente_id AND e.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.expediente_miembros em
      WHERE em.expediente_id = v_expediente_id AND em.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.rol = 'ADMIN'
    )
  ) THEN
    RAISE EXCEPTION 'Sin permisos sobre esta actuación' USING ERRCODE = 'P0403';
  END IF;

  UPDATE public.sae_movements
  SET is_audiencia = p_is_audiencia
  WHERE id = p_movement_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_sae_movement_audiencia TO authenticated;

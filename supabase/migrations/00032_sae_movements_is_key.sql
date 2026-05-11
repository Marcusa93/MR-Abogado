-- ============================================================
-- Migración 032: Marcado manual de actuaciones SAE como "claves"
--
-- Tres estados:
--   NULL  = sin opinión del usuario (cae en el filtro automático del tab claves)
--   TRUE  = marcada explícitamente como clave
--   FALSE = explícitamente excluida (fuerza no aparecer en claves
--           aunque el auto-filtro la elija)
-- ============================================================

ALTER TABLE public.sae_movements
  ADD COLUMN IF NOT EXISTS is_key boolean;

CREATE INDEX IF NOT EXISTS idx_sae_movements_is_key
  ON public.sae_movements (expediente_id, is_key)
  WHERE is_key IS NOT NULL;

-- ── RPC para que el cliente pueda actualizar is_key sin abrir UPDATE ────
-- en la RLS general de la tabla. SECURITY DEFINER + check de permisos.

CREATE OR REPLACE FUNCTION public.set_sae_movement_key(
  p_movement_id uuid,
  p_is_key boolean
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

  -- Permite si: creador del expediente, miembro, o ADMIN
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
  SET is_key = p_is_key
  WHERE id = p_movement_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_sae_movement_key TO authenticated;

-- ============================================================
-- Migración 027: Permitir al creador del expediente ver sus actuaciones SAE
--
-- La policy original sólo dejaba ver a miembros explícitos. Los expedientes
-- importados desde SAE no agregan miembros automáticamente, así que el
-- creador no podía ver sus propias actuaciones sincronizadas.
-- ============================================================

DROP POLICY IF EXISTS "sae_movements_select" ON public.sae_movements;

CREATE POLICY "sae_movements_select" ON public.sae_movements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.expediente_miembros em
      WHERE em.expediente_id = sae_movements.expediente_id
        AND em.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.expedientes e
      WHERE e.id = sae_movements.expediente_id
        AND e.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND rol = 'ADMIN'
    )
  );

-- La dirección puede aprobar, editar o descartar aprendizajes de cualquier
-- abogado sin cambiarle el dueño. Antes el WITH CHECK solo admitía filas
-- propias (o universales), y aprobar uno ajeno fallaba por RLS.
DROP POLICY IF EXISTS aprendizajes_update ON public.aprendizajes_rulebook;
CREATE POLICY aprendizajes_update ON public.aprendizajes_rulebook FOR UPDATE
  USING (owner_id = auth.uid() OR is_director())
  WITH CHECK (
    (scope IN ('personal', 'compartido') AND owner_id = auth.uid())
    OR (scope = 'universal' AND is_director())
    OR (is_director() AND owner_id IS NOT NULL)
  );

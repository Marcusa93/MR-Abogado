-- Los descartados (is_active=false) no los veía nadie: la pestaña Archivados
-- quedaba siempre vacía. El dueño y la dirección ven todos los suyos.
DROP POLICY IF EXISTS aprendizajes_select ON public.aprendizajes_rulebook;
CREATE POLICY aprendizajes_select ON public.aprendizajes_rulebook FOR SELECT USING (
  owner_id = auth.uid()
  OR is_director()
  OR (is_active = true AND (
    scope = 'universal'
    OR (scope = 'compartido' AND public.aprendizaje_compartido_con(id, auth.uid()))
  ))
);

-- Las políticas de aprendizajes_rulebook y aprendizajes_compartidos se
-- consultaban mutuamente y Postgres cortaba con "infinite recursion detected":
-- ninguna consulta autenticada devolvía aprendizajes. Se rompe el ciclo con
-- funciones SECURITY DEFINER que leen cada tabla sin pasar por su RLS.

CREATE OR REPLACE FUNCTION public.aprendizaje_compartido_con(p_aprendizaje_id uuid, p_profile_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM aprendizajes_compartidos
    WHERE aprendizaje_id = p_aprendizaje_id AND profile_id = p_profile_id
  )
$$;

CREATE OR REPLACE FUNCTION public.aprendizaje_owner(p_aprendizaje_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT owner_id FROM aprendizajes_rulebook WHERE id = p_aprendizaje_id
$$;

REVOKE ALL ON FUNCTION public.aprendizaje_compartido_con(uuid, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.aprendizaje_owner(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.aprendizaje_compartido_con(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aprendizaje_owner(uuid) TO authenticated;

DROP POLICY IF EXISTS aprendizajes_select ON public.aprendizajes_rulebook;
CREATE POLICY aprendizajes_select ON public.aprendizajes_rulebook FOR SELECT USING (
  is_active = true AND (
    scope = 'universal'
    OR owner_id = auth.uid()
    OR (scope = 'compartido' AND public.aprendizaje_compartido_con(id, auth.uid()))
    OR is_director()
  )
);

DROP POLICY IF EXISTS aprendizajes_compartidos_select ON public.aprendizajes_compartidos;
CREATE POLICY aprendizajes_compartidos_select ON public.aprendizajes_compartidos FOR SELECT USING (
  profile_id = auth.uid()
  OR public.aprendizaje_owner(aprendizaje_id) = auth.uid()
  OR is_director()
);

DROP POLICY IF EXISTS aprendizajes_compartidos_modify_owner ON public.aprendizajes_compartidos;
CREATE POLICY aprendizajes_compartidos_modify_owner ON public.aprendizajes_compartidos FOR ALL
  USING (public.aprendizaje_owner(aprendizaje_id) = auth.uid() OR is_director())
  WITH CHECK (public.aprendizaje_owner(aprendizaje_id) = auth.uid() OR is_director());

-- El borrado de contenidos es soft-delete (UPDATE que setea deleted_at). La
-- policy de UPDATE en prod tenía WITH CHECK (deleted_at IS NULL), que rechaza
-- justamente esa operación → 403 al eliminar. Esta migración:
--   1. Corrige contenidos_update para que el WITH CHECK no exija deleted_at NULL.
--   2. Suma DIRECTOR a la policy de DELETE (por si se usa hard delete).

DROP POLICY IF EXISTS contenidos_update ON public.contenidos;
CREATE POLICY contenidos_update ON public.contenidos
  FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS contenidos_delete ON public.contenidos;
CREATE POLICY contenidos_delete ON public.contenidos
  FOR DELETE
  USING (
    created_by = auth.uid()
    OR public.is_admin()
    OR public.current_user_role() = 'DIRECTOR'
  );

-- Solución definitiva al problema de soft-delete en gastos/ingresos.
--
-- El error "new row violates row-level security policy" persiste porque
-- PostgreSQL evalúa WITH CHECK en el contexto posterior al UPDATE.
-- En ese contexto, can_access_caja() (STABLE SECURITY DEFINER) puede
-- retornar false si auth.uid() no está disponible en la sub-evaluación.
--
-- Estrategia: eliminar deleted_at IS NULL de todas las políticas RLS.
-- El filtrado de filas borradas pasa a ser responsabilidad del frontend
-- (WHERE deleted_at IS NULL en las queries) y de los RPCs (ya filtran).
-- Con esto, FOR UPDATE/WITH CHECK solo verifica acceso, nunca el estado
-- de la fila resultante.

-- ── gastos ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS gastos_select_caja  ON public.gastos;
DROP POLICY IF EXISTS gastos_insert_caja  ON public.gastos;
DROP POLICY IF EXISTS gastos_update_caja  ON public.gastos;
DROP POLICY IF EXISTS gastos_all_caja     ON public.gastos;

-- Una sola política para todo. Sin deleted_at en ningún lado.
CREATE POLICY gastos_caja ON public.gastos
  FOR ALL
  USING  (public.can_access_caja())
  WITH CHECK (public.can_access_caja());

-- ── ingresos ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS ingresos_select_caja ON public.ingresos;
DROP POLICY IF EXISTS ingresos_insert_caja ON public.ingresos;
DROP POLICY IF EXISTS ingresos_update_caja ON public.ingresos;
DROP POLICY IF EXISTS ingresos_all_caja    ON public.ingresos;

CREATE POLICY ingresos_caja ON public.ingresos
  FOR ALL
  USING  (public.can_access_caja())
  WITH CHECK (public.can_access_caja());

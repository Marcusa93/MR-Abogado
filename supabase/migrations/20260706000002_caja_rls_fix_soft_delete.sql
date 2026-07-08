-- Fix: el soft-delete (UPDATE que pone deleted_at) fallaba con
-- "new row violates row-level security policy" porque la política
-- FOR ALL usaba USING (can_access_caja() AND deleted_at IS NULL).
--
-- Después de que el UPDATE setea deleted_at, PostgREST verifica
-- el WITH CHECK sobre la fila ya modificada; el row ya no pasa
-- deleted_at IS NULL y el motor reporta violación de política.
--
-- Solución: separar la política en SELECT + INSERT + UPDATE para
-- que el UPDATE no tenga deleted_at IS NULL en el USING.
-- Idem para ingresos, que tiene el mismo esquema.

-- ── gastos ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS gastos_all_caja ON public.gastos;

CREATE POLICY gastos_select_caja ON public.gastos
  FOR SELECT
  USING (public.can_access_caja() AND deleted_at IS NULL);

CREATE POLICY gastos_insert_caja ON public.gastos
  FOR INSERT
  WITH CHECK (public.can_access_caja());

CREATE POLICY gastos_update_caja ON public.gastos
  FOR UPDATE
  USING  (public.can_access_caja())
  WITH CHECK (public.can_access_caja());

-- ── ingresos ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS ingresos_all_caja ON public.ingresos;

CREATE POLICY ingresos_select_caja ON public.ingresos
  FOR SELECT
  USING (public.can_access_caja() AND deleted_at IS NULL);

CREATE POLICY ingresos_insert_caja ON public.ingresos
  FOR INSERT
  WITH CHECK (public.can_access_caja());

CREATE POLICY ingresos_update_caja ON public.ingresos
  FOR UPDATE
  USING  (public.can_access_caja())
  WITH CHECK (public.can_access_caja());

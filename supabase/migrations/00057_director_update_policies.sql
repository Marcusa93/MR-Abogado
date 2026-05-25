-- ============================================================
-- Migración 057: agregar DIRECTOR a las policies de UPDATE
--
-- Bug: el rol DIRECTOR (introducido en migración 053) no estaba en las
-- policies de UPDATE de clientes ni expedientes. RLS filtraba la fila
-- silenciosamente → update().single() fallaba sin mensaje claro.
--
-- Aplicada vía MCP el 2026-05-24.
-- ============================================================

DROP POLICY IF EXISTS clientes_update ON public.clientes;
CREATE POLICY clientes_update ON public.clientes
  FOR UPDATE
  USING (
    (current_user_role() = ANY (ARRAY['ADMIN','DIRECTOR','ABOGADO','COLABORADOR']))
    AND deleted_at IS NULL
  )
  WITH CHECK (deleted_at IS NULL);

DROP POLICY IF EXISTS expedientes_update ON public.expedientes;
CREATE POLICY expedientes_update ON public.expedientes
  FOR UPDATE
  USING (
    (current_user_role() = ANY (ARRAY['ADMIN','DIRECTOR','ABOGADO','COLABORADOR']))
    AND deleted_at IS NULL
  )
  WITH CHECK (deleted_at IS NULL);

DROP POLICY IF EXISTS clientes_insert ON public.clientes;
CREATE POLICY clientes_insert ON public.clientes
  FOR INSERT
  WITH CHECK (
    current_user_role() = ANY (ARRAY['ADMIN','DIRECTOR','ABOGADO','COLABORADOR'])
  );

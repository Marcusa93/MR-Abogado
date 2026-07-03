-- Permisos: SECRETARIA puede crear/editar clientes y audiencias (gestión
-- administrativa). Las tareas ya son insertables por cualquier autenticado.
-- (tareas y audiencias siguen sujetas a can_view_expediente, igual que el resto.)

-- ── clientes ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS clientes_insert ON public.clientes;
CREATE POLICY clientes_insert ON public.clientes
  FOR INSERT
  WITH CHECK (current_user_role() = ANY (ARRAY['ADMIN','DIRECTOR','ABOGADO','COLABORADOR','SECRETARIA']));

DROP POLICY IF EXISTS clientes_update ON public.clientes;
CREATE POLICY clientes_update ON public.clientes
  FOR UPDATE
  USING (
    (current_user_role() = ANY (ARRAY['ADMIN','DIRECTOR','ABOGADO','COLABORADOR','SECRETARIA']))
    AND deleted_at IS NULL
  )
  WITH CHECK (deleted_at IS NULL);

-- ── audiencias ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "audiencias_insert" ON public.audiencias;
DROP POLICY IF EXISTS audiencias_insert_visible ON public.audiencias;
CREATE POLICY audiencias_insert_visible
  ON public.audiencias FOR INSERT
  WITH CHECK (
    public.can_view_expediente(expediente_id)
    AND public.current_user_role() = ANY (ARRAY['ADMIN','DIRECTOR','ABOGADO','COLABORADOR','SECRETARIA'])
  );

DROP POLICY IF EXISTS "audiencias_update" ON public.audiencias;
DROP POLICY IF EXISTS audiencias_update_visible ON public.audiencias;
CREATE POLICY audiencias_update_visible
  ON public.audiencias FOR UPDATE
  USING (
    public.can_view_expediente(expediente_id)
    AND public.current_user_role() = ANY (ARRAY['ADMIN','DIRECTOR','ABOGADO','COLABORADOR','SECRETARIA'])
  )
  WITH CHECK (public.can_view_expediente(expediente_id));

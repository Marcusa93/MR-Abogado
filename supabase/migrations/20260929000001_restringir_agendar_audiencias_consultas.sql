-- Restringe la creación/modificación de audiencias y consultas a ADMIN, ABOGADO y SECRETARIA.
-- COLABORADOR queda como solo-lectura en ambas tablas.

-- ── Audiencias ────────────────────────────────────────────────────────────────

-- INSERT: eliminar DIRECTOR (obsoleto) y COLABORADOR
DROP POLICY IF EXISTS audiencias_insert_visible ON public.audiencias;
CREATE POLICY audiencias_insert_visible ON public.audiencias
  FOR INSERT
  WITH CHECK (
    public.can_view_expediente(expediente_id)
    AND public.current_user_role() = ANY (ARRAY['ADMIN', 'ABOGADO', 'SECRETARIA'])
  );

-- UPDATE: ídem
DROP POLICY IF EXISTS audiencias_update_visible ON public.audiencias;
CREATE POLICY audiencias_update_visible ON public.audiencias
  FOR UPDATE
  USING (
    public.can_view_expediente(expediente_id)
    AND public.current_user_role() = ANY (ARRAY['ADMIN', 'ABOGADO', 'SECRETARIA'])
  )
  WITH CHECK (public.can_view_expediente(expediente_id));

-- DELETE: agregar por consistencia (antes no existía)
DROP POLICY IF EXISTS audiencias_delete_visible ON public.audiencias;
CREATE POLICY audiencias_delete_visible ON public.audiencias
  FOR DELETE
  USING (
    public.can_view_expediente(expediente_id)
    AND public.current_user_role() = ANY (ARRAY['ADMIN', 'ABOGADO', 'SECRETARIA'])
  );

-- ── Audiencia asignados ────────────────────────────────────────────────────────
-- El INSERT no tenía with_check → cualquier autenticado podía asignarse a cualquier audiencia.
DROP POLICY IF EXISTS asignados_insert ON public.audiencia_asignados;
CREATE POLICY asignados_insert ON public.audiencia_asignados
  FOR INSERT
  WITH CHECK (
    public.current_user_role() = ANY (ARRAY['ADMIN', 'ABOGADO', 'SECRETARIA'])
    AND EXISTS (
      SELECT 1 FROM public.audiencias a
      WHERE a.id = audiencia_asignados.audiencia_id
        AND public.can_view_expediente(a.expediente_id)
    )
  );

-- ── Consultas ─────────────────────────────────────────────────────────────────
-- La política actual es ALL con qual=true / with_check=true → todo el mundo puede hacer todo.
-- Se reemplaza por: SELECT abierto + write solo para staff.
DROP POLICY IF EXISTS consultas_authenticated ON public.consultas;

CREATE POLICY consultas_select ON public.consultas
  FOR SELECT USING (true);

CREATE POLICY consultas_insert ON public.consultas
  FOR INSERT
  WITH CHECK (
    public.current_user_role() = ANY (ARRAY['ADMIN', 'ABOGADO', 'SECRETARIA'])
  );

CREATE POLICY consultas_update ON public.consultas
  FOR UPDATE
  USING (public.current_user_role() = ANY (ARRAY['ADMIN', 'ABOGADO', 'SECRETARIA']))
  WITH CHECK (public.current_user_role() = ANY (ARRAY['ADMIN', 'ABOGADO', 'SECRETARIA']));

CREATE POLICY consultas_delete ON public.consultas
  FOR DELETE
  USING (public.current_user_role() = ANY (ARRAY['ADMIN', 'ABOGADO', 'SECRETARIA']));

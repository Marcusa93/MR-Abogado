-- Revierte la restricción de 20260929000001: COLABORADOR vuelve a poder
-- crear/editar/eliminar audiencias (y sus asignados) y consultas.
-- Todos los roles de staff agendan; la visibilidad sigue por can_view_expediente.

-- ── Audiencias ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS audiencias_insert_visible ON public.audiencias;
CREATE POLICY audiencias_insert_visible ON public.audiencias
  FOR INSERT
  WITH CHECK (
    public.can_view_expediente(expediente_id)
    AND public.current_user_role() = ANY (ARRAY['ADMIN', 'ABOGADO', 'SECRETARIA', 'DIRECTOR', 'COLABORADOR'])
  );

DROP POLICY IF EXISTS audiencias_update_visible ON public.audiencias;
CREATE POLICY audiencias_update_visible ON public.audiencias
  FOR UPDATE
  USING (
    public.can_view_expediente(expediente_id)
    AND public.current_user_role() = ANY (ARRAY['ADMIN', 'ABOGADO', 'SECRETARIA', 'DIRECTOR', 'COLABORADOR'])
  )
  WITH CHECK (public.can_view_expediente(expediente_id));

DROP POLICY IF EXISTS audiencias_delete_visible ON public.audiencias;
CREATE POLICY audiencias_delete_visible ON public.audiencias
  FOR DELETE
  USING (
    public.can_view_expediente(expediente_id)
    AND public.current_user_role() = ANY (ARRAY['ADMIN', 'ABOGADO', 'SECRETARIA', 'DIRECTOR', 'COLABORADOR'])
  );

-- ── Audiencia asignados ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS asignados_insert ON public.audiencia_asignados;
CREATE POLICY asignados_insert ON public.audiencia_asignados
  FOR INSERT
  WITH CHECK (
    public.current_user_role() = ANY (ARRAY['ADMIN', 'ABOGADO', 'SECRETARIA', 'DIRECTOR', 'COLABORADOR'])
    AND EXISTS (
      SELECT 1 FROM public.audiencias a
      WHERE a.id = audiencia_asignados.audiencia_id
        AND public.can_view_expediente(a.expediente_id)
    )
  );

-- ── Consultas ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS consultas_insert ON public.consultas;
CREATE POLICY consultas_insert ON public.consultas
  FOR INSERT
  WITH CHECK (
    public.current_user_role() = ANY (ARRAY['ADMIN', 'ABOGADO', 'SECRETARIA', 'DIRECTOR', 'COLABORADOR'])
  );

DROP POLICY IF EXISTS consultas_update ON public.consultas;
CREATE POLICY consultas_update ON public.consultas
  FOR UPDATE
  USING (public.current_user_role() = ANY (ARRAY['ADMIN', 'ABOGADO', 'SECRETARIA', 'DIRECTOR', 'COLABORADOR']))
  WITH CHECK (public.current_user_role() = ANY (ARRAY['ADMIN', 'ABOGADO', 'SECRETARIA', 'DIRECTOR', 'COLABORADOR']));

DROP POLICY IF EXISTS consultas_delete ON public.consultas;
CREATE POLICY consultas_delete ON public.consultas
  FOR DELETE
  USING (public.current_user_role() = ANY (ARRAY['ADMIN', 'ABOGADO', 'SECRETARIA', 'DIRECTOR', 'COLABORADOR']));

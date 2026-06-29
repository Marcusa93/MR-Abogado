-- SECRETARIA y COLABORADOR ven TODOS los expedientes (y lo colgado: audiencias,
-- tareas, actuaciones, escritos, etc.), como el equipo del estudio.
-- can_view_expediente gobierna el SELECT de expedientes y de todas las tablas hijas.

CREATE OR REPLACE FUNCTION public.can_view_expediente(p_expediente_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.is_admin()
    -- Equipo del estudio: secretaria y colaborador ven todo.
    OR public.current_user_role() = ANY (ARRAY['SECRETARIA','COLABORADOR'])
    OR EXISTS (
      SELECT 1
      FROM public.expedientes e
      WHERE e.id = p_expediente_id
        AND e.deleted_at IS NULL
        AND (e.abogado_responsable_id = auth.uid() OR e.created_by = auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.expediente_miembros m
      WHERE m.expediente_id = p_expediente_id
        AND m.profile_id = auth.uid()
        AND m.activo = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.expediente_sae_links l
      WHERE l.expediente_id = p_expediente_id
        AND l.profile_id = auth.uid()
    )
$$;

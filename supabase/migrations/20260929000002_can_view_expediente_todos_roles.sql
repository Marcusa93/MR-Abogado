-- Todos los roles de staff (ABOGADO, DIRECTOR, SECRETARIA, COLABORADOR) ven todos los expedientes.
-- Necesario para que puedan seleccionar expedientes al cargar audiencias, reuniones, etc.
CREATE OR REPLACE FUNCTION public.can_view_expediente(p_expediente_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.is_admin()
    OR public.current_user_role() = ANY (ARRAY['SECRETARIA','COLABORADOR','ABOGADO','DIRECTOR'])
    OR EXISTS (
      SELECT 1 FROM public.expedientes e
      WHERE e.id = p_expediente_id AND e.deleted_at IS NULL
        AND (e.abogado_responsable_id = auth.uid() OR e.created_by = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.expediente_miembros m
      WHERE m.expediente_id = p_expediente_id AND m.profile_id = auth.uid() AND m.activo = true
    )
    OR EXISTS (
      SELECT 1 FROM public.expediente_sae_links l
      WHERE l.expediente_id = p_expediente_id AND l.profile_id = auth.uid()
    )
$$;

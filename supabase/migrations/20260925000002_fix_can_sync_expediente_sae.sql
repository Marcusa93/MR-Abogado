-- Corrige can_sync_expediente_sae: elimina la dependencia circular en expediente_sae_links.
-- El link se crea como RESULTADO de un sync exitoso, no puede ser prerequisito.
-- Reemplazamos ese check por la existencia de credenciales SAE activas del usuario.
CREATE OR REPLACE FUNCTION public.can_sync_expediente_sae(p_expediente_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND public.can_view_expediente(p_expediente_id)
    AND EXISTS (
      SELECT 1
      FROM public.sae_credentials c
      WHERE c.profile_id = auth.uid()
        AND c.provider = 'justucuman'
        AND c.status NOT IN ('desactivado', 'bloqueado')
    )
    AND EXISTS (
      SELECT 1
      FROM public.expedientes e
      WHERE e.id = p_expediente_id
        AND e.deleted_at IS NULL
        AND e.numero_sae IS NOT NULL
    )
$$;

-- Devuelve todos los pares (profile_id, expediente_id) que el cron sae-sync-all
-- debe sincronizar: perfil con credenciales activas + acceso al expediente + numero_sae.
-- Incluye expedientes sin link previo para que el primer sync los descubra solo.
CREATE OR REPLACE FUNCTION public.sae_sync_candidates()
RETURNS TABLE(profile_id uuid, expediente_id uuid, last_sync_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT
    c.profile_id,
    e.id AS expediente_id,
    l.last_sync_at
  FROM public.sae_credentials c
  JOIN public.expedientes e
    ON e.deleted_at IS NULL
    AND e.numero_sae IS NOT NULL
  LEFT JOIN public.expediente_sae_links l
    ON l.profile_id = c.profile_id
    AND l.expediente_id = e.id
    AND l.provider = 'justucuman'
  WHERE
    c.provider = 'justucuman'
    AND c.status NOT IN ('desactivado', 'bloqueado')
    AND (
      e.created_by = c.profile_id
      OR e.abogado_responsable_id = c.profile_id
      OR EXISTS (
        SELECT 1 FROM public.expediente_miembros m
        WHERE m.expediente_id = e.id
          AND m.profile_id = c.profile_id
          AND m.activo = true
      )
    )
$$;

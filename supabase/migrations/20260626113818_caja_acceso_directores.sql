-- Caja: los directores y admins (socios / administración del estudio) tienen
-- acceso automático, sin depender del flag por usuario.
--
-- Antes, can_access_caja() solo devolvía profiles.tiene_acceso_caja, que la
-- migración inicial activó una sola vez para los ADMIN/DIRECTOR existentes.
-- Los directores creados después quedaban sin caja. Esto lo generaliza.

CREATE OR REPLACE FUNCTION public.can_access_caja()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (tiene_acceso_caja = true OR rol IN ('ADMIN', 'DIRECTOR'))
  );
$$;

-- Backfill del flag para consistencia (por si algo lee la columna directo).
UPDATE public.profiles
SET tiene_acceso_caja = true
WHERE rol IN ('ADMIN', 'DIRECTOR')
  AND tiene_acceso_caja = false;

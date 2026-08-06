-- ============================================================
-- Rol CRITERIO — Criterio Jurídico
-- Usuario externo (tipo Claudio) que recibe tareas y consultas
-- para análisis y redacción. Sin acceso a caja.
-- ============================================================

-- 1. Agregar CRITERIO al check constraint de profiles.rol
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_rol_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_rol_check
  CHECK (rol = ANY (ARRAY[
    'DIRECTOR'::text, 'ADMIN'::text, 'ABOGADO'::text,
    'COLABORADOR'::text, 'SECRETARIA'::text, 'CRITERIO'::text
  ]));

-- 2. Actualizar el trigger normalize_profile_before_write para incluir CRITERIO
--    (antes cualquier valor no reconocido caía a COLABORADOR)
CREATE OR REPLACE FUNCTION public.normalize_profile_before_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  NEW.rol := CASE
    WHEN upper(coalesce(NEW.rol, '')) = 'DIRECTOR'   THEN 'DIRECTOR'
    WHEN upper(coalesce(NEW.rol, '')) = 'ADMIN'      THEN 'ADMIN'
    WHEN upper(coalesce(NEW.rol, '')) = 'ABOGADO'    THEN 'ABOGADO'
    WHEN upper(coalesce(NEW.rol, '')) = 'SECRETARIA' THEN 'SECRETARIA'
    WHEN upper(coalesce(NEW.rol, '')) = 'CRITERIO'   THEN 'CRITERIO'
    ELSE 'COLABORADOR'
  END;

  NEW.nombre := COALESCE(NULLIF(NEW.nombre, ''), split_part(COALESCE(NEW.nombre_completo, NEW.email, ''), ' ', 1), '');
  NEW.apellido := COALESCE(
    NEW.apellido,
    NULLIF(regexp_replace(trim(COALESCE(NEW.nombre_completo, '')), '^\S+\s*', ''), ''),
    ''
  );
  NEW.nombre_completo := trim(concat_ws(' ', NULLIF(NEW.nombre, ''), NULLIF(NEW.apellido, '')));

  IF NEW.nombre_completo IS NULL OR NEW.nombre_completo = '' THEN
    NEW.nombre_completo := COALESCE(NEW.email, 'Usuario');
  END IF;

  RETURN NEW;
END;
$$;

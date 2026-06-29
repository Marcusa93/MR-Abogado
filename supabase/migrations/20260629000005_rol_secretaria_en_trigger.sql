-- El trigger normalize_profile_before_write no incluía SECRETARIA en su CASE,
-- por lo que cualquier intento de asignar ese rol lo revertía a COLABORADOR.
-- Esta migración agrega SECRETARIA como valor válido.

CREATE OR REPLACE FUNCTION public.normalize_profile_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.rol := CASE
    WHEN upper(coalesce(NEW.rol, '')) = 'DIRECTOR'    THEN 'DIRECTOR'
    WHEN upper(coalesce(NEW.rol, '')) = 'ADMIN'       THEN 'ADMIN'
    WHEN upper(coalesce(NEW.rol, '')) = 'ABOGADO'     THEN 'ABOGADO'
    WHEN upper(coalesce(NEW.rol, '')) = 'SECRETARIA'  THEN 'SECRETARIA'
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
$function$;

-- Editorial: Claudio colabora (investiga, redacta, edita), pero los artículos
-- salen a nombre de Marco Rossi y aprobarlos/publicarlos es solo de Marco
-- (profiles.editorial_aprueba).

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS editorial_aprueba boolean NOT NULL DEFAULT false;
UPDATE public.profiles SET editorial_aprueba = true WHERE id = 'ceb22752-726c-4377-8f40-2bdccc8c8bbb'; -- Marco Rossi
UPDATE public.profiles SET acceso_editorial = true WHERE id = '20009f67-eb20-4161-bb65-daf0dec86b9a';  -- Claudio

-- editorial_aprueba también es un acceso especial: solo lo cambia el sistema
CREATE OR REPLACE FUNCTION public.proteger_columnas_perfil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol_actor text;
BEGIN
  -- Service role / crons / funciones del sistema
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  IF NEW.tiene_acceso_caja IS DISTINCT FROM OLD.tiene_acceso_caja
     OR NEW.acceso_editorial IS DISTINCT FROM OLD.acceso_editorial
     OR NEW.editorial_aprueba IS DISTINCT FROM OLD.editorial_aprueba THEN
    RAISE EXCEPTION 'No autorizado a cambiar accesos especiales' USING ERRCODE = '42501';
  END IF;

  IF NEW.rol IS DISTINCT FROM OLD.rol OR NEW.activo IS DISTINCT FROM OLD.activo THEN
    SELECT rol INTO v_rol_actor FROM public.profiles WHERE id = auth.uid();
    IF v_rol_actor IS NULL OR v_rol_actor NOT IN ('ADMIN', 'DIRECTOR') THEN
      RAISE EXCEPTION 'No autorizado a cambiar el rol o el estado del usuario' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_aprobar_editorial()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT acceso_editorial AND editorial_aprueba FROM public.profiles WHERE id = auth.uid()), false)
$$;
REVOKE ALL ON FUNCTION public.can_aprobar_editorial() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_aprobar_editorial() TO authenticated;

-- Aprobar o publicar: solo quien tiene editorial_aprueba
CREATE OR REPLACE FUNCTION public.editorial_proteger_aprobacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.estado IN ('aprobado', 'publicado')
     AND (TG_OP = 'INSERT' OR NEW.estado IS DISTINCT FROM OLD.estado)
     AND NOT public.can_aprobar_editorial() THEN
    RAISE EXCEPTION 'Solo Marco Rossi puede aprobar o publicar artículos' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS editorial_proteger_aprobacion ON public.editorial_articulos;
CREATE TRIGGER editorial_proteger_aprobacion
  BEFORE INSERT OR UPDATE OF estado ON public.editorial_articulos
  FOR EACH ROW EXECUTE FUNCTION public.editorial_proteger_aprobacion();

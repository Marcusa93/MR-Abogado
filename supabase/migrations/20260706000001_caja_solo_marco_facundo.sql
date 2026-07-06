-- Caja: restringir visibilidad exclusivamente a Marco Rossi y Facundo Castillo.
--
-- Antes, can_access_caja() daba acceso a todos los DIRECTOR (por rol) o a
-- quien tuviera el flag tiene_acceso_caja. Esto lo reemplaza por un control
-- puramente basado en el flag, sin bypass por rol.
-- El flag queda en false para todos excepto Marco Rossi y Facundo Castillo.

-- 1) Resetear el flag para todos.
UPDATE public.profiles SET tiene_acceso_caja = false;

-- 2) Activar solo para Marco Rossi.
UPDATE public.profiles SET tiene_acceso_caja = true
WHERE nombre ILIKE '%marco%' AND apellido ILIKE '%rossi%';

-- 3) Activar solo para Facundo Castillo.
UPDATE public.profiles SET tiene_acceso_caja = true
WHERE nombre ILIKE '%facundo%' AND apellido ILIKE '%castillo%';

-- 4) can_access_caja: solo el flag, sin bypass por rol.
CREATE OR REPLACE FUNCTION public.can_access_caja()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT tiene_acceso_caja FROM public.profiles WHERE id = auth.uid()
  ), false);
$$;

-- 5) notify_caja_movimiento: misma restricción — solo quienes tienen el flag.
CREATE OR REPLACE FUNCTION public.notify_caja_movimiento()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tipo text := TG_ARGV[0];  -- 'gasto' | 'ingreso'
  v_desc text := COALESCE(NULLIF(btrim(NEW.descripcion), ''), '');
  v_monto text := to_char(NEW.monto, 'FM999999990.00');
  r record;
BEGIN
  FOR r IN
    SELECT id FROM public.profiles
    WHERE tiene_acceso_caja = true
      AND activo = true
      AND id <> NEW.cargado_por
  LOOP
    INSERT INTO public.alertas (tipo, titulo, mensaje, destinatario_id, prioridad, origen)
    VALUES (
      'CUSTOM',
      CASE WHEN v_tipo = 'gasto' THEN 'Nuevo gasto en la caja' ELSE 'Nuevo ingreso en la caja' END,
      v_tipo || ' de $' || v_monto || CASE WHEN v_desc <> '' THEN ' — ' || v_desc ELSE '' END,
      r.id, 'BAJA', 'AUTOMATICA'
    );
  END LOOP;
  RETURN NEW;
END $$;

-- Caja: (1) visible para DIRECTOR además del flag tiene_acceso_caja,
--       (2) Facundo Castillo con acceso,
--       (3) aviso (alerta) a la gente de caja cuando se registra un gasto/ingreso.

-- 1) can_access_caja: DIRECTOR siempre, o quien tenga el flag.
CREATE OR REPLACE FUNCTION public.can_access_caja()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_director() OR COALESCE((
    SELECT tiene_acceso_caja FROM public.profiles WHERE id = auth.uid()
  ), false);
$$;

-- 2) Facundo Castillo ve la caja.
UPDATE public.profiles SET tiene_acceso_caja = true
WHERE nombre ILIKE '%facundo%' AND apellido ILIKE '%castillo%';

-- 3) Aviso al registrar un movimiento (excepto a quien lo cargó).
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
    WHERE (tiene_acceso_caja = true OR rol = 'DIRECTOR')
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

DROP TRIGGER IF EXISTS trg_notify_gasto ON public.gastos;
CREATE TRIGGER trg_notify_gasto
  AFTER INSERT ON public.gastos
  FOR EACH ROW EXECUTE FUNCTION public.notify_caja_movimiento('gasto');

DROP TRIGGER IF EXISTS trg_notify_ingreso ON public.ingresos;
CREATE TRIGGER trg_notify_ingreso
  AFTER INSERT ON public.ingresos
  FOR EACH ROW EXECUTE FUNCTION public.notify_caja_movimiento('ingreso');

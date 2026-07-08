-- Agrega gastos_por_categoria_mes_usd al RPC caja_resumen().
-- El frontend convierte los montos USD a ARS usando la cotización
-- del dólar BNA del día (via MonedAPI) y los suma por categoría.

CREATE OR REPLACE FUNCTION public.caja_resumen()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_y int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  v_m int := EXTRACT(MONTH FROM CURRENT_DATE)::int;
  v_inicio_mes  date := make_date(v_y, v_m, 1);
  v_inicio_anio date := make_date(v_y, 1, 1);
BEGIN
  IF NOT public.can_access_caja() THEN
    RAISE EXCEPTION 'Sin acceso a caja' USING ERRCODE = 'P0403';
  END IF;

  SELECT jsonb_build_object(
    'periodo', jsonb_build_object('year', v_y, 'month', v_m),

    'mes_actual', jsonb_build_object(
      'ingresos_ars', COALESCE((
        SELECT sum(monto) FROM public.ingresos
        WHERE deleted_at IS NULL AND moneda = 'ARS' AND fecha >= v_inicio_mes
      ), 0),
      'ingresos_usd', COALESCE((
        SELECT sum(monto) FROM public.ingresos
        WHERE deleted_at IS NULL AND moneda = 'USD' AND fecha >= v_inicio_mes
      ), 0),
      'gastos_ars', COALESCE((
        SELECT sum(monto) FROM public.gastos
        WHERE deleted_at IS NULL AND moneda = 'ARS' AND fecha >= v_inicio_mes
      ), 0),
      'gastos_usd', COALESCE((
        SELECT sum(monto) FROM public.gastos
        WHERE deleted_at IS NULL AND moneda = 'USD' AND fecha >= v_inicio_mes
      ), 0)
    ),

    'anio_actual', jsonb_build_object(
      'ingresos_ars', COALESCE((
        SELECT sum(monto) FROM public.ingresos
        WHERE deleted_at IS NULL AND moneda = 'ARS' AND fecha >= v_inicio_anio
      ), 0),
      'gastos_ars', COALESCE((
        SELECT sum(monto) FROM public.gastos
        WHERE deleted_at IS NULL AND moneda = 'ARS' AND fecha >= v_inicio_anio
      ), 0)
    ),

    'gastos_por_categoria_mes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('categoria', categoria, 'monto', total) ORDER BY total DESC)
      FROM (
        SELECT categoria, sum(monto)::numeric AS total
        FROM public.gastos
        WHERE deleted_at IS NULL AND moneda = 'ARS' AND fecha >= v_inicio_mes
        GROUP BY categoria
      ) s
    ), '[]'::jsonb),

    -- Montos USD en dólares, sin convertir. El frontend aplica la cotización del día.
    'gastos_por_categoria_mes_usd', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('categoria', categoria, 'monto', total) ORDER BY total DESC)
      FROM (
        SELECT categoria, sum(monto)::numeric AS total
        FROM public.gastos
        WHERE deleted_at IS NULL AND moneda = 'USD' AND fecha >= v_inicio_mes
        GROUP BY categoria
      ) s
    ), '[]'::jsonb),

    'ingresos_por_tipo_mes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('tipo', tipo, 'monto', total) ORDER BY total DESC)
      FROM (
        SELECT tipo, sum(monto)::numeric AS total
        FROM public.ingresos
        WHERE deleted_at IS NULL AND moneda = 'ARS' AND fecha >= v_inicio_mes
        GROUP BY tipo
      ) s
    ), '[]'::jsonb),

    'abonos_activos', (
      SELECT count(*)::int FROM public.clientes_abono_mensual WHERE activo = true
    ),
    'abonos_total_mensual_ars', COALESCE((
      SELECT sum(monto) FROM public.clientes_abono_mensual WHERE activo = true AND moneda = 'ARS'
    ), 0),

    'pagos_pendientes_count', COALESCE((
      SELECT count(*)::int
      FROM public.caja_pagos_pendientes_mes(v_y, v_m)
      WHERE estado IN ('pendiente', 'atrasado')
    ), 0),
    'pagos_atrasados_count', COALESCE((
      SELECT count(*)::int
      FROM public.caja_pagos_pendientes_mes(v_y, v_m)
      WHERE estado = 'atrasado'
    ), 0)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

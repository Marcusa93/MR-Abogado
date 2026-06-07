-- ============================================================
-- Caja por expediente — vista cruzada
--
-- RPC para listar gastos + ingresos de un expediente, con totales
-- por moneda. Acceso restringido vía can_access_caja().
-- ============================================================

CREATE OR REPLACE FUNCTION public.caja_por_expediente(p_expediente_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'P0401';
  END IF;
  IF NOT public.can_access_caja() THEN
    RAISE EXCEPTION 'Sin acceso a caja' USING ERRCODE = 'P0403';
  END IF;
  IF NOT public.can_view_expediente(p_expediente_id) THEN
    RAISE EXCEPTION 'Sin permisos sobre este expediente' USING ERRCODE = 'P0403';
  END IF;

  SELECT jsonb_build_object(
    'totales', jsonb_build_object(
      'gastos_ars', COALESCE((SELECT sum(monto) FROM public.gastos WHERE expediente_id = p_expediente_id AND moneda = 'ARS' AND deleted_at IS NULL), 0),
      'gastos_usd', COALESCE((SELECT sum(monto) FROM public.gastos WHERE expediente_id = p_expediente_id AND moneda = 'USD' AND deleted_at IS NULL), 0),
      'ingresos_ars', COALESCE((SELECT sum(monto) FROM public.ingresos WHERE expediente_id = p_expediente_id AND moneda = 'ARS' AND deleted_at IS NULL), 0),
      'ingresos_usd', COALESCE((SELECT sum(monto) FROM public.ingresos WHERE expediente_id = p_expediente_id AND moneda = 'USD' AND deleted_at IS NULL), 0),
      'recuperable_ars', COALESCE((SELECT sum(monto) FROM public.gastos WHERE expediente_id = p_expediente_id AND moneda = 'ARS' AND deleted_at IS NULL AND recuperable = true AND recuperado_at IS NULL), 0),
      'recuperado_ars', COALESCE((SELECT sum(monto) FROM public.gastos WHERE expediente_id = p_expediente_id AND moneda = 'ARS' AND deleted_at IS NULL AND recuperable = true AND recuperado_at IS NOT NULL), 0)
    ),
    'gastos', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', g.id, 'fecha', g.fecha, 'monto', g.monto, 'moneda', g.moneda,
          'categoria', g.categoria, 'descripcion', g.descripcion,
          'recuperable', g.recuperable, 'recuperado_at', g.recuperado_at
        ) ORDER BY g.fecha DESC, g.created_at DESC
      )
      FROM public.gastos g
      WHERE g.expediente_id = p_expediente_id AND g.deleted_at IS NULL
    ), '[]'::jsonb),
    'ingresos', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', i.id, 'fecha', i.fecha, 'monto', i.monto, 'moneda', i.moneda,
          'tipo', i.tipo, 'descripcion', i.descripcion
        ) ORDER BY i.fecha DESC, i.created_at DESC
      )
      FROM public.ingresos i
      WHERE i.expediente_id = p_expediente_id AND i.deleted_at IS NULL
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.caja_por_expediente(uuid) TO authenticated;

COMMENT ON FUNCTION public.caja_por_expediente IS
  'Devuelve gastos e ingresos asociados a un expediente, con totales por moneda y monto recuperable pendiente. Restringido a usuarios con tiene_acceso_caja.';

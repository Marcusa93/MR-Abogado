-- RPC SECURITY DEFINER para soft-delete de gastos e ingresos.
--
-- El UPDATE directo sobre la tabla fallaba porque PostgREST aplica la
-- política SELECT (USING: can_access_caja() AND deleted_at IS NULL) al
-- RETURNING implícito del PATCH, rechazando la fila recién marcada con
-- deleted_at. Con SECURITY DEFINER el UPDATE corre como el owner (postgres)
-- y evita ese check; la verificación de acceso la hace la función misma.

CREATE OR REPLACE FUNCTION public.soft_delete_gasto(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.can_access_caja() THEN
    RAISE EXCEPTION 'Sin acceso a caja' USING ERRCODE = 'P0403';
  END IF;
  UPDATE public.gastos SET deleted_at = now() WHERE id = p_id AND deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_gasto(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.soft_delete_ingreso(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.can_access_caja() THEN
    RAISE EXCEPTION 'Sin acceso a caja' USING ERRCODE = 'P0403';
  END IF;
  UPDATE public.ingresos SET deleted_at = now() WHERE id = p_id AND deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_ingreso(uuid) TO authenticated;

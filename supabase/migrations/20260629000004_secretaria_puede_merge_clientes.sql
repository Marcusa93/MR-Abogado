-- SECRETARIA puede ejecutar merge_clientes (consolidar placeholders de SAE).
-- Solo cambia el guard de is_director() → is_director() OR SECRETARIA.

CREATE OR REPLACE FUNCTION public.merge_clientes(
  p_from_cliente_id uuid,
  p_to_cliente_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from        public.clientes%ROWTYPE;
  v_to          public.clientes%ROWTYPE;
  v_expedientes int;
  v_adjuntos    int;
  v_contactos   int;
BEGIN
  IF NOT (public.is_director() OR public.current_user_role() = 'SECRETARIA') THEN
    RAISE EXCEPTION 'Solo DIRECTOR o SECRETARIA puede consolidar clientes' USING ERRCODE = '42501';
  END IF;

  IF p_from_cliente_id IS NULL OR p_to_cliente_id IS NULL THEN
    RAISE EXCEPTION 'from_cliente_id y to_cliente_id son requeridos' USING ERRCODE = 'P0001';
  END IF;

  IF p_from_cliente_id = p_to_cliente_id THEN
    RAISE EXCEPTION 'No se puede mergear un cliente consigo mismo' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_from FROM public.clientes WHERE id = p_from_cliente_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente origen % no existe', p_from_cliente_id USING ERRCODE = 'P0002';
  END IF;
  IF v_from.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cliente origen % ya está borrado', p_from_cliente_id USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_to FROM public.clientes WHERE id = p_to_cliente_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente destino % no existe', p_to_cliente_id USING ERRCODE = 'P0002';
  END IF;
  IF v_to.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cliente destino % está borrado', p_to_cliente_id USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.expedientes
     SET cliente_id = p_to_cliente_id, updated_at = now()
   WHERE cliente_id = p_from_cliente_id;
  GET DIAGNOSTICS v_expedientes = ROW_COUNT;

  UPDATE public.adjuntos
     SET cliente_id = p_to_cliente_id
   WHERE cliente_id = p_from_cliente_id;
  GET DIAGNOSTICS v_adjuntos = ROW_COUNT;

  UPDATE public.expediente_contactos
     SET cliente_id = p_to_cliente_id
   WHERE cliente_id = p_from_cliente_id;
  GET DIAGNOSTICS v_contactos = ROW_COUNT;

  IF v_to.apellido = 'Importado SAE'
     AND v_from.apellido <> 'Importado SAE'
     AND v_from.deleted_at IS NULL THEN
    UPDATE public.clientes
       SET apellido   = v_from.apellido,
           nombre     = v_from.nombre,
           dni        = COALESCE(NULLIF(v_to.dni, ''), v_from.dni),
           cuil       = COALESCE(v_to.cuil, v_from.cuil),
           telefono   = COALESCE(v_to.telefono, v_from.telefono),
           email      = COALESCE(v_to.email, v_from.email),
           domicilio  = COALESCE(v_to.domicilio, v_from.domicilio),
           localidad  = COALESCE(v_to.localidad, v_from.localidad),
           provincia  = COALESCE(v_to.provincia, v_from.provincia),
           updated_at = now()
     WHERE id = p_to_cliente_id;
  END IF;

  UPDATE public.clientes
     SET deleted_at = now(),
         notas = COALESCE(notas || E'\n\n', '')
                 || '[Mergeado en ' || p_to_cliente_id::text
                 || ' el ' || to_char(now(), 'YYYY-MM-DD HH24:MI')
                 || ' por ' || COALESCE(auth.uid()::text, 'system') || ']'
   WHERE id = p_from_cliente_id;

  RETURN jsonb_build_object(
    'ok',                 true,
    'from_cliente_id',    p_from_cliente_id,
    'to_cliente_id',      p_to_cliente_id,
    'expedientes_movidos', v_expedientes,
    'adjuntos_movidos',   v_adjuntos,
    'contactos_movidos',  v_contactos
  );
END $$;

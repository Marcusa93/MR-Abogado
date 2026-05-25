-- ============================================================
-- Migración 057: Consolidación de clientes duplicados
--
-- Problema: cuando se importa desde SAE, si no hay cliente_id, la RPC
-- create_expediente_sae crea un cliente "placeholder" (apellido='Importado
-- SAE', DNI generado). Si Rossi Bruno tiene 2 expedientes, aparece 2
-- veces como cliente distinto.
--
-- Esta migración agrega:
--   1. Función merge_clientes(from, to) — consolida un cliente en otro
--      moviendo todos sus expedientes/adjuntos/contactos y soft-deleting
--      el origen. Solo DIRECTOR puede ejecutarla.
--   2. Vista clientes_con_contadores — listado con expedientes_count para
--      mostrar agrupación rica en la UI.
--   3. Función clientes_placeholder_pendientes — devuelve clientes que
--      claramente son placeholders de SAE y necesitan ser consolidados.
-- ============================================================

-- ============================================================
-- 1) Función de merge: from → to
-- ============================================================
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
  IF NOT public.is_director() THEN
    RAISE EXCEPTION 'Solo DIRECTOR puede consolidar clientes' USING ERRCODE = '42501';
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

  -- Mover expedientes
  UPDATE public.expedientes
     SET cliente_id = p_to_cliente_id, updated_at = now()
   WHERE cliente_id = p_from_cliente_id;
  GET DIAGNOSTICS v_expedientes = ROW_COUNT;

  -- Mover adjuntos
  UPDATE public.adjuntos
     SET cliente_id = p_to_cliente_id
   WHERE cliente_id = p_from_cliente_id;
  GET DIAGNOSTICS v_adjuntos = ROW_COUNT;

  -- Mover contactos del cliente
  UPDATE public.expediente_contactos
     SET cliente_id = p_to_cliente_id
   WHERE cliente_id = p_from_cliente_id;
  GET DIAGNOSTICS v_contactos = ROW_COUNT;

  -- Si el destino tenía datos "Importado SAE" y el origen no, hacer un upgrade liviano
  -- (mover datos útiles del origen al destino si el destino estaba más vacío).
  IF v_to.apellido = 'Importado SAE'
     AND v_from.apellido <> 'Importado SAE'
     AND v_from.deleted_at IS NULL THEN
    UPDATE public.clientes
       SET apellido = v_from.apellido,
           nombre   = v_from.nombre,
           dni      = COALESCE(NULLIF(v_to.dni, ''), v_from.dni),
           cuil     = COALESCE(v_to.cuil, v_from.cuil),
           telefono = COALESCE(v_to.telefono, v_from.telefono),
           email    = COALESCE(v_to.email, v_from.email),
           domicilio = COALESCE(v_to.domicilio, v_from.domicilio),
           localidad = COALESCE(v_to.localidad, v_from.localidad),
           provincia = COALESCE(v_to.provincia, v_from.provincia),
           updated_at = now()
     WHERE id = p_to_cliente_id;
  END IF;

  -- Soft-delete del cliente origen
  UPDATE public.clientes
     SET deleted_at = now(),
         notas = COALESCE(notas || E'\n\n', '')
                 || '[Mergeado en ' || p_to_cliente_id::text
                 || ' el ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || ' por ' || COALESCE(auth.uid()::text, 'system') || ']'
   WHERE id = p_from_cliente_id;

  RETURN jsonb_build_object(
    'ok', true,
    'from_cliente_id', p_from_cliente_id,
    'to_cliente_id', p_to_cliente_id,
    'expedientes_movidos', v_expedientes,
    'adjuntos_movidos', v_adjuntos,
    'contactos_movidos', v_contactos
  );
END $$;

COMMENT ON FUNCTION public.merge_clientes IS
  'Consolida un cliente en otro: mueve expedientes/adjuntos/contactos del origen al destino, mejora datos del destino si estaba placeholder, soft-deletea el origen. Solo DIRECTOR.';

GRANT EXECUTE ON FUNCTION public.merge_clientes(uuid, uuid) TO authenticated;

-- ============================================================
-- 2) Vista: clientes con contadores
-- ============================================================
CREATE OR REPLACE VIEW public.clientes_con_contadores AS
SELECT
  c.*,
  COALESCE((
    SELECT count(*)::int
    FROM public.expedientes e
    WHERE e.cliente_id = c.id AND e.deleted_at IS NULL
  ), 0) AS expedientes_count,
  COALESCE((
    SELECT count(*)::int
    FROM public.expedientes e
    WHERE e.cliente_id = c.id
      AND e.deleted_at IS NULL
      AND e.estado_interno NOT IN ('FINALIZADO', 'NO_VIABLE_RECHAZADO', 'PAUSADO')
  ), 0) AS expedientes_activos_count,
  (
    SELECT max(e.updated_at)
    FROM public.expedientes e
    WHERE e.cliente_id = c.id AND e.deleted_at IS NULL
  ) AS ultimo_movimiento_expediente,
  CASE
    WHEN c.apellido = 'Importado SAE' THEN true
    ELSE false
  END AS es_placeholder_sae
FROM public.clientes c
WHERE c.deleted_at IS NULL;

COMMENT ON VIEW public.clientes_con_contadores IS
  'Listado de clientes activos enriquecido con expedientes_count, expedientes_activos_count, ultimo_movimiento_expediente y flag es_placeholder_sae para destacar duplicados de SAE.';

-- ============================================================
-- 3) Función: clientes_placeholder_pendientes
--    Devuelve clientes claramente "placeholder" para que la UI muestre
--    sugerencias de merge.
-- ============================================================
CREATE OR REPLACE FUNCTION public.clientes_placeholder_pendientes()
RETURNS TABLE (
  id                uuid,
  apellido          text,
  nombre            text,
  dni               text,
  expedientes_count int,
  caratulas         text[],
  created_at        timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.apellido,
    c.nombre,
    c.dni::text,
    COALESCE((SELECT count(*)::int FROM public.expedientes e WHERE e.cliente_id = c.id AND e.deleted_at IS NULL), 0) AS expedientes_count,
    (
      SELECT array_agg(e.caratula ORDER BY e.created_at DESC)
      FROM public.expedientes e
      WHERE e.cliente_id = c.id AND e.deleted_at IS NULL
    ) AS caratulas,
    c.created_at
  FROM public.clientes c
  WHERE c.deleted_at IS NULL
    AND c.apellido = 'Importado SAE'
  ORDER BY c.created_at DESC
$$;

COMMENT ON FUNCTION public.clientes_placeholder_pendientes IS
  'Lista de clientes con apellido placeholder de SAE pendientes de consolidación. Devuelve las carátulas para que el usuario los identifique visualmente.';

GRANT EXECUTE ON FUNCTION public.clientes_placeholder_pendientes() TO authenticated;

-- ============================================================
-- 4) Función: buscar_clientes_por_termino
--    Para el autocomplete del nuevo/editar expediente.
--    Devuelve clientes con su cantidad de expedientes para que el usuario
--    vea de inmediato si ya existe.
-- ============================================================
CREATE OR REPLACE FUNCTION public.buscar_clientes_por_termino(
  p_termino text,
  p_limit   int DEFAULT 20
)
RETURNS TABLE (
  id                uuid,
  apellido          text,
  nombre            text,
  dni               text,
  cuil              text,
  expedientes_count int,
  es_placeholder    boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.apellido,
    c.nombre,
    c.dni::text,
    c.cuil::text,
    COALESCE((SELECT count(*)::int FROM public.expedientes e WHERE e.cliente_id = c.id AND e.deleted_at IS NULL), 0) AS expedientes_count,
    (c.apellido = 'Importado SAE') AS es_placeholder
  FROM public.clientes c
  WHERE c.deleted_at IS NULL
    AND (
      p_termino IS NULL
      OR p_termino = ''
      OR c.apellido ILIKE '%' || p_termino || '%'
      OR c.nombre ILIKE '%' || p_termino || '%'
      OR c.dni ILIKE '%' || p_termino || '%'
      OR c.cuil ILIKE '%' || p_termino || '%'
    )
  ORDER BY
    -- Match exacto al inicio del apellido pesa más
    CASE WHEN c.apellido ILIKE p_termino || '%' THEN 0 ELSE 1 END,
    c.apellido,
    c.nombre
  LIMIT GREATEST(p_limit, 1)
$$;

COMMENT ON FUNCTION public.buscar_clientes_por_termino IS
  'Autocomplete de clientes para selects de expediente. Devuelve expedientes_count para que el usuario vea cuántos casos tiene el cliente antes de elegirlo.';

GRANT EXECUTE ON FUNCTION public.buscar_clientes_por_termino(text, int) TO authenticated;

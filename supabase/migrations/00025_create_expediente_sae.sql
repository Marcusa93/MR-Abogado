-- ============================================================
-- Migración 025: Alta mínima de expedientes importados desde SAE
-- Repara el flujo de importación que esperaba la RPC create_expediente_sae.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_expediente_sae(
  p_numero_sae text,
  p_caratula text,
  p_cliente_id uuid DEFAULT NULL,
  p_tipo_tramite_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_numero_sae text := nullif(btrim(p_numero_sae), '');
  v_caratula text := nullif(btrim(p_caratula), '');
  v_cliente_id uuid := p_cliente_id;
  v_tipo_tramite_id uuid := p_tipo_tramite_id;
  v_placeholder_dni text;
  v_created jsonb;
  v_expediente public.expedientes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'P0401';
  END IF;

  IF v_numero_sae IS NULL OR v_caratula IS NULL THEN
    RAISE EXCEPTION 'numero_sae y caratula son requeridos' USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_expediente
  FROM public.expedientes
  WHERE numero_sae = v_numero_sae
    AND deleted_at IS NULL
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.expedientes
    SET caratula = v_caratula,
        updated_at = now()
    WHERE id = v_expediente.id
    RETURNING * INTO v_expediente;

    RETURN to_jsonb(v_expediente);
  END IF;

  IF v_tipo_tramite_id IS NULL THEN
    SELECT id
    INTO v_tipo_tramite_id
    FROM public.tipos_tramite
    WHERE activo = true
      AND codigo = 'otro'
    ORDER BY orden ASC, nombre ASC
    LIMIT 1;

    IF v_tipo_tramite_id IS NULL THEN
      SELECT id
      INTO v_tipo_tramite_id
      FROM public.tipos_tramite
      WHERE activo = true
      ORDER BY orden ASC, nombre ASC
      LIMIT 1;
    END IF;
  END IF;

  IF v_tipo_tramite_id IS NULL THEN
    RAISE EXCEPTION 'No hay tipos de trámite activos para importar expedientes SAE' USING ERRCODE = 'P0001';
  END IF;

  IF v_cliente_id IS NULL THEN
    v_placeholder_dni := regexp_replace(v_numero_sae, '\D', '', 'g');

    IF v_placeholder_dni IS NULL OR v_placeholder_dni = '' THEN
      v_placeholder_dni := lpad(abs(hashtext('sae:' || v_numero_sae))::text, 8, '9');
    END IF;

    IF length(v_placeholder_dni) < 8 THEN
      v_placeholder_dni := lpad(v_placeholder_dni, 8, '9');
    ELSIF length(v_placeholder_dni) > 15 THEN
      v_placeholder_dni := left(v_placeholder_dni, 15);
    END IF;

    SELECT id
    INTO v_cliente_id
    FROM public.clientes
    WHERE dni = v_placeholder_dni
      AND deleted_at IS NULL
    LIMIT 1;

    IF v_cliente_id IS NULL THEN
      INSERT INTO public.clientes (
        apellido,
        nombre,
        dni,
        notas,
        origen,
        created_by
      )
      VALUES (
        'Importado SAE',
        left(v_numero_sae, 200),
        v_placeholder_dni,
        left(
          'Cliente placeholder generado automáticamente para expediente importado desde SAE. Carátula original: ' || v_caratula,
          1000
        ),
        'otro',
        auth.uid()
      )
      RETURNING id INTO v_cliente_id;
    END IF;
  END IF;

  SELECT public.create_expediente(
    p_cliente_id => v_cliente_id,
    p_tipo_tramite_id => v_tipo_tramite_id,
    p_prioridad => 'MEDIA',
    p_es_propio => true,
    p_observaciones => 'Importado automáticamente desde SAE.'
  )
  INTO v_created;

  SELECT *
  INTO v_expediente
  FROM public.expedientes
  WHERE id = (v_created->>'id')::uuid;

  UPDATE public.expedientes
  SET numero_sae = v_numero_sae,
      caratula = v_caratula,
      updated_at = now()
  WHERE id = v_expediente.id
  RETURNING * INTO v_expediente;

  RETURN to_jsonb(v_expediente);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_expediente_sae(text, text, uuid, uuid) TO authenticated;

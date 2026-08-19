-- Bug: el formulario no envía tipo_tramite_id (campo no existe en la UI).
-- El RPC recibía NULL y lo insertaba en una columna NOT NULL → constraint error.
-- Fix: p_tipo_tramite_id acepta NULL y usa "Otro" como fallback silencioso.
CREATE OR REPLACE FUNCTION public.create_expediente(
  p_cliente_id uuid,
  p_tipo_tramite_id uuid DEFAULT NULL,
  p_organismo_id uuid DEFAULT NULL,
  p_fuero text DEFAULT NULL,
  p_prioridad text DEFAULT 'MEDIA',
  p_es_propio boolean DEFAULT true,
  p_observaciones text DEFAULT NULL,
  p_miembros jsonb DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_numero text;
  v_id uuid;
  v_year text := to_char(CURRENT_DATE, 'YYYY');
  v_seq int;
  v_miembro jsonb;
BEGIN
  -- Fallback: si no se eligió tipo de trámite, usar "Otro"
  IF p_tipo_tramite_id IS NULL THEN
    SELECT id INTO p_tipo_tramite_id
    FROM public.tipos_tramite
    WHERE nombre ILIKE 'otro'
    LIMIT 1;
  END IF;

  -- Advisory lock para serializar generación de números por año
  PERFORM pg_advisory_xact_lock(hashtext('create_expediente_' || v_year));

  SELECT coalesce(max(
    substring(numero from 'EXP-' || v_year || '-(\d+)')::int
  ), 0) + 1
  INTO v_seq
  FROM public.expedientes
  WHERE numero LIKE 'EXP-' || v_year || '-%';

  v_numero := 'EXP-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  INSERT INTO public.expedientes (
    numero, cliente_id, tipo_tramite_id, organismo_id, fuero,
    estado_interno, prioridad, es_propio, observaciones, created_by
  ) VALUES (
    v_numero, p_cliente_id, p_tipo_tramite_id, p_organismo_id, p_fuero,
    'NUEVA_CONSULTA', p_prioridad, p_es_propio, p_observaciones, auth.uid()
  ) RETURNING id INTO v_id;

  INSERT INTO public.historial_estados_expediente (
    expediente_id, estado_nuevo, motivo, changed_by
  ) VALUES (
    v_id, 'NUEVA_CONSULTA', 'Creación del expediente', auth.uid()
  );

  IF p_miembros IS NOT NULL THEN
    FOR v_miembro IN SELECT * FROM jsonb_array_elements(p_miembros)
    LOOP
      INSERT INTO public.expediente_miembros (expediente_id, profile_id, rol)
      VALUES (
        v_id,
        (v_miembro->>'profile_id')::uuid,
        COALESCE(v_miembro->>'rol', 'colaborador')
      )
      ON CONFLICT (expediente_id, profile_id) DO NOTHING;
    END LOOP;
  END IF;

  INSERT INTO public.audit_log (tabla, registro_id, accion, datos_nuevos, user_id)
  VALUES ('expedientes', v_id, 'INSERT',
    jsonb_build_object('numero', v_numero, 'tipo_tramite_id', p_tipo_tramite_id, 'cliente_id', p_cliente_id),
    auth.uid()
  );

  RETURN (SELECT row_to_json(e)::jsonb FROM public.expedientes e WHERE e.id = v_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
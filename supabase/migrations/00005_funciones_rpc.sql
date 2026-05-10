-- ============================================================
-- Marco Rossi Estudio Jurídico - Migración 005: Funciones RPC
-- ============================================================

-- ============================================================
-- RPC: create_expediente (número auto-generado + auditoría)
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_expediente(
  p_cliente_id uuid,
  p_tipo_tramite_id uuid,
  p_organismo_id uuid DEFAULT NULL,
  p_fuero text DEFAULT NULL,
  p_prioridad text DEFAULT 'MEDIA',
  p_es_propio boolean DEFAULT true,
  p_observaciones text DEFAULT NULL,
  p_miembros jsonb DEFAULT NULL  -- array of {profile_id, rol}
)
RETURNS jsonb AS $$
DECLARE
  v_numero text;
  v_id uuid;
  v_year text := to_char(CURRENT_DATE, 'YYYY');
  v_seq int;
  v_miembro jsonb;
BEGIN
  -- Advisory lock para serializar generación de números por año
  PERFORM pg_advisory_xact_lock(hashtext('create_expediente_' || v_year));

  -- Generar número secuencial por año (protegido por el lock)
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

  -- Historial inicial
  INSERT INTO public.historial_estados_expediente (
    expediente_id, estado_nuevo, motivo, changed_by
  ) VALUES (
    v_id, 'NUEVA_CONSULTA', 'Creación del expediente', auth.uid()
  );

  -- Insertar miembros si se proveen
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

  -- Auditoría
  INSERT INTO public.audit_log (tabla, registro_id, accion, datos_nuevos, user_id)
  VALUES ('expedientes', v_id, 'INSERT',
    jsonb_build_object('numero', v_numero, 'tipo_tramite_id', p_tipo_tramite_id, 'cliente_id', p_cliente_id),
    auth.uid()
  );

  RETURN (SELECT row_to_json(e)::jsonb FROM public.expedientes e WHERE e.id = v_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- RPC: cambiar_estado_expediente (máquina de estados + side effects)
-- ============================================================
CREATE OR REPLACE FUNCTION public.cambiar_estado_expediente(
  p_expediente_id uuid,
  p_nuevo_estado text,
  p_motivo text,
  p_observacion text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_exp record;
  v_historial_id uuid;
  v_responsable uuid;
  v_valid_transitions jsonb := '{
    "NUEVA_CONSULTA":    ["PARA_INICIAR", "NO_VIABLE_RECHAZADO", "PAUSADO"],
    "PARA_INICIAR":      ["INICIADO", "NO_VIABLE_RECHAZADO", "PAUSADO"],
    "INICIADO":          ["PRUEBA", "ALEGATOS", "SENTENCIA", "NO_VIABLE_RECHAZADO", "PAUSADO"],
    "PRUEBA":            ["ALEGATOS", "SENTENCIA", "NO_VIABLE_RECHAZADO", "PAUSADO"],
    "ALEGATOS":          ["SENTENCIA", "NO_VIABLE_RECHAZADO", "PAUSADO"],
    "SENTENCIA":         ["APELACION", "CORTE", "FINALIZADO", "NO_VIABLE_RECHAZADO", "PAUSADO"],
    "APELACION":         ["CORTE", "FINALIZADO", "NO_VIABLE_RECHAZADO", "PAUSADO"],
    "CORTE":             ["FINALIZADO", "NO_VIABLE_RECHAZADO", "PAUSADO"],
    "FINALIZADO":        [],
    "NO_VIABLE_RECHAZADO": [],
    "PAUSADO":           ["NUEVA_CONSULTA", "PARA_INICIAR", "INICIADO", "PRUEBA", "ALEGATOS", "SENTENCIA", "APELACION", "CORTE"]
  }'::jsonb;
BEGIN
  -- Obtener expediente actual
  SELECT * INTO v_exp FROM public.expedientes
  WHERE id = p_expediente_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expediente no encontrado' USING ERRCODE = 'P0404';
  END IF;

  -- Validar transición
  IF v_valid_transitions->v_exp.estado_interno IS NULL
    OR NOT (v_valid_transitions->v_exp.estado_interno) @> to_jsonb(p_nuevo_estado)
  THEN
    RAISE EXCEPTION 'Transición inválida de % a %', v_exp.estado_interno, p_nuevo_estado
      USING ERRCODE = 'P0422';
  END IF;

  -- Set trusted audit skip token
  PERFORM set_config('app.skip_audit_trigger', public._audit_skip_token(), true);

  -- Manejar pausa: guardar estado previo
  IF p_nuevo_estado = 'PAUSADO' THEN
    UPDATE public.expedientes
    SET estado_interno = p_nuevo_estado,
        estado_previo_pausa = v_exp.estado_interno,
        updated_at = now()
    WHERE id = p_expediente_id;
  -- Manejar reactivación desde pausa: usar el estado solicitado por el caller
  ELSIF v_exp.estado_interno = 'PAUSADO' THEN
    UPDATE public.expedientes
    SET estado_interno = p_nuevo_estado,
        estado_previo_pausa = NULL,
        updated_at = now()
    WHERE id = p_expediente_id;
  ELSE
    UPDATE public.expedientes
    SET estado_interno = p_nuevo_estado,
        updated_at = now(),
        fecha_cierre = CASE
          WHEN p_nuevo_estado IN ('FINALIZADO', 'NO_VIABLE_RECHAZADO') THEN CURRENT_DATE
          ELSE fecha_cierre
        END
    WHERE id = p_expediente_id;
  END IF;

  -- Historial
  INSERT INTO public.historial_estados_expediente (
    expediente_id, estado_anterior, estado_nuevo, motivo, observacion, changed_by
  ) VALUES (
    p_expediente_id, v_exp.estado_interno, p_nuevo_estado,
    p_motivo, p_observacion, auth.uid()
  ) RETURNING id INTO v_historial_id;

  -- Auditoría (manual — el trigger se saltea por el token)
  INSERT INTO public.audit_log (tabla, registro_id, accion, datos_anteriores, datos_nuevos, user_id)
  VALUES ('expedientes', p_expediente_id, 'STATE_CHANGE',
    jsonb_build_object('estado_interno', v_exp.estado_interno),
    jsonb_build_object('estado_interno', p_nuevo_estado, 'motivo', p_motivo),
    auth.uid()
  );

  -- Side effects según nuevo estado
  -- Obtener primer miembro abogado para asignar tareas
  SELECT profile_id INTO v_responsable
  FROM public.expediente_miembros
  WHERE expediente_id = p_expediente_id AND rol = 'abogado' AND activo = true
  LIMIT 1;

  IF p_nuevo_estado = 'INICIADO' THEN
    INSERT INTO public.tareas (
      expediente_id, titulo, descripcion, asignado_a,
      fecha_vencimiento, prioridad, created_by
    ) VALUES (
      p_expediente_id,
      'Primer control de estado',
      'Verificar estado del expediente ante el organismo',
      COALESCE(v_responsable, auth.uid()),
      CURRENT_DATE + interval '7 days',
      'MEDIA',
      auth.uid()
    );
    INSERT INTO public.alertas (
      expediente_id, tipo, titulo, mensaje,
      destinatario_id, fecha_vencimiento, prioridad
    ) VALUES (
      p_expediente_id, 'SEGUIMIENTO_PENDIENTE',
      'Seguimiento requerido: ' || v_exp.numero,
      'El expediente fue iniciado. Programar primer control de estado.',
      v_responsable,
      CURRENT_DATE + interval '7 days',
      'MEDIA'
    );
  END IF;

  IF p_nuevo_estado IN ('SENTENCIA', 'FINALIZADO') THEN
    INSERT INTO public.alertas (
      expediente_id, tipo, titulo, mensaje,
      destinatario_id, prioridad
    ) VALUES (
      p_expediente_id, 'ESTADO_CAMBIO',
      'Estado actualizado: ' || v_exp.numero,
      'El expediente pasó a estado "' || p_nuevo_estado || '". Notificar al cliente.',
      v_responsable,
      'ALTA'
    );
  END IF;

  RETURN jsonb_build_object(
    'id', p_expediente_id,
    'estado_anterior', v_exp.estado_interno,
    'estado_nuevo', p_nuevo_estado,
    'historial_id', v_historial_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- RPC: add_expediente_miembro
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_expediente_miembro(
  p_expediente_id uuid,
  p_profile_id uuid,
  p_rol text DEFAULT 'colaborador',
  p_motivo text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_profile_rol text;
BEGIN
  -- Validar que el perfil exista y esté activo
  SELECT rol INTO v_profile_rol FROM public.profiles WHERE id = p_profile_id AND activo = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil no encontrado o inactivo' USING ERRCODE = 'P0404';
  END IF;

  -- Validar que el expediente exista
  IF NOT EXISTS (SELECT 1 FROM public.expedientes WHERE id = p_expediente_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Expediente no encontrado' USING ERRCODE = 'P0404';
  END IF;

  INSERT INTO public.expediente_miembros (expediente_id, profile_id, rol)
  VALUES (p_expediente_id, p_profile_id, p_rol)
  ON CONFLICT (expediente_id, profile_id)
  DO UPDATE SET rol = EXCLUDED.rol, activo = true;

  -- Historial
  INSERT INTO public.historial_estados_expediente (
    expediente_id, estado_anterior, estado_nuevo, motivo, changed_by
  ) VALUES (
    p_expediente_id,
    'miembro:removed',
    'miembro:' || p_profile_id::text || ':' || p_rol,
    COALESCE(p_motivo, 'Miembro agregado al expediente'),
    auth.uid()
  );

  -- Auditoría
  INSERT INTO public.audit_log (tabla, registro_id, accion, datos_nuevos, user_id)
  VALUES ('expediente_miembros', p_expediente_id, 'INSERT',
    jsonb_build_object('profile_id', p_profile_id, 'rol', p_rol),
    auth.uid()
  );

  RETURN jsonb_build_object('success', true, 'profile_id', p_profile_id, 'rol', p_rol);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- RPC: remove_expediente_miembro
-- ============================================================
CREATE OR REPLACE FUNCTION public.remove_expediente_miembro(
  p_expediente_id uuid,
  p_profile_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb AS $$
BEGIN
  UPDATE public.expediente_miembros
  SET activo = false
  WHERE expediente_id = p_expediente_id AND profile_id = p_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Miembro no encontrado en el expediente' USING ERRCODE = 'P0404';
  END IF;

  -- Historial
  INSERT INTO public.historial_estados_expediente (
    expediente_id, estado_anterior, estado_nuevo, motivo, changed_by
  ) VALUES (
    p_expediente_id,
    'miembro:' || p_profile_id::text,
    'miembro:removed',
    COALESCE(p_motivo, 'Miembro removido del expediente'),
    auth.uid()
  );

  RETURN jsonb_build_object('success', true, 'profile_id', p_profile_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- RPC: sync_sae (actualiza campos SAE — fire-and-forget)
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_sae(
  p_expediente_id uuid,
  p_numero_sae text,
  p_estado_sae text DEFAULT NULL
)
RETURNS jsonb AS $$
BEGIN
  UPDATE public.expedientes
  SET numero_sae = p_numero_sae,
      estado_sae = p_estado_sae,
      ultima_sincronizacion_sae = now(),
      updated_at = now()
  WHERE id = p_expediente_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expediente no encontrado' USING ERRCODE = 'P0404';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'expediente_id', p_expediente_id,
    'numero_sae', p_numero_sae,
    'sincronizado_at', now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- RPC: resolver_alerta
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolver_alerta(
  p_alerta_id uuid,
  p_observacion text DEFAULT NULL
)
RETURNS jsonb AS $$
BEGIN
  UPDATE public.alertas
  SET estado = 'RESUELTA',
      resuelta_at = now(),
      resuelta_por = auth.uid()
  WHERE id = p_alerta_id
    AND (destinatario_id = auth.uid() OR public.is_admin());

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- RPC: posponer_alerta
-- ============================================================
CREATE OR REPLACE FUNCTION public.posponer_alerta(
  p_alerta_id uuid,
  p_hasta date
)
RETURNS jsonb AS $$
BEGIN
  UPDATE public.alertas
  SET estado = 'POSPUESTA',
      pospuesta_hasta = p_hasta
  WHERE id = p_alerta_id
    AND (destinatario_id = auth.uid() OR public.is_admin());

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- RPC: soft_delete_cliente (admin only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.soft_delete_cliente(p_cliente_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_active_count int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo admin puede eliminar clientes' USING ERRCODE = 'P0403';
  END IF;

  SELECT count(*) INTO v_active_count
  FROM public.expedientes
  WHERE cliente_id = p_cliente_id
    AND deleted_at IS NULL
    AND estado_interno NOT IN ('FINALIZADO', 'NO_VIABLE_RECHAZADO');

  IF v_active_count > 0 THEN
    RAISE EXCEPTION 'El cliente tiene % expedientes activos', v_active_count USING ERRCODE = 'P0409';
  END IF;

  UPDATE public.clientes SET deleted_at = now(), updated_at = now()
  WHERE id = p_cliente_id AND deleted_at IS NULL;

  INSERT INTO public.audit_log (tabla, registro_id, accion, datos_nuevos, user_id)
  VALUES ('clientes', p_cliente_id, 'DELETE', '{"soft_delete": true}'::jsonb, auth.uid());

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- RPC: get_dashboard_metrics
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(
  p_fecha_desde date DEFAULT (CURRENT_DATE - interval '30 days')::date,
  p_fecha_hasta date DEFAULT CURRENT_DATE
)
RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_expedientes', (SELECT count(*) FROM public.expedientes WHERE deleted_at IS NULL),
    'por_estado', (
      SELECT jsonb_object_agg(estado_interno, cnt)
      FROM (SELECT estado_interno, count(*) AS cnt FROM public.expedientes WHERE deleted_at IS NULL GROUP BY estado_interno) s
    ),
    'por_tipo', (
      SELECT jsonb_object_agg(tt.nombre, cnt)
      FROM (
        SELECT tipo_tramite_id, count(*) AS cnt
        FROM public.expedientes WHERE deleted_at IS NULL GROUP BY tipo_tramite_id
      ) s JOIN public.tipos_tramite tt ON tt.id = s.tipo_tramite_id
    ),
    'abiertos_periodo', (
      SELECT count(*) FROM public.expedientes
      WHERE fecha_alta BETWEEN p_fecha_desde AND p_fecha_hasta AND deleted_at IS NULL
    ),
    'cerrados_periodo', (
      SELECT count(*) FROM public.expedientes
      WHERE fecha_cierre BETWEEN p_fecha_desde AND p_fecha_hasta AND deleted_at IS NULL
    ),
    'tasa_exito', (
      SELECT CASE WHEN total > 0 THEN round(favorables::numeric / total, 2) ELSE 0 END
      FROM (
        SELECT
          count(*) FILTER (WHERE estado_interno = 'FINALIZADO') AS favorables,
          count(*) FILTER (WHERE estado_interno IN ('FINALIZADO', 'NO_VIABLE_RECHAZADO')) AS total
        FROM public.expedientes WHERE deleted_at IS NULL
      ) s
    ),
    'audiencias_proxima_semana', (
      SELECT count(*) FROM public.audiencias
      WHERE fecha BETWEEN CURRENT_DATE AND CURRENT_DATE + interval '7 days'
        AND estado IN ('PENDIENTE', 'CONFIRMADA')
    ),
    'tareas_vencidas', (
      SELECT count(*) FROM public.tareas
      WHERE estado IN ('PENDIENTE', 'EN_PROGRESO')
        AND fecha_vencimiento < CURRENT_DATE
    ),
    'alertas_activas', (
      SELECT count(*) FROM public.alertas WHERE estado = 'ACTIVA'
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY INVOKER;

-- ============================================================
-- RPC: bulk_insert_seguimientos (carga rápida)
-- ============================================================
CREATE OR REPLACE FUNCTION public.bulk_insert_seguimientos(
  p_seguimientos jsonb
)
RETURNS jsonb AS $$
DECLARE
  v_item jsonb;
  v_count int := 0;
  v_exp_id uuid;
  v_caller_id uuid := auth.uid();
BEGIN
  -- Validar que el usuario esté autenticado
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Debe estar autenticado para insertar seguimientos'
      USING ERRCODE = 'P0401';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_seguimientos)
  LOOP
    v_exp_id := (v_item->>'expediente_id')::uuid;

    -- Validar acceso al expediente
    IF NOT EXISTS (
      SELECT 1 FROM public.expedientes
      WHERE id = v_exp_id AND deleted_at IS NULL
        AND (
          public.is_admin()
          OR created_by = v_caller_id
          OR EXISTS (
            SELECT 1 FROM public.expediente_miembros
            WHERE expediente_id = v_exp_id AND profile_id = v_caller_id AND activo = true
          )
        )
    ) THEN
      RAISE EXCEPTION 'Sin acceso al expediente %', v_exp_id
        USING ERRCODE = 'P0403';
    END IF;

    INSERT INTO public.seguimientos (
      expediente_id, fecha_control, estado_organismo_reportado,
      canal, observacion, proxima_fecha_control,
      requiere_accion, accion_requerida, created_by
    ) VALUES (
      v_exp_id,
      COALESCE((v_item->>'fecha_control')::date, CURRENT_DATE),
      v_item->>'estado_organismo_reportado',
      COALESCE(v_item->>'canal', 'web'),
      v_item->>'observacion',
      (v_item->>'proxima_fecha_control')::date,
      COALESCE((v_item->>'requiere_accion')::boolean, false),
      v_item->>'accion_requerida',
      v_caller_id
    );

    -- Actualizar estado_organismo en el expediente
    UPDATE public.expedientes
    SET estado_organismo = v_item->>'estado_organismo_reportado',
        updated_at = now()
    WHERE id = v_exp_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('inserted', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- RPC: log_login — registra inicio de sesión en audit_log
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_login()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log (tabla, registro_id, accion, datos_nuevos, user_id)
  VALUES (
    'auth',
    auth.uid(),
    'LOGIN',
    jsonb_build_object('timestamp', now(), 'method', 'password'),
    auth.uid()
  );
END;
$$;

-- Solo usuarios autenticados pueden llamar a log_login
REVOKE ALL ON FUNCTION public.log_login() FROM public;
GRANT EXECUTE ON FUNCTION public.log_login() TO authenticated;

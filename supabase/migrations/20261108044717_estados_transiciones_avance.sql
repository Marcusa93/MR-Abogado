-- Alinea las transiciones de estado con el tablero: se puede avanzar salteando etapas.
CREATE OR REPLACE FUNCTION public.cambiar_estado_expediente(p_expediente_id uuid, p_nuevo_estado text, p_motivo text, p_observacion text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exp record;
  v_historial_id uuid;
  v_responsable uuid;
  -- Orden del proceso: se puede avanzar saltando etapas (los estados suelen estar atrasados).
  v_orden text[] := ARRAY['NUEVA_CONSULTA','PARA_INICIAR','INICIADO','PRUEBA','ALEGATOS','SENTENCIA','APELACION','CORTE','FINALIZADO'];
  v_desde int;
  v_hacia int;
  v_ok boolean;
BEGIN
  -- Obtener expediente actual
  SELECT * INTO v_exp FROM public.expedientes
  WHERE id = p_expediente_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expediente no encontrado' USING ERRCODE = 'P0404';
  END IF;

  IF p_nuevo_estado = v_exp.estado_interno THEN
    RAISE EXCEPTION 'El expediente ya está en ese estado' USING ERRCODE = 'P0422';
  END IF;

  v_desde := array_position(v_orden, v_exp.estado_interno);
  v_hacia := array_position(v_orden, p_nuevo_estado);

  v_ok := CASE
    -- Cerrados o pausados: se pueden reabrir en cualquier etapa.
    WHEN v_exp.estado_interno IN ('FINALIZADO','NO_VIABLE_RECHAZADO','PAUSADO') THEN v_hacia IS NOT NULL OR p_nuevo_estado = 'NO_VIABLE_RECHAZADO'
    -- Desde cualquier etapa abierta: rechazar o pausar.
    WHEN p_nuevo_estado IN ('NO_VIABLE_RECHAZADO','PAUSADO') THEN true
    -- Volver de la apelación o la Corte a la sentencia (reenvío).
    WHEN v_exp.estado_interno IN ('APELACION','CORTE') AND p_nuevo_estado = 'SENTENCIA' THEN true
    -- Avanzar, aunque sea salteando etapas.
    ELSE v_desde IS NOT NULL AND v_hacia IS NOT NULL AND v_hacia > v_desde
  END;

  IF NOT COALESCE(v_ok, false) THEN
    RAISE EXCEPTION 'No se puede pasar de % a %', v_exp.estado_interno, p_nuevo_estado
      USING ERRCODE = 'P0422';
  END IF;

  -- Set trusted audit skip token
  PERFORM set_config('app.skip_audit_trigger', public._audit_skip_token(), true);

  -- Handle pause: save previous state
  IF p_nuevo_estado = 'PAUSADO' THEN
    UPDATE public.expedientes
    SET estado_interno = p_nuevo_estado,
        estado_previo_pausa = v_exp.estado_interno,
        updated_at = now()
    WHERE id = p_expediente_id;
  -- Handle resume from pause: use the CALLER's requested state (p_nuevo_estado)
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

  -- Audit (manual — trigger skips via trusted token)
  INSERT INTO public.audit_log (tabla, registro_id, accion, datos_anteriores, datos_nuevos, user_id)
  VALUES ('expedientes', p_expediente_id, 'STATE_CHANGE',
    jsonb_build_object('estado_interno', v_exp.estado_interno),
    jsonb_build_object('estado_interno', p_nuevo_estado, 'motivo', p_motivo),
    auth.uid()
  );

  -- Side effects
  SELECT profile_id INTO v_responsable
  FROM public.expediente_miembros
  WHERE expediente_id = p_expediente_id AND rol = 'abogado' AND activo = true
  LIMIT 1;

  -- La tarea de primer control solo tiene sentido si todavía no hay movimientos del SAE.
  IF p_nuevo_estado = 'INICIADO'
     AND NOT EXISTS (SELECT 1 FROM public.sae_movements m WHERE m.expediente_id = p_expediente_id) THEN
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
  ELSIF p_nuevo_estado IN ('SENTENCIA', 'FINALIZADO') THEN
    INSERT INTO public.tareas (
      expediente_id, titulo, asignado_a, prioridad, created_by
    ) VALUES (
      p_expediente_id,
      'Notificar al cliente sobre resolución',
      COALESCE(v_responsable, auth.uid()),
      'ALTA',
      auth.uid()
    );
  END IF;

  RETURN jsonb_build_object(
    'id', p_expediente_id,
    'estado_anterior', v_exp.estado_interno,
    'estado_nuevo', p_nuevo_estado,
    'historial_id', v_historial_id
  );
END;
$function$;

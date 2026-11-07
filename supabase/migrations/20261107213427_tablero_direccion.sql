-- Tablero de dirección: todo lo que el director necesita ver en una sola consulta.
-- Lo usan la pantalla /direccion y el resumen de los lunes por Telegram.
-- Solo DIRECTOR / ADMIN (o service role). La parte de plata, además, exige acceso a caja.

CREATE OR REPLACE FUNCTION public.tablero_direccion()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_servicio boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role'
                        OR (auth.uid() IS NULL AND current_user IN ('postgres', 'service_role'));
  v_rol text;
  v_caja boolean;
  v_hoy date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_en_tramite text[] := ARRAY['PARA_INICIAR','INICIADO','PRUEBA','ALEGATOS','SENTENCIA','APELACION','CORTE','PAUSADO'];
  v_atencion jsonb;
  v_equipo jsonb;
  v_numeros jsonb;
  v_plata jsonb := NULL;
  v_datos jsonb;
BEGIN
  IF NOT v_servicio THEN
    SELECT rol, coalesce(tiene_acceso_caja, false) INTO v_rol, v_caja FROM profiles WHERE id = auth.uid() AND activo;
    IF v_rol IS NULL OR v_rol NOT IN ('DIRECTOR', 'ADMIN') THEN
      RAISE EXCEPTION 'Solo dirección' USING ERRCODE = 'P0403';
    END IF;
  ELSE
    v_caja := true;
  END IF;

  -- ── Lo que requiere atención ─────────────────────────────────────────────
  WITH
  aud AS (
    SELECT a.id, a.fecha, a.hora, a.expediente_id, coalesce(e.caratula, e.numero, 'Expediente sin carátula') AS caratula,
           coalesce(ta.nombre, 'Audiencia') AS tipo
    FROM audiencias a
    LEFT JOIN expedientes e ON e.id = a.expediente_id
    LEFT JOIN catalogo_tipos_audiencia ta ON ta.id = a.tipo_audiencia_id
    WHERE a.fecha BETWEEN v_hoy AND v_hoy + 15
      AND coalesce(a.estado, '') <> 'CANCELADA'
      AND a.profesional_asistente_id IS NULL
  ),
  plazos AS (
    SELECT t.id, t.titulo, t.fecha_vencimiento, t.expediente_id, e.caratula
    FROM tareas t LEFT JOIN expedientes e ON e.id = t.expediente_id
    WHERE t.es_plazo_judicial AND t.estado IN ('PENDIENTE', 'EN_PROGRESO') AND t.fecha_vencimiento < v_hoy
  ),
  quietos AS (
    SELECT e.id, coalesce(e.caratula, e.numero, 'Expediente sin carátula') AS caratula,
           v_hoy - max(m.fecha) AS dias, e.abogado_responsable_id
    FROM expedientes e
    JOIN sae_movements m ON m.expediente_id = e.id
    WHERE e.deleted_at IS NULL AND e.estado_interno = ANY (v_en_tramite) AND e.estado_interno <> 'PARA_INICIAR'
    GROUP BY e.id
    HAVING v_hoy - max(m.fecha) >= 60
  ),
  para_iniciar AS (
    SELECT e.id, coalesce(e.caratula, e.numero, 'Expediente sin carátula') AS caratula,
           v_hoy - coalesce(e.fecha_alta, e.created_at::date) AS dias
    FROM expedientes e
    WHERE e.deleted_at IS NULL AND e.estado_interno = 'PARA_INICIAR'
      AND v_hoy - coalesce(e.fecha_alta, e.created_at::date) >= 30
      AND NOT EXISTS (SELECT 1 FROM sae_movements m WHERE m.expediente_id = e.id)
  ),
  desactualizados AS (
    SELECT e.id, coalesce(e.caratula, e.numero, 'Expediente sin carátula') AS caratula,
           CASE e.estado_interno WHEN 'PARA_INICIAR' THEN 'Para iniciar' ELSE 'Consulta' END AS estado
    FROM expedientes e
    WHERE e.deleted_at IS NULL AND e.estado_interno IN ('PARA_INICIAR', 'NUEVA_CONSULTA')
      AND EXISTS (SELECT 1 FROM sae_movements m WHERE m.expediente_id = e.id)
  ),
  sin_resp AS (
    SELECT e.id, coalesce(e.caratula, e.numero, 'Expediente sin carátula') AS caratula
    FROM expedientes e
    WHERE e.deleted_at IS NULL AND e.estado_interno = ANY (v_en_tramite) AND e.abogado_responsable_id IS NULL
  ),
  atrasadas AS (
    SELECT p.id, trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')) AS nombre, count(*) AS n
    FROM profiles p
    JOIN tareas t ON (t.asignado_a = p.id OR p.id = ANY (coalesce(t.asignados, '{}')))
    WHERE p.activo AND t.estado IN ('PENDIENTE', 'EN_PROGRESO') AND t.fecha_vencimiento < v_hoy - 7
    GROUP BY p.id
  ),
  novedades AS (
    SELECT pr.expediente_id AS id, coalesce(e.caratula, e.numero, 'Expediente') AS caratula, count(*) AS n
    FROM expediente_ficha_propuestas pr JOIN expedientes e ON e.id = pr.expediente_id
    WHERE pr.estado = 'pendiente'
    GROUP BY pr.expediente_id, e.caratula, e.numero
  ),
  consultas_quietas AS (
    SELECT c.id, trim(coalesce(c.apellido, '') || coalesce(', ' || nullif(c.nombre, ''), '')) || coalesce(' · ' || c.tipo_asunto, '') AS caratula,
           (v_hoy - c.last_activity_at::date) AS dias
    FROM consultas c
    WHERE c.estado IN ('pendiente', 'en_proceso', 'con_claudio')
      AND c.last_activity_at < now() - interval '14 days'
  ),
  items AS (
    SELECT CASE WHEN fecha <= v_hoy + 3 THEN 1 ELSE 2 END AS prioridad, 'audiencia_sin_abogado' AS tipo,
           'Audiencia sin abogado asignado' AS titulo,
           to_char(fecha, 'DD/MM') || coalesce(' ' || to_char(hora, 'HH24:MI'), '') || ' · ' || tipo AS detalle,
           expediente_id, caratula, NULL::jsonb AS lista, (fecha - v_hoy) AS orden
    FROM aud
    UNION ALL
    SELECT 1, 'plazo_vencido', 'Plazo judicial vencido sin cumplir',
           titulo || ' · venció el ' || to_char(fecha_vencimiento, 'DD/MM'),
           expediente_id, caratula, NULL, -(v_hoy - fecha_vencimiento)
    FROM plazos
    UNION ALL
    SELECT CASE WHEN dias >= 120 THEN 1 ELSE 2 END, 'sin_movimiento', 'Sin movimiento en el SAE',
           dias || ' días desde el último movimiento' || CASE WHEN abogado_responsable_id IS NULL THEN ' · sin responsable' ELSE '' END,
           id, caratula, NULL, -dias
    FROM quietos
    UNION ALL
    SELECT 2, 'para_iniciar', 'Demandas sin presentar hace más de un mes',
           count(*) || CASE WHEN count(*) = 1 THEN ' expediente para iniciar' ELSE ' expedientes para iniciar' END,
           NULL, NULL,
           jsonb_agg(jsonb_build_object('id', id, 'caratula', caratula, 'detalle', dias || ' días') ORDER BY dias DESC), 0
    FROM para_iniciar HAVING count(*) > 0
    UNION ALL
    SELECT 2, 'estado_desactualizado', 'Estado desactualizado: ya tienen movimientos en el SAE',
           count(*) || CASE WHEN count(*) = 1 THEN ' expediente' ELSE ' expedientes' END,
           NULL, NULL,
           jsonb_agg(jsonb_build_object('id', id, 'caratula', caratula, 'detalle', 'Figura como ' || lower(estado)) ORDER BY caratula), 0
    FROM desactualizados HAVING count(*) > 0
    UNION ALL
    SELECT 2, 'sin_responsable', 'Expedientes en trámite sin responsable',
           count(*) || CASE WHEN count(*) = 1 THEN ' expediente' ELSE ' expedientes' END,
           NULL, NULL,
           jsonb_agg(jsonb_build_object('id', id, 'caratula', caratula) ORDER BY caratula), 0
    FROM sin_resp HAVING count(*) > 0
    UNION ALL
    SELECT 2, 'tareas_atrasadas', 'Tareas vencidas hace más de una semana',
           nombre || ': ' || n || CASE WHEN n = 1 THEN ' tarea' ELSE ' tareas' END,
           NULL, NULL, jsonb_build_object('profile_id', id), -n
    FROM atrasadas
    UNION ALL
    SELECT 3, 'ficha_novedades', 'Novedades del SAE para revisar en las fichas',
           sum(n) || CASE WHEN sum(n) = 1 THEN ' novedad' ELSE ' novedades' END,
           NULL, NULL,
           jsonb_agg(jsonb_build_object('id', id, 'caratula', caratula, 'n', n) ORDER BY n DESC), 0
    FROM novedades HAVING count(*) > 0
    UNION ALL
    SELECT 3, 'consultas_dormidas', 'Consultas sin avanzar hace más de dos semanas',
           count(*) || CASE WHEN count(*) = 1 THEN ' consulta' ELSE ' consultas' END,
           NULL, NULL,
           jsonb_agg(jsonb_build_object('id', id, 'caratula', caratula, 'detalle', dias || ' días') ORDER BY dias DESC), 0
    FROM consultas_quietas HAVING count(*) > 0
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'prioridad', prioridad, 'tipo', tipo, 'titulo', titulo, 'detalle', detalle,
           'expediente_id', expediente_id, 'caratula', caratula, 'lista', lista
         ) ORDER BY prioridad,
           array_position(ARRAY['plazo_vencido','audiencia_sin_abogado','sin_movimiento','para_iniciar','estado_desactualizado',
                                'sin_responsable','tareas_atrasadas','ficha_novedades','consultas_dormidas'], tipo),
           orden), '[]'::jsonb)
  INTO v_atencion
  FROM items;

  -- ── Equipo ──────────────────────────────────────────────────────────────
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'orden', x->>'nombre'), '[]'::jsonb) INTO v_equipo
  FROM (
    SELECT jsonb_build_object(
      'id', p.id,
      'nombre', trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')),
      'rol', p.rol,
      'orden', CASE p.rol WHEN 'DIRECTOR' THEN '1' WHEN 'ABOGADO' THEN '2' WHEN 'SECRETARIA' THEN '3' ELSE '4' END,
      'expedientes', (SELECT count(*) FROM expedientes e WHERE e.deleted_at IS NULL
                        AND e.abogado_responsable_id = p.id AND e.estado_interno = ANY (v_en_tramite)),
      'tareas_abiertas', (SELECT count(*) FROM tareas t WHERE t.estado IN ('PENDIENTE', 'EN_PROGRESO')
                        AND (t.asignado_a = p.id OR p.id = ANY (coalesce(t.asignados, '{}')))),
      'tareas_vencidas', (SELECT count(*) FROM tareas t WHERE t.estado IN ('PENDIENTE', 'EN_PROGRESO')
                        AND t.fecha_vencimiento < v_hoy
                        AND (t.asignado_a = p.id OR p.id = ANY (coalesce(t.asignados, '{}')))),
      'completadas_7d', (SELECT count(*) FROM tareas t WHERE t.completada_por = p.id
                        AND t.completada_at >= now() - interval '7 days'),
      'audiencias_15d', (SELECT count(*) FROM audiencias a WHERE a.profesional_asistente_id = p.id
                        AND a.fecha BETWEEN v_hoy AND v_hoy + 15 AND coalesce(a.estado, '') <> 'CANCELADA')
    ) AS x
    FROM profiles p
    WHERE p.activo
  ) s;

  -- ── Números de arriba ───────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'en_tramite', (SELECT count(*) FROM expedientes WHERE deleted_at IS NULL AND estado_interno = ANY (v_en_tramite)),
    'consultas', (SELECT count(*) FROM expedientes WHERE deleted_at IS NULL AND estado_interno = 'NUEVA_CONSULTA'),
    'tareas_vencidas', (SELECT count(*) FROM tareas WHERE estado IN ('PENDIENTE', 'EN_PROGRESO') AND fecha_vencimiento < v_hoy),
    'audiencias_15d', (SELECT count(*) FROM audiencias WHERE fecha BETWEEN v_hoy AND v_hoy + 15 AND coalesce(estado, '') <> 'CANCELADA')
  ) INTO v_numeros;

  -- ── Datos que faltan (en trámite) ───────────────────────────────────────
  SELECT jsonb_build_object(
    'sin_caratula', count(*) FILTER (WHERE coalesce(trim(caratula), '') = ''),
    'sin_sae', count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM sae_movements m WHERE m.expediente_id = e.id)
                                 AND estado_interno <> 'PARA_INICIAR'),
    'sin_responsable', count(*) FILTER (WHERE abogado_responsable_id IS NULL)
  ) INTO v_datos
  FROM expedientes e
  WHERE deleted_at IS NULL AND estado_interno = ANY (v_en_tramite);

  -- ── Plata (solo con acceso a caja) ──────────────────────────────────────
  IF v_caja THEN
    WITH s AS (SELECT * FROM cuentas_corrientes_saldos())
    SELECT jsonb_build_object(
      'ingresos_mes_ars', (SELECT coalesce(sum(monto), 0) FROM ingresos WHERE deleted_at IS NULL AND moneda = 'ARS'
                             AND fecha >= date_trunc('month', v_hoy)::date),
      'ingresos_mes_usd', (SELECT coalesce(sum(monto), 0) FROM ingresos WHERE deleted_at IS NULL AND moneda = 'USD'
                             AND fecha >= date_trunc('month', v_hoy)::date),
      'ingresos_mes_anterior_ars', (SELECT coalesce(sum(monto), 0) FROM ingresos WHERE deleted_at IS NULL AND moneda = 'ARS'
                             AND fecha >= (date_trunc('month', v_hoy) - interval '1 month')::date
                             AND fecha < (v_hoy - interval '1 month')::date + 1),
      'por_cobrar_ars', (SELECT coalesce(sum(greatest(saldo_ars, 0)), 0) FROM s),
      'por_cobrar_usd', (SELECT coalesce(sum(greatest(saldo_usd, 0)), 0) FROM s),
      'vencido_ars', (SELECT coalesce(sum(vencido_ars), 0) FROM s),
      'vencido_usd', (SELECT coalesce(sum(vencido_usd), 0) FROM s),
      'deudores', (SELECT coalesce(jsonb_agg(d ORDER BY (d->>'vencido_ars')::numeric DESC), '[]'::jsonb) FROM (
                     SELECT jsonb_build_object('cliente_id', cliente_id,
                              'nombre', trim(coalesce(apellido, '') || coalesce(', ' || nullif(nombre, ''), '')),
                              'vencido_ars', vencido_ars, 'vencido_usd', vencido_usd, 'ultimo_pago', ultimo_pago) AS d
                     FROM s WHERE vencido_ars > 0 OR vencido_usd > 0
                     ORDER BY vencido_ars DESC LIMIT 5) z)
    ) INTO v_plata;
  END IF;

  RETURN jsonb_build_object(
    'generado', now(),
    'numeros', v_numeros,
    'atencion', v_atencion,
    'equipo', v_equipo,
    'datos', v_datos,
    'plata', v_plata
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tablero_direccion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tablero_direccion() TO authenticated, service_role;

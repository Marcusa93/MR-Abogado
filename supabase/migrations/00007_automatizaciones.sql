-- ============================================================
-- Marco Rossi Estudio Jurídico - Migración 007: Automatizaciones
-- Funciones para pg_cron / ejecución manual
-- ============================================================

-- ============================================================
-- Función: generar alertas de seguimiento pendiente
-- Se ejecuta los viernes a las 8am (o manualmente)
-- Crea alertas para expedientes activos sin seguimiento
-- en los últimos 7 días (estados: INICIADO, PRUEBA, ALEGATOS)
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_alertas_seguimiento_pendiente()
RETURNS jsonb AS $$
DECLARE
  v_count int := 0;
  v_dest uuid;
BEGIN
  INSERT INTO public.alertas (expediente_id, tipo, titulo, mensaje, destinatario_id, prioridad, fecha_vencimiento)
  SELECT
    e.id,
    'SEGUIMIENTO_PENDIENTE',
    'Control pendiente: ' || e.numero,
    'El expediente ' || e.numero || ' (' || c.apellido || ' ' || c.nombre || ') no tiene seguimiento en los últimos 7 días.',
    (SELECT profile_id FROM public.expediente_miembros
     WHERE expediente_id = e.id AND rol = 'abogado' AND activo = true LIMIT 1),
    'MEDIA',
    CURRENT_DATE + interval '2 days'
  FROM public.expedientes e
  JOIN public.clientes c ON c.id = e.cliente_id
  WHERE e.estado_interno IN ('INICIADO', 'PRUEBA', 'ALEGATOS', 'SENTENCIA', 'APELACION', 'CORTE')
    AND e.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.seguimientos s
      WHERE s.expediente_id = e.id
        AND s.fecha_control >= CURRENT_DATE - interval '7 days'
    )
    -- No duplicar alertas activas del mismo tipo para el mismo expediente
    AND NOT EXISTS (
      SELECT 1 FROM public.alertas a
      WHERE a.expediente_id = e.id
        AND a.tipo = 'SEGUIMIENTO_PENDIENTE'
        AND a.estado = 'ACTIVA'
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('alertas_creadas', v_count, 'tipo', 'SEGUIMIENTO_PENDIENTE');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- Función: alertas de audiencias próximas (48hs)
-- Se ejecuta diariamente a las 8am
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_alertas_audiencias_proximas()
RETURNS jsonb AS $$
DECLARE
  v_count int := 0;
BEGIN
  INSERT INTO public.alertas (expediente_id, tipo, titulo, mensaje, destinatario_id, prioridad, fecha_vencimiento)
  SELECT
    a.expediente_id,
    'AUDIENCIA_PROXIMA',
    'Audiencia en ' || (a.fecha - CURRENT_DATE) || ' día(s): ' || e.numero,
    'Audiencia programada para el ' || to_char(a.fecha, 'DD/MM/YYYY')
      || COALESCE(' a las ' || a.hora::text, '')
      || '. Cliente: ' || c.apellido || ' ' || c.nombre,
    COALESCE(
      a.profesional_asistente_id,
      (SELECT profile_id FROM public.expediente_miembros
       WHERE expediente_id = a.expediente_id AND rol = 'abogado' AND activo = true LIMIT 1)
    ),
    CASE WHEN a.fecha = CURRENT_DATE THEN 'URGENTE' ELSE 'ALTA' END,
    a.fecha
  FROM public.audiencias a
  JOIN public.expedientes e ON e.id = a.expediente_id
  JOIN public.clientes c ON c.id = e.cliente_id
  WHERE a.fecha BETWEEN CURRENT_DATE AND CURRENT_DATE + interval '2 days'
    AND a.estado IN ('PENDIENTE', 'CONFIRMADA')
    AND NOT EXISTS (
      SELECT 1 FROM public.alertas al
      WHERE al.expediente_id = a.expediente_id
        AND al.tipo = 'AUDIENCIA_PROXIMA'
        AND al.estado = 'ACTIVA'
        AND al.fecha_vencimiento = a.fecha
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('alertas_creadas', v_count, 'tipo', 'AUDIENCIA_PROXIMA');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- Función: alertas de expedientes sin responsable
-- Se ejecuta diariamente
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_alertas_sin_responsable()
RETURNS jsonb AS $$
DECLARE
  v_count int := 0;
BEGIN
  INSERT INTO public.alertas (expediente_id, tipo, titulo, mensaje, prioridad)
  SELECT
    e.id,
    'SIN_RESPONSABLE',
    'Sin responsable asignado: ' || e.numero,
    'El expediente ' || e.numero || ' lleva ' ||
    EXTRACT(DAY FROM now() - e.created_at)::int || ' días sin miembros asignados.',
    'ALTA'
  FROM public.expedientes e
  WHERE e.deleted_at IS NULL
    AND e.estado_interno NOT IN ('FINALIZADO', 'NO_VIABLE_RECHAZADO', 'NUEVA_CONSULTA')
    AND NOT EXISTS (
      SELECT 1 FROM public.expediente_miembros m
      WHERE m.expediente_id = e.id AND m.activo = true
    )
    AND e.created_at < now() - interval '3 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.alertas a
      WHERE a.expediente_id = e.id
        AND a.tipo = 'SIN_RESPONSABLE'
        AND a.estado = 'ACTIVA'
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('alertas_creadas', v_count, 'tipo', 'SIN_RESPONSABLE');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- Función master que ejecuta todas las automatizaciones
-- Útil para pg_cron o ejecución manual
-- ============================================================
CREATE OR REPLACE FUNCTION public.run_all_automations()
RETURNS jsonb AS $$
DECLARE
  v_results jsonb := '{}';
BEGIN
  v_results := v_results || public.auto_alertas_seguimiento_pendiente();
  v_results := v_results || public.auto_alertas_audiencias_proximas();
  v_results := v_results || public.auto_alertas_sin_responsable();
  RETURN v_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- NOTA: pg_cron jobs
-- Ejecutar estos comandos manualmente en el SQL Editor de Supabase
-- (pg_cron requiere superuser y no se puede crear via migración normal)
-- ============================================================
-- SELECT cron.schedule('alertas-viernes-seguimiento', '0 8 * * 5', $$SELECT public.auto_alertas_seguimiento_pendiente()$$);
-- SELECT cron.schedule('alertas-diarias-audiencias',  '0 8 * * *', $$SELECT public.auto_alertas_audiencias_proximas()$$);
-- SELECT cron.schedule('alertas-diarias-sin-resp',    '0 9 * * *', $$SELECT public.auto_alertas_sin_responsable()$$);

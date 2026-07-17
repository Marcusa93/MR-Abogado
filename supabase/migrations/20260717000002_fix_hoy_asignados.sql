-- Actualiza hoy_en_el_estudio para incluir el nuevo campo asignados[]
-- en las queries de tareas (migración 20260715010000_tareas_asignados.sql
-- agregó asignados uuid[] sin dropear asignado_a, pero las tareas nuevas
-- pueden asignarse solo vía el array).

CREATE OR REPLACE FUNCTION public.hoy_en_el_estudio()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
  v_today date := CURRENT_DATE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'P0401';
  END IF;

  SELECT jsonb_build_object(
    'fecha', v_today,
    'usuario', (SELECT jsonb_build_object('nombre', nombre, 'apellido', apellido, 'rol', rol) FROM public.profiles WHERE id = v_uid),

    'audiencias_hoy', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'hora', a.fecha,
          'tipo', a.tipo,
          'expediente_id', a.expediente_id,
          'expediente_caratula', e.caratula,
          'expediente_numero', e.numero,
          'cliente_nombre', c.nombre,
          'cliente_apellido', c.apellido,
          'organismo', o.nombre,
          'estado', a.estado
        ) ORDER BY a.fecha
      )
      FROM public.audiencias a
      JOIN public.expedientes e ON e.id = a.expediente_id
      JOIN public.clientes c ON c.id = e.cliente_id
      LEFT JOIN public.organismos o ON o.id = e.organismo_id
      WHERE a.fecha::date = v_today
        AND a.estado IN ('PENDIENTE','CONFIRMADA')
        AND public.can_view_expediente(a.expediente_id)
    ), '[]'::jsonb),

    'tareas_pendientes', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'titulo', t.titulo,
          'descripcion', t.descripcion,
          'prioridad', t.prioridad,
          'fecha_vencimiento', t.fecha_vencimiento,
          'expediente_id', t.expediente_id,
          'expediente_caratula', e.caratula,
          'estado', t.estado,
          'vencida', (t.fecha_vencimiento IS NOT NULL AND t.fecha_vencimiento < v_today)
        ) ORDER BY
          (CASE WHEN t.fecha_vencimiento IS NOT NULL AND t.fecha_vencimiento < v_today THEN 0
                WHEN t.fecha_vencimiento = v_today THEN 1
                ELSE 2 END),
          t.fecha_vencimiento NULLS LAST,
          (CASE t.prioridad WHEN 'URGENTE' THEN 0 WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 ELSE 3 END)
      )
      FROM public.tareas t
      LEFT JOIN public.expedientes e ON e.id = t.expediente_id
      WHERE t.estado IN ('PENDIENTE','EN_PROGRESO')
        AND (t.asignado_a = v_uid OR t.created_by = v_uid OR v_uid = ANY(t.asignados))
      LIMIT 12
    ), '[]'::jsonb),

    'tareas_hoy_count', (
      SELECT count(*)::int FROM public.tareas t
      WHERE t.estado IN ('PENDIENTE','EN_PROGRESO')
        AND (t.asignado_a = v_uid OR t.created_by = v_uid OR v_uid = ANY(t.asignados))
        AND t.fecha_vencimiento = v_today
    ),

    'tareas_vencidas_count', (
      SELECT count(*)::int FROM public.tareas t
      WHERE t.estado IN ('PENDIENTE','EN_PROGRESO')
        AND (t.asignado_a = v_uid OR t.created_by = v_uid OR v_uid = ANY(t.asignados))
        AND t.fecha_vencimiento IS NOT NULL
        AND t.fecha_vencimiento < v_today
    ),

    'contenidos_pendientes', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'titulo', c.titulo,
          'categoria', c.categoria,
          'estado', c.estado,
          'publicar_el', c.publicar_el
        ) ORDER BY c.publicar_el NULLS LAST, c.updated_at DESC
      )
      FROM public.contenidos c
      WHERE c.deleted_at IS NULL
        AND c.estado IN ('borrador','en_revision','aprobado')
        AND (c.created_by = v_uid OR c.asignado_a = v_uid)
      LIMIT 6
    ), '[]'::jsonb),

    'consultas_nuevas_count', (
      SELECT count(*)::int FROM public.clientes
      WHERE deleted_at IS NULL
        AND created_at >= v_today - interval '7 days'
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hoy_en_el_estudio() TO authenticated;

-- ============================================================
-- Fix: la RPC informes_dashboard tiraba 400 Bad Request.
--
-- Problemas detectados en la versión anterior:
-- 1. Doble llamada a jsonb_array_elements_text() en mismo SELECT
--    (en el bloque "personas") — comportamiento ambiguo en PG.
-- 2. date_trunc('month', timestamptz) comparado con date
--    (en el bloque "tendencia") — casts implícitos opacos.
-- 3. LATERAL jsonb_array_elements sobre adjuntos.ai_extracted sin
--    guard de tipo — si el campo no es array, falla runtime.
--
-- Reescribimos la función completa con CTEs aisladas, casts
-- explícitos y guards de jsonb_typeof donde corresponde.
-- ============================================================

CREATE OR REPLACE FUNCTION public.informes_dashboard()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
  v_exp_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'P0401';
  END IF;

  -- Cache: ids de expedientes visibles para el usuario
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO v_exp_ids
  FROM public.expedientes e
  WHERE e.deleted_at IS NULL
    AND public.can_view_expediente(e.id);

  WITH
  totales AS (
    SELECT
      count(*) FILTER (WHERE e.estado_interno NOT IN ('FINALIZADO','NO_VIABLE_RECHAZADO','PAUSADO'))::int AS activos,
      count(*) FILTER (WHERE e.estado_interno = 'FINALIZADO')::int AS finalizados,
      count(*) FILTER (WHERE e.estado_interno = 'PAUSADO')::int AS pausados,
      count(*) FILTER (WHERE e.prioridad IN ('ALTA','URGENTE') AND e.estado_interno NOT IN ('FINALIZADO','NO_VIABLE_RECHAZADO'))::int AS alta_prioridad,
      count(*)::int AS total
    FROM public.expedientes e
    WHERE e.id = ANY(v_exp_ids)
  ),

  por_estado AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('estado', estado_interno, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb) AS data
    FROM (
      SELECT estado_interno, count(*)::int AS cnt
      FROM public.expedientes
      WHERE id = ANY(v_exp_ids)
      GROUP BY estado_interno
    ) s
  ),

  por_fuero AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('fuero', COALESCE(fuero,'sin_fuero'), 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb) AS data
    FROM (
      SELECT fuero, count(*)::int AS cnt
      FROM public.expedientes
      WHERE id = ANY(v_exp_ids)
      GROUP BY fuero
    ) s
  ),

  por_organismo AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'organismo_id', org_id,
        'nombre', nombre,
        'tipo', tipo,
        'count', cnt,
        'ultima_actividad', ultima_actividad,
        'estancados_30d', estancados
      ) ORDER BY cnt DESC
    ), '[]'::jsonb) AS data
    FROM (
      SELECT
        o.id AS org_id,
        o.nombre,
        o.tipo,
        count(e.id)::int AS cnt,
        max(e.updated_at) AS ultima_actividad,
        count(*) FILTER (
          WHERE e.estado_interno NOT IN ('FINALIZADO','NO_VIABLE_RECHAZADO','PAUSADO')
            AND e.updated_at < now() - interval '30 days'
        )::int AS estancados
      FROM public.expedientes e
      JOIN public.organismos o ON o.id = e.organismo_id
      WHERE e.id = ANY(v_exp_ids)
      GROUP BY o.id, o.nombre, o.tipo
      ORDER BY count(e.id) DESC
      LIMIT 20
    ) s
  ),

  por_tipo_tramite AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object('tipo_id', tt.id, 'nombre', tt.nombre, 'count', s.cnt)
      ORDER BY s.cnt DESC
    ), '[]'::jsonb) AS data
    FROM (
      SELECT tipo_tramite_id, count(*)::int AS cnt
      FROM public.expedientes
      WHERE id = ANY(v_exp_ids)
      GROUP BY tipo_tramite_id
    ) s
    JOIN public.tipos_tramite tt ON tt.id = s.tipo_tramite_id
  ),

  pulso AS (
    SELECT jsonb_build_object(
      'adjuntos_analizados', (
        SELECT count(*)::int FROM public.adjuntos a
        WHERE a.expediente_id = ANY(v_exp_ids) AND a.ai_analyzed_at IS NOT NULL AND a.deleted_at IS NULL
      ),
      'adjuntos_pendientes', (
        SELECT count(*)::int FROM public.adjuntos a
        WHERE a.expediente_id = ANY(v_exp_ids) AND a.ai_analyzed_at IS NULL AND a.deleted_at IS NULL
      ),
      'movements_analizados', (
        SELECT count(*)::int FROM public.sae_movements m
        WHERE m.expediente_id = ANY(v_exp_ids) AND m.ai_analyzed_at IS NOT NULL
      ),
      'audiencias_transcriptas', (
        SELECT count(*)::int FROM public.audiencia_transcripts t
        WHERE t.expediente_id = ANY(v_exp_ids) AND t.status = 'completed'
      ),
      'aprendizajes_total', (
        SELECT count(*)::int FROM public.aprendizajes_rulebook
        WHERE owner_id = v_uid AND is_active = true
      ),
      'aprendizajes_auto', (
        SELECT count(*)::int FROM public.aprendizajes_rulebook
        WHERE owner_id = v_uid AND is_active = true
          AND contenido_estructurado IS NOT NULL
          AND contenido_estructurado->'source'->>'auto' = 'true'
      ),
      'chunks_adjuntos', (
        SELECT count(*)::int FROM public.adjunto_chunks c
        WHERE c.expediente_id = ANY(v_exp_ids)
      ),
      'chunks_audiencias', (
        SELECT count(*)::int FROM public.audiencia_transcript_chunks c
        WHERE c.expediente_id = ANY(v_exp_ids)
      ),
      'chunks_normativa', (
        SELECT count(*)::int FROM public.normativa_chunks c
        WHERE c.user_id = v_uid
      ),
      'chunks_jurisprudencia', (
        SELECT count(*)::int FROM public.jurisprudencia_chunks c
        WHERE c.user_id = v_uid
      )
    ) AS data
  ),

  -- Tendencia mensual: castea m.mes a date para comparar con date_trunc en TZ del server
  meses AS (
    SELECT (date_trunc('month', now()) - (n * interval '1 month'))::date AS mes
    FROM generate_series(0, 11) n
  ),
  tendencia AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'mes', to_char(m.mes, 'YYYY-MM'),
        'expedientes_nuevos', COALESCE((
          SELECT count(*)::int FROM public.expedientes e
          WHERE e.id = ANY(v_exp_ids)
            AND date_trunc('month', e.created_at)::date = m.mes
        ), 0),
        'movements_nuevos', COALESCE((
          SELECT count(*)::int FROM public.sae_movements mv
          WHERE mv.expediente_id = ANY(v_exp_ids)
            AND date_trunc('month', mv.fecha)::date = m.mes
        ), 0),
        'sentencias_analizadas', COALESCE((
          SELECT count(*)::int FROM public.sae_movements mv
          WHERE mv.expediente_id = ANY(v_exp_ids)
            AND mv.tipo_movimiento IN ('sentencia','decreto')
            AND mv.ai_analyzed_at IS NOT NULL
            AND date_trunc('month', mv.ai_analyzed_at)::date = m.mes
        ), 0)
      ) ORDER BY m.mes
    ), '[]'::jsonb) AS data
    FROM meses m
  ),

  jueces AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object('nombre', target_ref_text, 'apariciones', cnt)
      ORDER BY cnt DESC
    ), '[]'::jsonb) AS data
    FROM (
      SELECT target_ref_text, count(*)::int AS cnt
      FROM public.aprendizajes_rulebook
      WHERE owner_id = v_uid
        AND is_active = true
        AND target_kind = 'juez'
        AND target_ref_text IS NOT NULL
      GROUP BY target_ref_text
      ORDER BY count(*) DESC
      LIMIT 12
    ) s
  ),

  -- Normativa: guard de jsonb_typeof antes de expandir
  normativa_items AS (
    SELECT btrim(item->>'norma') AS norma
    FROM public.adjuntos a,
         LATERAL jsonb_array_elements(a.ai_extracted->'normativa_citada') AS item
    WHERE a.expediente_id = ANY(v_exp_ids)
      AND a.deleted_at IS NULL
      AND a.ai_extracted IS NOT NULL
      AND jsonb_typeof(a.ai_extracted->'normativa_citada') = 'array'
  ),
  normativa AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object('norma', norma, 'apariciones', cnt) ORDER BY cnt DESC
    ), '[]'::jsonb) AS data
    FROM (
      SELECT norma, count(*)::int AS cnt
      FROM normativa_items
      WHERE norma IS NOT NULL AND length(norma) > 0
      GROUP BY norma
      ORDER BY count(*) DESC
      LIMIT 15
    ) s
  ),

  jurisprudencia_items AS (
    SELECT btrim(item->>'cita') AS cita
    FROM public.adjuntos a,
         LATERAL jsonb_array_elements(a.ai_extracted->'jurisprudencia_citada') AS item
    WHERE a.expediente_id = ANY(v_exp_ids)
      AND a.deleted_at IS NULL
      AND a.ai_extracted IS NOT NULL
      AND jsonb_typeof(a.ai_extracted->'jurisprudencia_citada') = 'array'
  ),
  jurisprudencia AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object('cita', cita, 'apariciones', cnt) ORDER BY cnt DESC
    ), '[]'::jsonb) AS data
    FROM (
      SELECT cita, count(*)::int AS cnt
      FROM jurisprudencia_items
      WHERE cita IS NOT NULL AND length(cita) > 0
      GROUP BY cita
      ORDER BY count(*) DESC
      LIMIT 15
    ) s
  ),

  -- Personas: una sola llamada a jsonb_array_elements_text por row,
  -- luego se normaliza en CTE separada
  personas_raw AS (
    SELECT btrim(parte) AS nombre_raw
    FROM public.audiencia_transcripts t,
         LATERAL jsonb_array_elements_text(t.ai_analysis->'partes_presentes') AS parte
    WHERE t.expediente_id = ANY(v_exp_ids)
      AND t.ai_analysis IS NOT NULL
      AND jsonb_typeof(t.ai_analysis->'partes_presentes') = 'array'
  ),
  personas_norm AS (
    SELECT
      nombre_raw,
      lower(translate(
        regexp_replace(nombre_raw, '\s+', ' ', 'g'),
        'áéíóúÁÉÍÓÚñÑüÜ',
        'aeiouAEIOUnNuU'
      )) AS nombre_norm
    FROM personas_raw
    WHERE length(nombre_raw) >= 3
  ),
  personas AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object('nombre', nombre_display, 'apariciones', cnt)
      ORDER BY cnt DESC
    ), '[]'::jsonb) AS data
    FROM (
      SELECT
        (array_agg(nombre_raw ORDER BY length(nombre_raw) DESC))[1] AS nombre_display,
        count(*)::int AS cnt
      FROM personas_norm
      GROUP BY nombre_norm
      ORDER BY count(*) DESC
      LIMIT 12
    ) s
  )

  SELECT jsonb_build_object(
    'generado_at', now(),
    'totales', (SELECT row_to_json(t)::jsonb FROM totales t),
    'por_estado', (SELECT data FROM por_estado),
    'por_fuero', (SELECT data FROM por_fuero),
    'por_organismo', (SELECT data FROM por_organismo),
    'por_tipo_tramite', (SELECT data FROM por_tipo_tramite),
    'pulso_ia', (SELECT data FROM pulso),
    'tendencia_mensual', (SELECT data FROM tendencia),
    'jueces_recurrentes', (SELECT data FROM jueces),
    'normativa_top', (SELECT data FROM normativa),
    'jurisprudencia_top', (SELECT data FROM jurisprudencia),
    'personas_recurrentes', (SELECT data FROM personas)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

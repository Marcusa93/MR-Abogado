-- ============================================================
-- RPC unificada para el dashboard de informes / command center
--
-- Devuelve UN JSON con todas las stats visibles para el usuario
-- vía can_view_expediente. Hecho en una sola RPC para evitar
-- N round-trips desde el frontend.
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

  -- Cache: ids de expedientes visibles para el usuario (no eliminados)
  SELECT array_agg(id)
  INTO v_exp_ids
  FROM public.expedientes e
  WHERE e.deleted_at IS NULL
    AND public.can_view_expediente(e.id);

  IF v_exp_ids IS NULL THEN v_exp_ids := ARRAY[]::uuid[]; END IF;

  WITH
  -- ── Conteos generales ─────────────────────────────────────────
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

  -- ── Distribución por estado interno ──────────────────────────
  por_estado AS (
    SELECT jsonb_agg(jsonb_build_object('estado', estado_interno, 'count', cnt) ORDER BY cnt DESC) AS data
    FROM (
      SELECT estado_interno, count(*)::int AS cnt
      FROM public.expedientes
      WHERE id = ANY(v_exp_ids)
      GROUP BY estado_interno
    ) s
  ),

  -- ── Distribución por fuero ────────────────────────────────────
  por_fuero AS (
    SELECT jsonb_agg(jsonb_build_object('fuero', COALESCE(fuero,'sin_fuero'), 'count', cnt) ORDER BY cnt DESC) AS data
    FROM (
      SELECT fuero, count(*)::int AS cnt
      FROM public.expedientes
      WHERE id = ANY(v_exp_ids)
      GROUP BY fuero
    ) s
  ),

  -- ── Mapa de tribunales (organismos) ──────────────────────────
  por_organismo AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'organismo_id', org_id,
        'nombre', nombre,
        'tipo', tipo,
        'count', cnt,
        'ultima_actividad', ultima_actividad,
        'estancados_30d', estancados
      ) ORDER BY cnt DESC
    ) AS data
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

  -- ── Distribución por tipo de trámite ─────────────────────────
  por_tipo_tramite AS (
    SELECT jsonb_agg(
      jsonb_build_object('tipo_id', tt.id, 'nombre', tt.nombre, 'count', s.cnt)
      ORDER BY s.cnt DESC
    ) AS data
    FROM (
      SELECT tipo_tramite_id, count(*)::int AS cnt
      FROM public.expedientes
      WHERE id = ANY(v_exp_ids)
      GROUP BY tipo_tramite_id
    ) s
    JOIN public.tipos_tramite tt ON tt.id = s.tipo_tramite_id
  ),

  -- ── Pulso IA ──────────────────────────────────────────────────
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

  -- ── Tendencia mensual: últimos 12 meses ──────────────────────
  meses AS (
    SELECT generate_series(
      date_trunc('month', now()) - interval '11 months',
      date_trunc('month', now()),
      interval '1 month'
    )::date AS mes
  ),
  tendencia AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'mes', to_char(m.mes, 'YYYY-MM'),
        'expedientes_nuevos', COALESCE((
          SELECT count(*)::int FROM public.expedientes e
          WHERE e.id = ANY(v_exp_ids)
            AND date_trunc('month', e.created_at) = m.mes
        ), 0),
        'movements_nuevos', COALESCE((
          SELECT count(*)::int FROM public.sae_movements mv
          WHERE mv.expediente_id = ANY(v_exp_ids)
            AND date_trunc('month', mv.fecha::timestamp) = m.mes
        ), 0),
        'sentencias_analizadas', COALESCE((
          SELECT count(*)::int FROM public.sae_movements mv
          WHERE mv.expediente_id = ANY(v_exp_ids)
            AND mv.tipo_movimiento IN ('sentencia','decreto')
            AND mv.ai_analyzed_at IS NOT NULL
            AND date_trunc('month', mv.ai_analyzed_at) = m.mes
        ), 0)
      ) ORDER BY m.mes
    ) AS data
    FROM meses m
  ),

  -- ── Jueces recurrentes (de aprendizajes auto) ────────────────
  jueces AS (
    SELECT jsonb_agg(
      jsonb_build_object('nombre', target_ref_text, 'apariciones', cnt)
      ORDER BY cnt DESC
    ) AS data
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

  -- ── Top normativa citada (de adjuntos.ai_extracted) ──────────
  normativa AS (
    SELECT jsonb_agg(
      jsonb_build_object('norma', norma, 'apariciones', cnt) ORDER BY cnt DESC
    ) AS data
    FROM (
      SELECT
        btrim(item->>'norma') AS norma,
        count(*)::int AS cnt
      FROM public.adjuntos a,
           LATERAL jsonb_array_elements(COALESCE(a.ai_extracted->'normativa_citada','[]'::jsonb)) AS item
      WHERE a.expediente_id = ANY(v_exp_ids)
        AND a.deleted_at IS NULL
        AND a.ai_extracted ? 'normativa_citada'
        AND btrim(COALESCE(item->>'norma','')) <> ''
      GROUP BY btrim(item->>'norma')
      ORDER BY count(*) DESC
      LIMIT 15
    ) s
  ),

  -- ── Top jurisprudencia citada ───────────────────────────────
  jurisprudencia AS (
    SELECT jsonb_agg(
      jsonb_build_object('cita', cita, 'apariciones', cnt) ORDER BY cnt DESC
    ) AS data
    FROM (
      SELECT
        btrim(item->>'cita') AS cita,
        count(*)::int AS cnt
      FROM public.adjuntos a,
           LATERAL jsonb_array_elements(COALESCE(a.ai_extracted->'jurisprudencia_citada','[]'::jsonb)) AS item
      WHERE a.expediente_id = ANY(v_exp_ids)
        AND a.deleted_at IS NULL
        AND a.ai_extracted ? 'jurisprudencia_citada'
        AND btrim(COALESCE(item->>'cita','')) <> ''
      GROUP BY btrim(item->>'cita')
      ORDER BY count(*) DESC
      LIMIT 15
    ) s
  ),

  -- ── Personas recurrentes en audiencias ──────────────────────
  personas AS (
    SELECT jsonb_agg(
      jsonb_build_object('nombre', nombre_display, 'apariciones', cnt)
      ORDER BY cnt DESC
    ) AS data
    FROM (
      SELECT
        (array_agg(nombre_raw ORDER BY length(nombre_raw) DESC))[1] AS nombre_display,
        count(*)::int AS cnt
      FROM (
        SELECT
          btrim(jsonb_array_elements_text(t.ai_analysis->'partes_presentes')) AS nombre_raw,
          lower(translate(
            regexp_replace(btrim(jsonb_array_elements_text(t.ai_analysis->'partes_presentes')), '\s+', ' ', 'g'),
            'áéíóúÁÉÍÓÚñÑüÜ',
            'aeiouAEIOUnNuU'
          )) AS nombre_norm
        FROM public.audiencia_transcripts t
        WHERE t.expediente_id = ANY(v_exp_ids)
          AND jsonb_typeof(t.ai_analysis->'partes_presentes') = 'array'
      ) raw
      WHERE length(nombre_raw) >= 3
      GROUP BY nombre_norm
      ORDER BY count(*) DESC
      LIMIT 12
    ) s
  )

  SELECT jsonb_build_object(
    'generado_at', now(),
    'totales', (SELECT row_to_json(t)::jsonb FROM totales t),
    'por_estado', COALESCE((SELECT data FROM por_estado), '[]'::jsonb),
    'por_fuero', COALESCE((SELECT data FROM por_fuero), '[]'::jsonb),
    'por_organismo', COALESCE((SELECT data FROM por_organismo), '[]'::jsonb),
    'por_tipo_tramite', COALESCE((SELECT data FROM por_tipo_tramite), '[]'::jsonb),
    'pulso_ia', COALESCE((SELECT data FROM pulso), '{}'::jsonb),
    'tendencia_mensual', COALESCE((SELECT data FROM tendencia), '[]'::jsonb),
    'jueces_recurrentes', COALESCE((SELECT data FROM jueces), '[]'::jsonb),
    'normativa_top', COALESCE((SELECT data FROM normativa), '[]'::jsonb),
    'jurisprudencia_top', COALESCE((SELECT data FROM jurisprudencia), '[]'::jsonb),
    'personas_recurrentes', COALESCE((SELECT data FROM personas), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.informes_dashboard() TO authenticated;

COMMENT ON FUNCTION public.informes_dashboard IS
  'Devuelve un JSON con todas las stats del dashboard de informes para el usuario actual, agregando datos de expedientes visibles vía can_view_expediente y del corpus IA del usuario (normativa/jurisprudencia).';

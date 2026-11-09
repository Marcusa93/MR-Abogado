-- Plantillas de trámite (sin IA), medición de cuánto se corrige cada borrador
-- y costo de cada llamada al LLM para el panel de uso.

-- ─── Plantillas ──────────────────────────────────────────────────────────────
ALTER TABLE public.escrito_templates DROP CONSTRAINT IF EXISTS escrito_templates_categoria_check;
ALTER TABLE public.escrito_templates
  ADD CONSTRAINT escrito_templates_categoria_check CHECK (categoria = ANY (ARRAY['estilo','modelo','tramite']));

DROP POLICY IF EXISTS escrito_templates_shared_read ON public.escrito_templates;
CREATE POLICY escrito_templates_shared_read ON public.escrito_templates
  FOR SELECT USING (compartido = true AND categoria IN ('modelo','tramite') AND is_active = true);

-- El director puede editar o desactivar las plantillas compartidas del estudio
DROP POLICY IF EXISTS escrito_templates_director_shared ON public.escrito_templates;
CREATE POLICY escrito_templates_director_shared ON public.escrito_templates
  FOR UPDATE USING (public.is_director() AND compartido = true)
  WITH CHECK (public.is_director() AND compartido = true);

-- ─── Escritos: origen y medición ─────────────────────────────────────────────
ALTER TABLE public.escritos
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'ia' CHECK (origen IN ('ia','plantilla','manual')),
  ADD COLUMN IF NOT EXISTS edicion_pct numeric(5,2);

COMMENT ON COLUMN public.escritos.edicion_pct IS
  'Porcentaje del texto que el abogado cambió entre contenido_original y la versión firmada (palabras). Se calcula al firmar.';

-- Crear un escrito desde una plantilla, con la misma visibilidad que el expediente
CREATE OR REPLACE FUNCTION public.crear_escrito_plantilla(
  p_expediente_id uuid, p_titulo text, p_tipo text, p_contenido jsonb, p_template_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF p_expediente_id IS NOT NULL AND NOT public.can_view_expediente(p_expediente_id) THEN
    RAISE EXCEPTION 'Sin acceso al expediente';
  END IF;
  INSERT INTO public.escritos (expediente_id, user_id, template_id, titulo, tipo, estado, contenido, contenido_original, origen)
  VALUES (p_expediente_id, auth.uid(), p_template_id, p_titulo, p_tipo, 'borrador', p_contenido, p_contenido, 'plantilla')
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.crear_escrito_plantilla(uuid, text, text, jsonb, uuid) TO authenticated;

-- ─── Costo por llamada ───────────────────────────────────────────────────────
ALTER TABLE public.llm_call_log
  ADD COLUMN IF NOT EXISTS costo_usd numeric(10,5),
  ADD COLUMN IF NOT EXISTS modelo text,
  ADD COLUMN IF NOT EXISTS escrito_id uuid;

-- Resumen de uso de IA en escritos. El director ve a todo el equipo; el resto, lo propio.
CREATE OR REPLACE FUNCTION public.uso_ia_escritos(p_desde timestamptz, p_hasta timestamptz)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH vis AS (SELECT public.is_director() AS dir, auth.uid() AS yo),
  esc AS (
    SELECT e.* FROM public.escritos e, vis
    WHERE e.created_at >= p_desde AND e.created_at < p_hasta AND (vis.dir OR e.user_id = vis.yo)
  ),
  llm AS (
    SELECT l.* FROM public.llm_call_log l, vis
    WHERE l.created_at >= p_desde AND l.created_at < p_hasta AND l.costo_usd IS NOT NULL
      AND l.function_name IN ('escritos-generate','escrito-asistente','diagnose-escrito','escrito-extraer-aprendizajes','aprendizajes-consolidar')
      AND (vis.dir OR l.user_id = vis.yo)
  ),
  personas AS (
    SELECT p.id, trim(coalesce(p.nombre,'') || ' ' || coalesce(p.apellido,'')) AS nombre FROM public.profiles p
  )
  SELECT jsonb_build_object(
    'por_abogado', coalesce((
      SELECT jsonb_agg(x ORDER BY x->>'nombre') FROM (
        SELECT jsonb_build_object(
          'user_id', u.uid,
          'nombre', (SELECT nombre FROM personas WHERE id = u.uid),
          'escritos_ia', (SELECT count(*) FROM esc WHERE user_id = u.uid AND origen = 'ia' AND modelo_ia IS NOT NULL),
          'escritos_plantilla', (SELECT count(*) FROM esc WHERE user_id = u.uid AND origen = 'plantilla'),
          'firmados', (SELECT count(*) FROM esc WHERE user_id = u.uid AND estado IN ('firmado','presentado','presentado_sae')),
          'costo_redaccion', (SELECT coalesce(sum(costo_usd),0) FROM esc WHERE user_id = u.uid)
            + (SELECT coalesce(sum(costo_usd),0) FROM llm WHERE user_id = u.uid AND function_name = 'escritos-generate'),
          'costo_asistente', (SELECT coalesce(sum(costo_usd),0) FROM llm WHERE user_id = u.uid AND function_name = 'escrito-asistente'),
          'costo_revision', (SELECT coalesce(sum(costo_usd),0) FROM llm WHERE user_id = u.uid AND function_name NOT IN ('escrito-asistente','escritos-generate')),
          'edicion_promedio', (SELECT round(avg(edicion_pct),1) FROM esc WHERE user_id = u.uid AND edicion_pct IS NOT NULL)
        ) AS x
        FROM (SELECT user_id AS uid FROM esc UNION SELECT user_id FROM llm) u
      ) t
    ), '[]'::jsonb),
    'por_tipo', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'tipo', tipo, 'origen', origen, 'modelo', modelo_ia, 'n', n, 'firmados', firmados,
        'edicion_promedio', edicion, 'costo_promedio', costo
      ) ORDER BY n DESC)
      FROM (
        SELECT lower(trim(coalesce(nullif(tipo,''),'sin tipo'))) AS tipo, origen, modelo_ia,
               count(*) AS n,
               count(edicion_pct) AS firmados,
               round(avg(edicion_pct),1) AS edicion,
               round(avg(costo_usd),3) AS costo
        FROM esc GROUP BY 1,2,3
      ) g
    ), '[]'::jsonb),
    'por_mes', coalesce((
      SELECT jsonb_agg(jsonb_build_object('mes', mes, 'costo', costo) ORDER BY mes)
      FROM (
        SELECT to_char(m, 'YYYY-MM') AS mes, sum(c) AS costo FROM (
          SELECT date_trunc('month', created_at) m, coalesce(costo_usd,0) c FROM esc
          UNION ALL SELECT date_trunc('month', created_at), costo_usd FROM llm
        ) z GROUP BY 1
      ) mm
    ), '[]'::jsonb)
  )
$$;
GRANT EXECUTE ON FUNCTION public.uso_ia_escritos(timestamptz, timestamptz) TO authenticated;

-- ─── Dedupe de aprendizajes: también contra los propuestos ───────────────────
CREATE OR REPLACE FUNCTION public.aprendizaje_dedupe_o_incrementar(p_owner_id uuid, p_target_kind text, p_contenido text, p_threshold real DEFAULT 0.7)
 RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_match_id uuid;
BEGIN
  SELECT id INTO v_match_id
  FROM public.aprendizajes_rulebook
  WHERE owner_id = p_owner_id
    AND is_active = true
    AND similarity(contenido, p_contenido) >= p_threshold
  ORDER BY proposed ASC, similarity(contenido, p_contenido) DESC
  LIMIT 1;

  IF v_match_id IS NOT NULL THEN
    UPDATE public.aprendizajes_rulebook
    SET observed_in_cases = observed_in_cases + 1,
        confidence = CASE WHEN observed_in_cases + 1 >= 3 THEN 'alta' WHEN observed_in_cases + 1 = 2 THEN 'media' ELSE confidence END,
        updated_at = now()
    WHERE id = v_match_id;
  END IF;
  RETURN v_match_id;
END $function$;

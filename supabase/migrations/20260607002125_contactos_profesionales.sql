-- ============================================================
-- Contactos profesionales: jueces, peritos, abogados de contraparte
--
-- Unifica datos hoy dispersos en aprendizajes_rulebook.target_ref_text
-- (jueces detectados) y audiencia_transcripts.ai_analysis.partes_presentes
-- (peritos / partes detectados). Permite cargar datos manuales y ver
-- el "expediente 360" de cada persona — todo lo que sabemos de ella.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_contacto_profesional') THEN
    CREATE TYPE public.tipo_contacto_profesional AS ENUM (
      'juez', 'perito', 'abogado_contraparte', 'secretario',
      'mediador', 'fiscal', 'defensor', 'otro'
    );
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────
-- 1) Tabla principal
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contactos_profesionales (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo                public.tipo_contacto_profesional NOT NULL DEFAULT 'otro',
  nombre              text NOT NULL CHECK (btrim(nombre) <> ''),
  /** Lowercase + sin tildes, para matching contra partes_presentes y target_ref_text. */
  nombre_normalizado  text NOT NULL,
  /** Otras formas en que aparece (ej: "Dr. Pérez", "J. Pérez", "Juan Pérez"). Cada elemento debe ya estar normalizado. */
  alias_normalizados  text[] NOT NULL DEFAULT ARRAY[]::text[],
  dni                 text,
  matricula           text,
  organismo_id        uuid REFERENCES public.organismos(id) ON DELETE SET NULL,
  telefono            text,
  telefono_alt        text,
  email               text,
  domicilio           text,
  especialidad        text,
  observaciones       text,
  scope               text NOT NULL DEFAULT 'personal'
                      CHECK (scope IN ('personal', 'compartido', 'universal')),
  owner_id            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,
  CHECK (
    (scope = 'universal' AND owner_id IS NULL) OR
    (scope IN ('personal', 'compartido') AND owner_id IS NOT NULL)
  )
);

COMMENT ON TABLE public.contactos_profesionales IS
  'Directorio del estudio de personas con las que trabajamos profesionalmente (jueces, peritos, contrapartes). Vinculable por nombre normalizado a audiencias y aprendizajes existentes.';

CREATE INDEX IF NOT EXISTS idx_contactos_owner ON public.contactos_profesionales(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contactos_nombre_norm ON public.contactos_profesionales(nombre_normalizado) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contactos_tipo ON public.contactos_profesionales(tipo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contactos_organismo ON public.contactos_profesionales(organismo_id) WHERE organismo_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contactos_alias_gin ON public.contactos_profesionales USING gin(alias_normalizados);

DROP TRIGGER IF EXISTS trg_contactos_updated_at ON public.contactos_profesionales;
CREATE TRIGGER trg_contactos_updated_at
  BEFORE UPDATE ON public.contactos_profesionales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 2) Helper de normalización
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.normalizar_nombre(p_input text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT lower(translate(
    regexp_replace(
      regexp_replace(COALESCE(p_input, ''), '\s+', ' ', 'g'),
      '^\s+|\s+$', '', 'g'
    ),
    'áéíóúÁÉÍÓÚñÑüÜ',
    'aeiouAEIOUnNuU'
  ));
$$;

GRANT EXECUTE ON FUNCTION public.normalizar_nombre(text) TO authenticated;

-- Trigger para auto-rellenar nombre_normalizado y normalizar alias
CREATE OR REPLACE FUNCTION public.contactos_normalizar_trigger()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_idx int;
BEGIN
  NEW.nombre_normalizado := public.normalizar_nombre(NEW.nombre);
  IF NEW.alias_normalizados IS NOT NULL THEN
    FOR v_idx IN 1..coalesce(array_length(NEW.alias_normalizados, 1), 0) LOOP
      NEW.alias_normalizados[v_idx] := public.normalizar_nombre(NEW.alias_normalizados[v_idx]);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contactos_normalizar ON public.contactos_profesionales;
CREATE TRIGGER trg_contactos_normalizar
  BEFORE INSERT OR UPDATE ON public.contactos_profesionales
  FOR EACH ROW EXECUTE FUNCTION public.contactos_normalizar_trigger();

-- ─────────────────────────────────────────────────────────────
-- 3) RLS
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.contactos_profesionales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contactos_select_visible ON public.contactos_profesionales;
CREATE POLICY contactos_select_visible ON public.contactos_profesionales
  FOR SELECT USING (
    deleted_at IS NULL AND (
      scope = 'universal'
      OR owner_id = auth.uid()
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS contactos_insert_owner ON public.contactos_profesionales;
CREATE POLICY contactos_insert_owner ON public.contactos_profesionales
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    ((scope = 'personal' AND owner_id = auth.uid()) OR
     (scope = 'compartido' AND owner_id = auth.uid()) OR
     (scope = 'universal' AND public.is_admin()))
  );

DROP POLICY IF EXISTS contactos_update_owner ON public.contactos_profesionales;
CREATE POLICY contactos_update_owner ON public.contactos_profesionales
  FOR UPDATE USING (owner_id = auth.uid() OR public.is_admin())
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS contactos_delete_owner ON public.contactos_profesionales;
CREATE POLICY contactos_delete_owner ON public.contactos_profesionales
  FOR DELETE USING (owner_id = auth.uid() OR public.is_admin());

-- ─────────────────────────────────────────────────────────────
-- 4) RPC: detalle 360 de un contacto
--    Devuelve audiencias donde su nombre normalizado matchea
--    partes_presentes, aprendizajes vinculados (target_ref_text),
--    y cuenta total de apariciones.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.contacto_detalle_360(p_contacto_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_contacto public.contactos_profesionales%ROWTYPE;
  v_matches text[];
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'P0401';
  END IF;

  SELECT * INTO v_contacto FROM public.contactos_profesionales WHERE id = p_contacto_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contacto no encontrado' USING ERRCODE = 'P0404';
  END IF;
  -- Verificación de visibilidad
  IF NOT (v_contacto.scope = 'universal' OR v_contacto.owner_id = v_uid OR public.is_admin()) THEN
    RAISE EXCEPTION 'Sin permisos' USING ERRCODE = 'P0403';
  END IF;

  -- Lista de patrones de matcheo (nombre + alias)
  v_matches := ARRAY[v_contacto.nombre_normalizado] || v_contacto.alias_normalizados;

  SELECT jsonb_build_object(
    'contacto', to_jsonb(v_contacto) || jsonb_build_object(
      'organismo_nombre', (SELECT nombre FROM public.organismos WHERE id = v_contacto.organismo_id)
    ),

    'audiencias', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'transcript_id', t.id,
          'expediente_id', t.expediente_id,
          'expediente_caratula', e.caratula,
          'expediente_numero', e.numero,
          'fecha', t.transcript_at,
          'audio_filename', t.audio_filename,
          'resumen', t.ai_analysis->>'resumen'
        ) ORDER BY t.transcript_at DESC NULLS LAST
      )
      FROM public.audiencia_transcripts t
      JOIN public.expedientes e ON e.id = t.expediente_id
      WHERE t.ai_analysis IS NOT NULL
        AND jsonb_typeof(t.ai_analysis->'partes_presentes') = 'array'
        AND public.can_view_expediente(t.expediente_id)
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(t.ai_analysis->'partes_presentes') AS parte
          WHERE public.normalizar_nombre(parte) = ANY(v_matches)
        )
      LIMIT 100
    ), '[]'::jsonb),

    'aprendizajes', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'target_kind', a.target_kind,
          'contenido', a.contenido,
          'confidence', a.confidence,
          'observed_in_cases', a.observed_in_cases,
          'created_at', a.created_at,
          'expediente_id', (a.contenido_estructurado->'source'->>'expediente_id')::uuid
        ) ORDER BY a.created_at DESC
      )
      FROM public.aprendizajes_rulebook a
      WHERE a.is_active = true
        AND (a.owner_id = v_uid OR a.scope = 'universal' OR public.is_admin())
        AND a.target_ref_text IS NOT NULL
        AND public.normalizar_nombre(a.target_ref_text) = ANY(v_matches)
      LIMIT 50
    ), '[]'::jsonb),

    'stats', jsonb_build_object(
      'audiencias_count', (
        SELECT count(*)::int
        FROM public.audiencia_transcripts t
        WHERE t.ai_analysis IS NOT NULL
          AND jsonb_typeof(t.ai_analysis->'partes_presentes') = 'array'
          AND public.can_view_expediente(t.expediente_id)
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(t.ai_analysis->'partes_presentes') AS p
            WHERE public.normalizar_nombre(p) = ANY(v_matches)
          )
      ),
      'aprendizajes_count', (
        SELECT count(*)::int FROM public.aprendizajes_rulebook a
        WHERE a.is_active = true
          AND a.target_ref_text IS NOT NULL
          AND public.normalizar_nombre(a.target_ref_text) = ANY(v_matches)
      ),
      'expedientes_count', (
        SELECT count(DISTINCT t.expediente_id)::int
        FROM public.audiencia_transcripts t
        WHERE t.ai_analysis IS NOT NULL
          AND jsonb_typeof(t.ai_analysis->'partes_presentes') = 'array'
          AND public.can_view_expediente(t.expediente_id)
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(t.ai_analysis->'partes_presentes') AS p
            WHERE public.normalizar_nombre(p) = ANY(v_matches)
          )
      )
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.contacto_detalle_360(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5) RPC: personas detectadas SIN contacto registrado
--    Útil para sugerir al usuario qué cargar.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.personas_sin_contacto(p_min_apariciones int DEFAULT 3, p_limit int DEFAULT 30)
RETURNS TABLE (
  nombre_normalizado    text,
  nombre_display        text,
  apariciones           int,
  fuentes               text[],
  ultima_aparicion      timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'P0401';
  END IF;

  RETURN QUERY
  WITH partes_audiencia AS (
    SELECT
      btrim(jsonb_array_elements_text(t.ai_analysis->'partes_presentes')) AS nombre_raw,
      'audiencia'::text AS fuente,
      t.transcript_at AS at_time
    FROM public.audiencia_transcripts t
    WHERE t.ai_analysis IS NOT NULL
      AND jsonb_typeof(t.ai_analysis->'partes_presentes') = 'array'
      AND public.can_view_expediente(t.expediente_id)
  ),
  partes_aprendizaje AS (
    SELECT
      a.target_ref_text AS nombre_raw,
      'aprendizaje'::text AS fuente,
      a.created_at AS at_time
    FROM public.aprendizajes_rulebook a
    WHERE a.is_active = true
      AND a.owner_id = v_uid
      AND a.target_kind IN ('juez', 'organismo')
      AND a.target_ref_text IS NOT NULL
  ),
  todas AS (
    SELECT nombre_raw, fuente, at_time FROM partes_audiencia
    UNION ALL
    SELECT nombre_raw, fuente, at_time FROM partes_aprendizaje
  ),
  agrupadas AS (
    SELECT
      public.normalizar_nombre(nombre_raw) AS nombre_norm,
      (array_agg(nombre_raw ORDER BY length(nombre_raw) DESC))[1] AS nombre_display,
      count(*)::int AS apariciones,
      array_agg(DISTINCT fuente) AS fuentes,
      max(at_time) AS ultima_aparicion
    FROM todas
    WHERE length(btrim(nombre_raw)) >= 4
    GROUP BY public.normalizar_nombre(nombre_raw)
  )
  SELECT a.nombre_norm, a.nombre_display, a.apariciones, a.fuentes, a.ultima_aparicion
  FROM agrupadas a
  WHERE a.apariciones >= p_min_apariciones
    AND NOT EXISTS (
      SELECT 1 FROM public.contactos_profesionales c
      WHERE c.deleted_at IS NULL
        AND (c.owner_id = v_uid OR c.scope = 'universal')
        AND (c.nombre_normalizado = a.nombre_norm OR a.nombre_norm = ANY(c.alias_normalizados))
    )
  ORDER BY a.apariciones DESC, a.ultima_aparicion DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.personas_sin_contacto(int, int) TO authenticated;

COMMENT ON FUNCTION public.personas_sin_contacto IS
  'Devuelve nombres frecuentes en audiencias y aprendizajes que aún no tienen un contacto profesional registrado. Sugiere al usuario qué cargar primero.';

-- ============================================================
-- Migración 063: dedupe + consolidación de aprendizajes (cron diario)
--
-- Capa 3 del aprendizaje real: en lugar de acumular duplicados, el
-- extractor dedupa antes de insertar. Si el patrón nuevo se parece >=70%
-- a uno ya aprobado, INCREMENT observed_in_cases del existente. Eso
-- modela "el sistema confirmó este patrón en otro caso".
--
-- Cron diario promueve confidence según observed_in_cases:
--   baja → media a partir de 3 casos
--   media → alta a partir de 7 casos
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.aprendizaje_dedupe_o_incrementar(
  p_owner_id     uuid,
  p_target_kind  text,
  p_contenido    text,
  p_threshold    real DEFAULT 0.7
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_match_id uuid;
BEGIN
  SELECT id INTO v_match_id
  FROM public.aprendizajes_rulebook
  WHERE owner_id = p_owner_id
    AND target_kind = p_target_kind
    AND is_active = true
    AND proposed = false
    AND similarity(contenido, p_contenido) >= p_threshold
  ORDER BY similarity(contenido, p_contenido) DESC
  LIMIT 1;

  IF v_match_id IS NOT NULL THEN
    UPDATE public.aprendizajes_rulebook
    SET observed_in_cases = observed_in_cases + 1, updated_at = now()
    WHERE id = v_match_id;
  END IF;
  RETURN v_match_id;
END $$;

GRANT EXECUTE ON FUNCTION public.aprendizaje_dedupe_o_incrementar(uuid, text, text, real) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consolidar_aprendizajes()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_to_media int := 0; v_to_alta int := 0;
BEGIN
  WITH upd AS (
    UPDATE public.aprendizajes_rulebook
    SET confidence = 'media', updated_at = now()
    WHERE confidence = 'baja' AND proposed = false AND is_active = true
      AND observed_in_cases >= 3
    RETURNING 1
  ) SELECT COUNT(*) INTO v_to_media FROM upd;

  WITH upd AS (
    UPDATE public.aprendizajes_rulebook
    SET confidence = 'alta', updated_at = now()
    WHERE confidence = 'media' AND proposed = false AND is_active = true
      AND observed_in_cases >= 7
    RETURNING 1
  ) SELECT COUNT(*) INTO v_to_alta FROM upd;

  RETURN jsonb_build_object(
    'promoted_to_media', v_to_media,
    'promoted_to_alta', v_to_alta,
    'ran_at', now()
  );
END $$;

GRANT EXECUTE ON FUNCTION public.consolidar_aprendizajes() TO service_role;

-- Cron diario 03:00 Argentina (06:00 UTC)
DO $$ BEGIN
  PERFORM cron.unschedule('consolidar-aprendizajes-diario');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'consolidar-aprendizajes-diario',
  '0 6 * * *',
  $cron$SELECT public.consolidar_aprendizajes();$cron$
);

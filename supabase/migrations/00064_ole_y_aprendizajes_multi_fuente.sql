-- ============================================================
-- Migración 064: reacción "olé" + aprendizaje multi-fuente
--
-- Nuevas señales de feedback del abogado para que el sistema aprenda:
-- - sae_movements.is_ole: tercer marcador (después de is_key/is_audiencia)
--   para que el abogado pueda decir "esta actuación me gusta / la quiero
--   recordar / es ejemplar". El sistema infiere patrones desde lo marcado.
--
-- Nuevas RPCs de extracción (corren con el cron diario aprendizajes-diarios):
-- - extraer_patrones_citas(): patrones tipo "para tipo de proceso X, citás
--   recurrentemente el doc Y" desde escrito_citas.
-- - extraer_patrones_ole(): patrones tipo "para juez/fuero X, las
--   actuaciones que marcás con olé son del tipo Y".
-- ============================================================

ALTER TABLE public.sae_movements
  ADD COLUMN IF NOT EXISTS is_ole boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_sae_movements_is_ole
  ON public.sae_movements (expediente_id) WHERE is_ole = true;

COMMENT ON COLUMN public.sae_movements.is_ole IS
  'Reacción "olé" del abogado: actuación que considera ejemplar o relevante para recordar. Distinto de is_key (clave procesal del expediente): is_ole es una señal de aprecio reusable que alimenta el aprendizaje cross-expedientes.';

CREATE OR REPLACE FUNCTION public.marcar_ole(
  p_movement_id uuid,
  p_ole         boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.sae_movements m
    JOIN public.expedientes e ON e.id = m.expediente_id
    WHERE m.id = p_movement_id
      AND (
        e.created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.expediente_miembros em
                   WHERE em.expediente_id = e.id AND em.profile_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.profiles p
                   WHERE p.id = auth.uid() AND p.rol IN ('ADMIN','DIRECTOR'))
      )
  ) THEN
    RAISE EXCEPTION 'Sin permisos sobre este movimiento' USING ERRCODE = '42501';
  END IF;
  UPDATE public.sae_movements SET is_ole = p_ole WHERE id = p_movement_id;
END $$;

GRANT EXECUTE ON FUNCTION public.marcar_ole(uuid, boolean) TO authenticated;

-- extraer_patrones_citas: detecta combinaciones recurrentes user/tipo/doc
CREATE OR REPLACE FUNCTION public.extraer_patrones_citas(
  p_user_id    uuid DEFAULT NULL,
  p_min_count  int  DEFAULT 3,
  p_dias_atras int  DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_propuestos int := 0; v_confirmados int := 0;
  r record;
  v_target_kind text; v_target_ref text;
  v_contenido text; v_match_id uuid;
BEGIN
  FOR r IN
    SELECT esc.user_id, esc.tipo AS tipo_escrito, e.fuero, e.tipo_proceso_id,
           ec.documento_id, nd.titulo AS doc_titulo, nd.tipo AS doc_tipo, nd.numero AS doc_numero,
           COUNT(*) AS veces
    FROM public.escrito_citas ec
    JOIN public.escritos esc ON esc.id = ec.escrito_id
    JOIN public.expedientes e ON e.id = esc.expediente_id
    JOIN public.normativa_documentos nd ON nd.id = ec.documento_id
    WHERE ec.created_at > now() - (p_dias_atras || ' days')::interval
      AND esc.estado IN ('firmado','presentado_sae','presentado')
      AND (p_user_id IS NULL OR esc.user_id = p_user_id)
    GROUP BY esc.user_id, esc.tipo, e.fuero, e.tipo_proceso_id, ec.documento_id, nd.titulo, nd.tipo, nd.numero
    HAVING COUNT(*) >= p_min_count
  LOOP
    IF r.tipo_proceso_id IS NOT NULL THEN v_target_kind := 'tipo_proceso'; v_target_ref := NULL;
    ELSIF r.fuero IS NOT NULL THEN v_target_kind := 'fuero'; v_target_ref := r.fuero;
    ELSE v_target_kind := 'general'; v_target_ref := NULL; END IF;

    v_contenido := 'En escritos de tipo "' || r.tipo_escrito || '"' ||
                   COALESCE(' del fuero ' || r.fuero, '') ||
                   ' citás recurrentemente: ' || r.doc_titulo ||
                   COALESCE(' (' || r.doc_tipo || ' ' || r.doc_numero || ')', '') ||
                   ' — confirmado en ' || r.veces || ' escritos recientes.';

    SELECT public.aprendizaje_dedupe_o_incrementar(
      r.user_id, v_target_kind, v_contenido, 0.75
    ) INTO v_match_id;

    IF v_match_id IS NOT NULL THEN v_confirmados := v_confirmados + 1; CONTINUE; END IF;

    INSERT INTO public.aprendizajes_rulebook (
      scope, owner_id, target_kind, target_ref_text, tipo_proceso_id,
      contenido, confidence, observed_in_cases, is_active, proposed,
      source_diff, created_by
    ) VALUES (
      'personal', r.user_id, v_target_kind, v_target_ref, r.tipo_proceso_id,
      v_contenido, 'baja', r.veces, true, true,
      jsonb_build_object('tipo','patron_citas','documento_id', r.documento_id, 'veces', r.veces),
      r.user_id
    );
    v_propuestos := v_propuestos + 1;
  END LOOP;

  RETURN jsonb_build_object('fuente','citas','nuevos_propuestos',v_propuestos,'confirmados_existentes',v_confirmados,'ran_at',now());
END $$;

GRANT EXECUTE ON FUNCTION public.extraer_patrones_citas(uuid, int, int) TO service_role;

-- extraer_patrones_ole: detecta combinaciones recurrentes de actuaciones olé
CREATE OR REPLACE FUNCTION public.extraer_patrones_ole(
  p_user_id    uuid DEFAULT NULL,
  p_min_count  int  DEFAULT 2,
  p_dias_atras int  DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_propuestos int := 0; v_confirmados int := 0;
  r record;
  v_target_kind text; v_target_ref text;
  v_contenido text; v_match_id uuid; v_owner uuid;
BEGIN
  FOR r IN
    SELECT e.created_by AS owner_id, e.fuero, e.tipo_proceso_id,
           m.tipo_movimiento AS tipo_mov,
           COUNT(*) AS veces,
           string_agg(DISTINCT LEFT(m.titulo, 100), ' / ') AS ejemplos
    FROM public.sae_movements m
    JOIN public.expedientes e ON e.id = m.expediente_id
    WHERE m.is_ole = true
      AND m.fecha > (now() - (p_dias_atras || ' days')::interval)::date
      AND (p_user_id IS NULL OR e.created_by = p_user_id)
    GROUP BY e.created_by, e.fuero, e.tipo_proceso_id, m.tipo_movimiento
    HAVING COUNT(*) >= p_min_count
  LOOP
    v_owner := r.owner_id;
    IF r.tipo_proceso_id IS NOT NULL THEN v_target_kind := 'tipo_proceso'; v_target_ref := NULL;
    ELSIF r.fuero IS NOT NULL THEN v_target_kind := 'fuero'; v_target_ref := r.fuero;
    ELSE v_target_kind := 'general'; v_target_ref := NULL; END IF;

    v_contenido := 'Marcaste con "olé" ' || r.veces || ' actuaciones de tipo "' ||
                   r.tipo_mov || '"' || COALESCE(' en el fuero ' || r.fuero, '') ||
                   '. Patrón: vale la pena prestar atención a este tipo de movimiento en casos similares. Ejemplos: ' ||
                   LEFT(r.ejemplos, 200);

    SELECT public.aprendizaje_dedupe_o_incrementar(v_owner, v_target_kind, v_contenido, 0.75) INTO v_match_id;

    IF v_match_id IS NOT NULL THEN v_confirmados := v_confirmados + 1; CONTINUE; END IF;

    INSERT INTO public.aprendizajes_rulebook (
      scope, owner_id, target_kind, target_ref_text, tipo_proceso_id,
      contenido, confidence, observed_in_cases, is_active, proposed,
      source_diff, created_by
    ) VALUES (
      'personal', v_owner, v_target_kind, v_target_ref, r.tipo_proceso_id,
      v_contenido, 'baja', r.veces, true, true,
      jsonb_build_object('tipo','patron_ole','tipo_movimiento', r.tipo_mov, 'veces', r.veces),
      v_owner
    );
    v_propuestos := v_propuestos + 1;
  END LOOP;

  RETURN jsonb_build_object('fuente','ole','nuevos_propuestos',v_propuestos,'confirmados_existentes',v_confirmados,'ran_at',now());
END $$;

GRANT EXECUTE ON FUNCTION public.extraer_patrones_ole(uuid, int, int) TO service_role;

-- Reemplazar el cron diario para correr los 3 jobs en secuencia
DO $$ BEGIN PERFORM cron.unschedule('consolidar-aprendizajes-diario'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('aprendizajes-diarios'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'aprendizajes-diarios',
  '0 6 * * *',
  $cron$
    SELECT public.extraer_patrones_citas();
    SELECT public.extraer_patrones_ole();
    SELECT public.consolidar_aprendizajes();
  $cron$
);

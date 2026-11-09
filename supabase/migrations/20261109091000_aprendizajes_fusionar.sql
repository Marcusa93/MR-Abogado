-- Fusiona varios aprendizajes en uno: conserva una fila con el texto fusionado
-- y la suma de observaciones, y desactiva el resto. Solo el dueño o la dirección.
CREATE OR REPLACE FUNCTION public.aprendizajes_fusionar(
  p_ids uuid[], p_contenido text, p_ambito text DEFAULT NULL, p_aprobar boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_keep uuid;
  v_obs int;
  v_aprobado boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF coalesce(array_length(p_ids, 1), 0) < 2 THEN RAISE EXCEPTION 'Hacen falta al menos dos aprendizajes'; END IF;
  IF coalesce(trim(p_contenido), '') = '' THEN RAISE EXCEPTION 'Falta el texto de la regla'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.aprendizajes_rulebook
    WHERE id = ANY (p_ids) AND NOT (owner_id = auth.uid() OR public.is_director())
  ) THEN RAISE EXCEPTION 'Sin permisos sobre alguno de los aprendizajes'; END IF;

  -- Se conserva preferentemente uno ya aprobado
  SELECT id INTO v_keep FROM public.aprendizajes_rulebook
  WHERE id = ANY (p_ids) ORDER BY proposed ASC, observed_in_cases DESC, created_at ASC LIMIT 1;
  SELECT coalesce(sum(observed_in_cases), 0), bool_or(NOT proposed) INTO v_obs, v_aprobado
  FROM public.aprendizajes_rulebook WHERE id = ANY (p_ids);

  UPDATE public.aprendizajes_rulebook SET
    contenido = trim(p_contenido),
    target_ref_text = coalesce(nullif(trim(p_ambito), ''), target_ref_text),
    observed_in_cases = greatest(v_obs, 1),
    confidence = CASE WHEN v_obs >= 3 THEN 'alta' WHEN v_obs = 2 THEN 'media' ELSE confidence END,
    proposed = CASE WHEN p_aprobar OR v_aprobado THEN false ELSE proposed END,
    is_active = true,
    updated_at = now()
  WHERE id = v_keep;

  UPDATE public.aprendizajes_rulebook SET is_active = false, updated_at = now()
  WHERE id = ANY (p_ids) AND id <> v_keep;

  RETURN v_keep;
END $$;
GRANT EXECUTE ON FUNCTION public.aprendizajes_fusionar(uuid[], text, text, boolean) TO authenticated;

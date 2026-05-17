-- ============================================================
-- Migración 047: Snooze para sae_notificaciones.
--
-- Las alertas internas ya tienen `pospuesta_hasta` + RPC posponer_alerta
-- desde la migración 005. Acá agregamos el equivalente para SAE.
-- ============================================================

ALTER TABLE public.sae_notificaciones
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz;

COMMENT ON COLUMN public.sae_notificaciones.snoozed_until IS
  'Si está seteado y es futuro, la notif no aparece en el feed hasta esa fecha.';

CREATE INDEX IF NOT EXISTS sae_notificaciones_snoozed_idx
  ON public.sae_notificaciones (profile_id, snoozed_until)
  WHERE snoozed_until IS NOT NULL;

-- RPC: postergar una notif SAE hasta una fecha.
CREATE OR REPLACE FUNCTION public.snooze_sae_notif(
  p_notif_id uuid,
  p_until timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.sae_notificaciones
  SET snoozed_until = p_until
  WHERE id = p_notif_id
    AND profile_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found_or_forbidden');
  END IF;

  RETURN jsonb_build_object('success', true, 'snoozed_until', p_until);
END;
$$;

COMMENT ON FUNCTION public.snooze_sae_notif IS
  'Posterga una notif SAE del propio user hasta el timestamp indicado.';

-- También para alertas internas: la RPC posponer_alerta existente usa
-- p_hasta::date. Agregamos una versión con timestamptz para precisión
-- horaria (ej. "recordar en 1 hora").
CREATE OR REPLACE FUNCTION public.posponer_alerta_ts(
  p_alerta_id uuid,
  p_hasta timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.alertas
  SET estado = 'POSPUESTA',
      pospuesta_hasta = p_hasta::date,
      snoozed_until = p_hasta
  WHERE id = p_alerta_id
    AND (destinatario_id = auth.uid() OR public.is_admin());

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found_or_forbidden');
  END IF;

  RETURN jsonb_build_object('success', true, 'snoozed_until', p_hasta);
END;
$$;

-- Columna snoozed_until en alertas para precisión horaria
-- (pospuesta_hasta era date, no tenía hora).
ALTER TABLE public.alertas
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz;

COMMENT ON COLUMN public.alertas.snoozed_until IS
  'Snooze con precisión horaria. Complementa pospuesta_hasta (date) para casos como "recordar en 1 hora".';

CREATE INDEX IF NOT EXISTS alertas_snoozed_idx
  ON public.alertas (destinatario_id, snoozed_until)
  WHERE snoozed_until IS NOT NULL;

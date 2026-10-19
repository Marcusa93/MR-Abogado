-- Procuración: plazos desde el casillero y aprendizaje de correcciones.
--
-- 1. El plazo corre desde que la notificación se deposita en el casillero
--    (sae_notificaciones.fecha_emision), no desde la fecha de la actuación.
--    base_plazo = 'casillero' cuando se encontró la notificación; 'actuacion'
--    cuando no (vencimiento estimado, se recalcula si la notificación aparece).
-- 2. Feedback del abogado sobre cada decisión del procurador. Las correcciones
--    se le pasan al modelo como ejemplos en las corridas siguientes.

ALTER TABLE public.procuracion_eventos
  ADD COLUMN IF NOT EXISTS base_plazo text CHECK (base_plazo IN ('casillero', 'actuacion')),
  ADD COLUMN IF NOT EXISTS fecha_notificacion date,
  ADD COLUMN IF NOT EXISTS notificacion_id uuid REFERENCES public.sae_notificaciones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS feedback text CHECK (feedback IN ('correcto', 'incorrecto')),
  ADD COLUMN IF NOT EXISTS feedback_nota text,
  ADD COLUMN IF NOT EXISTS feedback_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS feedback_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_procuracion_eventos_feedback
  ON public.procuracion_eventos(feedback_at DESC) WHERE feedback = 'incorrecto';

-- La tabla no tiene policy de UPDATE (solo escribe la service role): el
-- feedback entra por esta RPC, que solo toca las columnas de feedback.
CREATE OR REPLACE FUNCTION public.procuracion_dar_feedback(p_evento_id uuid, p_correcto boolean, p_nota text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expediente uuid;
BEGIN
  SELECT expediente_id INTO v_expediente FROM public.procuracion_eventos WHERE id = p_evento_id;
  IF v_expediente IS NULL OR NOT public.can_view_expediente(v_expediente) THEN
    RAISE EXCEPTION 'Evento no encontrado o sin permisos';
  END IF;
  IF NOT p_correcto AND coalesce(trim(p_nota), '') = '' THEN
    RAISE EXCEPTION 'Contá qué estaba mal para que el procurador aprenda';
  END IF;
  UPDATE public.procuracion_eventos
     SET feedback = CASE WHEN p_correcto THEN 'correcto' ELSE 'incorrecto' END,
         feedback_nota = CASE WHEN p_correcto THEN NULL ELSE left(trim(p_nota), 1000) END,
         feedback_por = auth.uid(),
         feedback_at = now()
   WHERE id = p_evento_id;
END;
$$;

REVOKE ALL ON FUNCTION public.procuracion_dar_feedback(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.procuracion_dar_feedback(uuid, boolean, text) TO authenticated;

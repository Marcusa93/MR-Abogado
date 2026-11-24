-- Ingesta desde el sitio público (marcorossi.com.ar).
-- Las reservas de Cal.com y el formulario de contacto entran como consultas
-- vía la edge function `ingesta-web`. cal_booking_uid vincula la consulta con
-- la reserva: sirve para reprogramaciones/cancelaciones y para que un webhook
-- repetido no duplique la consulta.

ALTER TABLE public.consultas
  ADD COLUMN IF NOT EXISTS cal_booking_uid text;

CREATE UNIQUE INDEX IF NOT EXISTS consultas_cal_booking_uid_key
  ON public.consultas (cal_booking_uid)
  WHERE cal_booking_uid IS NOT NULL;

-- Búsqueda de consulta abierta de la misma persona (deduplicación por email).
CREATE INDEX IF NOT EXISTS idx_consultas_email_lower
  ON public.consultas (lower(email))
  WHERE email IS NOT NULL;

COMMENT ON COLUMN public.consultas.cal_booking_uid IS
  'UID de la reserva de Cal.com (sitio web) vinculada a la consulta.';

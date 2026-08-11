-- Tiempo en estado: cuándo se hizo la última transición de estado
ALTER TABLE public.consultas
  ADD COLUMN IF NOT EXISTS estado_changed_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS recordatorio_enviado_at timestamptz;

-- Backfill: arrancar el reloj desde ahora para todas las existentes
UPDATE public.consultas
  SET estado_changed_at = now()
  WHERE estado_changed_at IS NULL;

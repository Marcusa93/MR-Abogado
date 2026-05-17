-- ============================================================
-- Migración 048: Tabla de telemetría de dispatches de notificación.
--
-- Cada vez que dispatch-alert-notification intenta mandar un push o email
-- registramos una fila acá. Sirve para:
--   1. Idempotencia: antes de mandar, chequeamos si ya hay un success
--      para (alerta_id, channel). Si sí, skip.
--   2. UI de configuración: mostrar "último push: OK hace 2 hs" o
--      "último email: rechazado por bounce".
--   3. Debugging: tabla append-only con motivo de fallo.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notif_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alerta_id uuid REFERENCES public.alertas(id) ON DELETE CASCADE,
  sae_notif_id uuid REFERENCES public.sae_notificaciones(id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('push', 'email')),
  status text NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.notif_dispatches IS
  'Log append-only de cada intento de dispatch (push/email) por alerta o notif SAE. Habilita idempotencia y debugging.';

-- Index para lookup rápido por usuario (UI de configuración).
CREATE INDEX IF NOT EXISTS notif_dispatches_user_idx
  ON public.notif_dispatches (usuario_id, attempted_at DESC);

-- Index parcial para idempotencia: lookup por (alerta_id, channel) entre success.
-- No es UNIQUE porque puede haber múltiples failed para el mismo alerta+channel
-- (reintentos). Pero antes de mandar, chequeamos si EXISTS un success.
CREATE INDEX IF NOT EXISTS notif_dispatches_alerta_success_idx
  ON public.notif_dispatches (alerta_id, channel)
  WHERE status = 'success' AND alerta_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS notif_dispatches_sae_success_idx
  ON public.notif_dispatches (sae_notif_id, channel)
  WHERE status = 'success' AND sae_notif_id IS NOT NULL;

-- RLS: solo el dueño puede leer.
ALTER TABLE public.notif_dispatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY notif_dispatches_own_select ON public.notif_dispatches
  FOR SELECT
  USING (usuario_id = auth.uid());

-- Solo service_role escribe (vía edge function). No hay policy de INSERT
-- para auth.uid() — las inserciones desde clientes están bloqueadas.

-- ─── Helper RPC: leer último dispatch por canal ────────────────────
-- Útil para la UI de /configuracion ("último push: hace 2h, OK").
CREATE OR REPLACE FUNCTION public.last_notif_dispatch(p_channel text)
RETURNS TABLE (
  status text,
  reason text,
  attempted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT status, reason, attempted_at
  FROM public.notif_dispatches
  WHERE usuario_id = auth.uid()
    AND channel = p_channel
  ORDER BY attempted_at DESC
  LIMIT 1;
$$;

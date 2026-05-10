-- ============================================================
-- Marco Rossi Estudio Jurídico - Migración 018: Push Subscriptions
-- Suscripciones Web Push (VAPID) por usuario/dispositivo.
-- Soporta Chrome Android, Safari macOS/iOS (PWA instalada), etc.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint        text        NOT NULL UNIQUE,
  p256dh_key      text        NOT NULL,
  auth_key        text        NOT NULL,
  user_agent      text,
  platform        text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_used_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.push_subscriptions IS
  'Web Push subscriptions (VAPID). Cada fila = un dispositivo/browser suscripto.';
COMMENT ON COLUMN public.push_subscriptions.endpoint IS
  'URL única del push service (FCM para Chrome/Android, APNs para Safari/iOS).';
COMMENT ON COLUMN public.push_subscriptions.platform IS
  'Origen declarado por el cliente: "android-chrome", "ios-safari", "desktop", etc.';

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions (user_id);

-- -----------------------------------------------------------------------
-- RLS: cada usuario gestiona sus propias suscripciones.
-- -----------------------------------------------------------------------
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_select_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_select_own
  ON public.push_subscriptions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS push_subscriptions_insert_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_insert_own
  ON public.push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_subscriptions_update_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_update_own
  ON public.push_subscriptions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_subscriptions_delete_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_delete_own
  ON public.push_subscriptions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

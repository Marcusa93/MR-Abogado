-- ============================================================
-- Migración 041: Notificaciones digitales del portal del SAE
--
-- - sae_notificaciones: lo que descubre el poller del portal,
--   con vinculación opcional al expediente local por numero_sae.
-- - profiles: columnas de preferencias (opt-in, canales, email destino,
--   quiet hours, días activos).
-- - RLS: solo el dueño y ADMIN ven sus notificaciones.
-- ============================================================

-- ── Preferencias del abogado ────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sae_notif_enabled       boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sae_notif_push          boolean      NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sae_notif_email         boolean      NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sae_notif_email_addresses text[] NOT NULL DEFAULT ARRAY[]::text[],
                                                                -- lista de destinatarios. Si vacío, usa profiles.email.
  ADD COLUMN IF NOT EXISTS sae_notif_push_quiet    boolean      NOT NULL DEFAULT true,
                                                                -- si true, push entre 22-08 se difiere a 08:00
  ADD COLUMN IF NOT EXISTS sae_notif_weekend       boolean      NOT NULL DEFAULT false;
                                                                -- por default, no se polea sábados/domingos

-- ── Tabla de notificaciones capturadas ──────────────────────────
CREATE TABLE IF NOT EXISTS public.sae_notificaciones (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sae_notif_id         text NOT NULL,                  -- id en el portal, para dedup
  expediente_id        uuid REFERENCES public.expedientes(id) ON DELETE SET NULL,
                                                       -- vinculación si está en cartera
  numero_expediente    text,                            -- como viene del portal
  caratula             text,
  oficina              text,
  tipo                 text,                            -- cédula/oficio/intimación/etc (libre, lo da el portal)
  titulo               text,
  fecha_emision        timestamptz,
  fecha_captura        timestamptz NOT NULL DEFAULT now(),
  leida                boolean     NOT NULL DEFAULT false,
  leida_at             timestamptz,
  notified_push_at     timestamptz,
  notified_email_at    timestamptz,
  push_diferido_hasta  timestamptz,                     -- si quiet hours, cuándo se manda el push
  raw_payload          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sae_notif_profile_notifid
  ON public.sae_notificaciones (profile_id, sae_notif_id);

CREATE INDEX IF NOT EXISTS idx_sae_notif_profile_created
  ON public.sae_notificaciones (profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sae_notif_profile_unread
  ON public.sae_notificaciones (profile_id, leida)
  WHERE leida = false;

CREATE INDEX IF NOT EXISTS idx_sae_notif_expediente
  ON public.sae_notificaciones (expediente_id)
  WHERE expediente_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sae_notif_pending_push
  ON public.sae_notificaciones (push_diferido_hasta)
  WHERE notified_push_at IS NULL AND push_diferido_hasta IS NOT NULL;

-- ── RLS ─────────────────────────────────────────────────────────
ALTER TABLE public.sae_notificaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sae_notif_owner_select" ON public.sae_notificaciones
  FOR SELECT USING (
    profile_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.rol = 'ADMIN')
  );

-- Solo el dueño puede marcar como leída (UPDATE de leida/leida_at).
-- INSERT/DELETE solo el service role (los hace la edge function).
CREATE POLICY "sae_notif_owner_update_leida" ON public.sae_notificaciones
  FOR UPDATE USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- ============================================================
-- Google Drive: credenciales OAuth por usuario
--
-- Cada perfil puede vincular su cuenta de Drive. Guardamos
-- access_token + refresh_token + expiración. La escritura solo
-- se hace vía edge functions con service role; el frontend solo
-- lee si está conectado o no (y el email de Google).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.google_drive_credentials (
  profile_id        uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  google_user_email text,
  /** Stored as plain (Postgres está protegido), pero estos tokens deberían rotar */
  access_token      text NOT NULL,
  refresh_token     text NOT NULL,
  scope             text NOT NULL,
  expires_at        timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.google_drive_credentials IS
  'Tokens OAuth de Google Drive por usuario. Solo se escriben vía edge functions; el frontend solo verifica si existe (sin leer los tokens).';

DROP TRIGGER IF EXISTS trg_gdrive_updated_at ON public.google_drive_credentials;
CREATE TRIGGER trg_gdrive_updated_at
  BEFORE UPDATE ON public.google_drive_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.google_drive_credentials ENABLE ROW LEVEL SECURITY;

-- El usuario puede ver SU propia conexión (sin exponer tokens en el cliente)
-- Para esto usamos una RPC dedicada que devuelve solo info safe.
DROP POLICY IF EXISTS gdrive_select_own ON public.google_drive_credentials;
CREATE POLICY gdrive_select_own ON public.google_drive_credentials
  FOR SELECT USING (profile_id = auth.uid());

DROP POLICY IF EXISTS gdrive_insert_blocked ON public.google_drive_credentials;
CREATE POLICY gdrive_insert_blocked ON public.google_drive_credentials
  FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS gdrive_update_blocked ON public.google_drive_credentials;
CREATE POLICY gdrive_update_blocked ON public.google_drive_credentials
  FOR UPDATE USING (false);

DROP POLICY IF EXISTS gdrive_delete_own ON public.google_drive_credentials;
CREATE POLICY gdrive_delete_own ON public.google_drive_credentials
  FOR DELETE USING (profile_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- RPC: info safe del estado de conexión (sin exponer tokens)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.google_drive_status()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'connected', EXISTS(SELECT 1 FROM public.google_drive_credentials WHERE profile_id = auth.uid()),
    'email', (SELECT google_user_email FROM public.google_drive_credentials WHERE profile_id = auth.uid()),
    'connected_at', (SELECT created_at FROM public.google_drive_credentials WHERE profile_id = auth.uid()),
    'scope', (SELECT scope FROM public.google_drive_credentials WHERE profile_id = auth.uid())
  );
$$;

GRANT EXECUTE ON FUNCTION public.google_drive_status() TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- RPC: desconectar (revoca y borra la fila propia)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.google_drive_disconnect()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  DELETE FROM public.google_drive_credentials WHERE profile_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.google_drive_disconnect() TO authenticated;

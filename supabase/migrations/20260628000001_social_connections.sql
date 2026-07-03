-- Conexiones a redes sociales por usuario (tokens OAuth). Cada director conecta
-- su propia cuenta. Los tokens los escriben/leen las edge functions con
-- service_role; el frontend solo consulta si está conectado (sin el token).

CREATE TABLE IF NOT EXISTS public.social_connections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider      text NOT NULL CHECK (provider IN ('linkedin', 'twitter', 'instagram')),
  account_id    text,
  account_name  text,
  access_token  text NOT NULL,
  refresh_token text,
  expires_at    timestamptz,
  scope         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;

-- El usuario puede ver SU conexión (el frontend selecciona sólo columnas no
-- sensibles; el token nunca se manda al browser salvo que se pida explícito).
DROP POLICY IF EXISTS social_connections_select_own ON public.social_connections;
CREATE POLICY social_connections_select_own ON public.social_connections
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS social_connections_delete_own ON public.social_connections;
CREATE POLICY social_connections_delete_own ON public.social_connections
  FOR DELETE USING (user_id = auth.uid());

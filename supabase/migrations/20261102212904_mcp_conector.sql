-- Conector MCP para Claude (claude.ai): códigos y tokens OAuth, y quién puede conectarse.
-- Solo se guarda el hash de cada token. RLS sin políticas: únicamente el servidor accede.
CREATE TABLE IF NOT EXISTS public.mcp_oauth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('code', 'access', 'refresh')),
  family_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  redirect_uri text,
  code_challenge text,
  scope text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mcp_oauth_tokens_family_idx ON public.mcp_oauth_tokens (family_id);
CREATE INDEX IF NOT EXISTS mcp_oauth_tokens_expires_idx ON public.mcp_oauth_tokens (expires_at);
ALTER TABLE public.mcp_oauth_tokens ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.mcp_oauth_tokens IS 'Conector MCP: códigos y tokens OAuth (solo hashes). Para desconectar a alguien: poner revoked_at en sus filas.';

-- Quién puede conectar Claude. Empieza solo con Marco; los datos salen hacia su cuenta de Claude.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS acceso_mcp boolean NOT NULL DEFAULT false;
UPDATE public.profiles SET acceso_mcp = true WHERE id = 'ceb22752-726c-4377-8f40-2bdccc8c8bbb';

CREATE OR REPLACE FUNCTION public.proteger_columnas_perfil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rol_actor text;
BEGIN
  -- Service role / crons / funciones del sistema
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  IF NEW.tiene_acceso_caja IS DISTINCT FROM OLD.tiene_acceso_caja
     OR NEW.acceso_editorial IS DISTINCT FROM OLD.acceso_editorial
     OR NEW.editorial_aprueba IS DISTINCT FROM OLD.editorial_aprueba
     OR NEW.acceso_mcp IS DISTINCT FROM OLD.acceso_mcp THEN
    RAISE EXCEPTION 'No autorizado a cambiar accesos especiales' USING ERRCODE = '42501';
  END IF;

  IF NEW.rol IS DISTINCT FROM OLD.rol OR NEW.activo IS DISTINCT FROM OLD.activo THEN
    SELECT rol INTO v_rol_actor FROM public.profiles WHERE id = auth.uid();
    IF v_rol_actor IS NULL OR v_rol_actor NOT IN ('ADMIN', 'DIRECTOR') THEN
      RAISE EXCEPTION 'No autorizado a cambiar el rol o el estado del usuario' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- Migración 023: RPC helper para acceder al Vault desde edge functions
--
-- PostgREST no expone el schema vault, así que las edge functions no
-- pueden usar .schema('vault').from('decrypted_secrets') directamente.
-- Esta función corre dentro de Postgres (donde vault sí es accesible)
-- y la invocan las edge functions con serviceClient.rpc(...).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_sae_password(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id text;
  v_password  text;
BEGIN
  SELECT encrypted_secret INTO v_secret_id
  FROM public.sae_credentials
  WHERE profile_id = p_user_id AND provider = 'justucuman';

  IF v_secret_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_password
  FROM vault.decrypted_secrets
  WHERE id = v_secret_id::uuid;

  RETURN v_password;
END;
$$;

-- Solo el service role puede llamar esta función (desde edge functions)
REVOKE ALL ON FUNCTION public.get_sae_password FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_sae_password FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_sae_password TO service_role;

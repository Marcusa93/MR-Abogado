-- ============================================================
-- Migración 024: Simplificar almacenamiento de credencial SAE
--
-- SAErpado demostró que guardar la contraseña como base64 en la
-- columna encrypted_secret (protegida por RLS) es suficiente y
-- funciona. Vault no es necesario y el acceso desde edge functions
-- via PostgREST (.schema('vault')) no funciona.
--
-- Los usuarios deben re-ingresar sus credenciales SAE después
-- de esta migración (el valor anterior era un UUID de Vault).
-- ============================================================

CREATE OR REPLACE FUNCTION public.store_sae_credential(
  p_username text,
  p_password text,
  p_provider text DEFAULT 'justucuman'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  -- Encode password as base64 (misma técnica que SAErpado integration-secrets.ts)
  -- La columna está protegida por RLS; el service_role lo lee solo desde edge functions.
  INSERT INTO public.sae_credentials (
    profile_id, username, encrypted_secret, provider, status, last_error
  )
  VALUES (
    auth.uid(),
    p_username,
    encode(convert_to(p_password, 'UTF8'), 'base64'),
    p_provider,
    'pendiente',
    NULL
  )
  ON CONFLICT (profile_id, provider) DO UPDATE
  SET username         = EXCLUDED.username,
      encrypted_secret = EXCLUDED.encrypted_secret,
      status           = 'pendiente',
      last_error       = NULL,
      updated_at       = now();

  SELECT row_to_json(c) INTO v_result
  FROM (
    SELECT id, profile_id, username, provider, status,
           last_login_at, last_sync_at, last_error, created_at, updated_at
    FROM public.sae_credentials
    WHERE profile_id = auth.uid() AND provider = p_provider
  ) c;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.store_sae_credential TO authenticated;

-- Limpiar credenciales existentes (tenían UUID de Vault, ya no sirven)
-- El usuario deberá re-ingresar sus credenciales SAE
DELETE FROM public.sae_credentials WHERE provider = 'justucuman';

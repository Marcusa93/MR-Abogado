-- ============================================================
-- Migración 021: RPCs para manejo de credenciales SAE
-- Usa Supabase Vault (pgsodium) para cifrado server-side.
-- No requiere edge functions ni claves externas.
-- ============================================================

-- ─── store_sae_credential ────────────────────────────────────────────────────
-- Guarda (o actualiza) la contraseña SAE cifrada en el Vault.
-- El cliente envía el password en texto plano; el Vault lo cifra internamente.
-- Retorna la fila de sae_credentials sin el encrypted_secret.

CREATE OR REPLACE FUNCTION public.store_sae_credential(
  p_username text,
  p_password text,
  p_provider text DEFAULT 'justucuman'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id   uuid;
  v_secret_name text;
  v_result      json;
BEGIN
  v_secret_name := 'sae_cred_' || auth.uid()::text || '_' || p_provider;

  -- Si ya existe un secreto en Vault para este usuario/provider, lo elimina primero
  SELECT id INTO v_secret_id
  FROM vault.secrets
  WHERE name = v_secret_name;

  IF v_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secret_id;
  END IF;

  -- Crea el nuevo secreto en Vault (cifrado automáticamente con pgsodium)
  v_secret_id := vault.create_secret(
    p_password,
    v_secret_name,
    'Contraseña SAE de ' || p_username
  );

  -- Upsert en sae_credentials (encrypted_secret guarda el id del secreto en Vault)
  INSERT INTO public.sae_credentials (
    profile_id, username, encrypted_secret, provider, status, last_error
  )
  VALUES (
    auth.uid(), p_username, v_secret_id::text, p_provider, 'pendiente', NULL
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

-- ─── delete_sae_credential ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_sae_credential(
  p_provider text DEFAULT 'justucuman'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id   uuid;
  v_secret_name text;
BEGIN
  v_secret_name := 'sae_cred_' || auth.uid()::text || '_' || p_provider;

  SELECT id INTO v_secret_id
  FROM vault.secrets
  WHERE name = v_secret_name;

  IF v_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secret_id;
  END IF;

  DELETE FROM public.sae_credentials
  WHERE profile_id = auth.uid() AND provider = p_provider;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_sae_credential TO authenticated;

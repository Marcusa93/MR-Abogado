-- ============================================================
-- Migración 045: Trigger AFTER INSERT en alertas → dispatch automático.
--
-- Reemplaza el dispatch fire-and-forget desde el cliente. Cualquier INSERT
-- en `alertas` ahora dispara la edge function dispatch-alert-notification
-- vía pg_net, asegurando que la notif salga aunque el cliente se cierre.
--
-- SETUP MANUAL (una sola vez, ver instrucciones al final):
--   1. SELECT vault.create_secret('https://<ref>.supabase.co/functions/v1/dispatch-alert-notification', 'dispatch_alert_url');
--   2. SELECT vault.create_secret('<SUPABASE_SERVICE_ROLE_KEY>', 'service_role_key');
-- ============================================================

-- pg_net para hacer HTTP requests desde Postgres (no bloqueante)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- vault ya viene activo en proyectos hosted; nos aseguramos
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- ─── Función que invoca la edge function ──────────────────────────
-- SECURITY DEFINER porque vault.decrypted_secrets requiere permisos altos.
-- La función se ejecuta como owner (postgres) sin importar quién dispare
-- el INSERT en alertas.
CREATE OR REPLACE FUNCTION public.notify_alert_dispatch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  dispatch_url text;
  svc_key text;
BEGIN
  -- Leer secrets de vault. Si faltan, log y salir sin romper el INSERT.
  SELECT decrypted_secret INTO dispatch_url
    FROM vault.decrypted_secrets WHERE name = 'dispatch_alert_url' LIMIT 1;
  SELECT decrypted_secret INTO svc_key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  IF dispatch_url IS NULL OR svc_key IS NULL THEN
    RAISE WARNING 'notify_alert_dispatch: vault secrets faltantes (dispatch_alert_url o service_role_key)';
    RETURN NEW;
  END IF;

  -- Disparar HTTP POST async (pg_net no bloquea la transacción).
  -- net.http_post devuelve un request_id; lo descartamos.
  PERFORM net.http_post(
    url := dispatch_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body := jsonb_build_object('alerta_id', NEW.id::text)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Nunca rompemos el INSERT por un fallo de notificación.
  RAISE WARNING 'notify_alert_dispatch error: %', SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_alert_dispatch() IS
  'Trigger handler que invoca dispatch-alert-notification edge function vía pg_net después de cada INSERT en alertas.';

-- Trigger
DROP TRIGGER IF EXISTS alertas_dispatch_notification ON public.alertas;
CREATE TRIGGER alertas_dispatch_notification
  AFTER INSERT ON public.alertas
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_alert_dispatch();

-- ─── Instrucciones manuales ───────────────────────────────────────
-- Después de aplicar esta migración, correr UNA SOLA VEZ en el SQL Editor
-- de Supabase (con permisos de service_role / dashboard):
--
--   SELECT vault.create_secret(
--     'https://<ref>.supabase.co/functions/v1/dispatch-alert-notification',
--     'dispatch_alert_url'
--   );
--   SELECT vault.create_secret(
--     '<service_role_key>',
--     'service_role_key'
--   );
--
-- Para rotar: SELECT vault.update_secret('<id>', 'nuevo_valor');
-- Para verificar: SELECT name FROM vault.decrypted_secrets;

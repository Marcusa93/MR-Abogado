-- El 'cron_secret' de Vault quedó desactualizado respecto de CRON_SECRET de las
-- functions (los crons que funcionan llevan el valor literal). tareas-telegram
-- lee primero 'functions_cron_secret' y, si no existe, 'cron_secret'.
--
-- Para activar los avisos, crear el secret con el mismo valor que CRON_SECRET:
--   SELECT vault.create_secret('<CRON_SECRET>', 'functions_cron_secret');

CREATE OR REPLACE FUNCTION public.functions_cron_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'functions_cron_secret' LIMIT 1),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
  )
$$;

-- Devuelve un secreto: nadie fuera de postgres/service_role puede llamarla.
REVOKE ALL ON FUNCTION public.functions_cron_secret() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tareas_telegram_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_body   jsonb;
  v_nuevos uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_nuevos := CASE
      WHEN cardinality(NEW.asignados) > 0 THEN NEW.asignados
      WHEN NEW.asignado_a IS NOT NULL THEN ARRAY[NEW.asignado_a]
      ELSE '{}'::uuid[]
    END;
    IF cardinality(v_nuevos) > 0 THEN
      v_body := jsonb_build_object('evento', 'asignada', 'tarea_id', NEW.id, 'nuevos', to_jsonb(v_nuevos));
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.estado = 'COMPLETADA' AND OLD.estado IS DISTINCT FROM 'COMPLETADA' THEN
      v_body := jsonb_build_object(
        'evento', 'completada',
        'tarea_id', NEW.id,
        'completada_por', coalesce(NEW.completada_por, auth.uid())
      );
    ELSIF NEW.asignados IS DISTINCT FROM OLD.asignados THEN
      SELECT coalesce(array_agg(x), '{}'::uuid[]) INTO v_nuevos
      FROM unnest(NEW.asignados) AS x
      WHERE NOT (x = ANY (coalesce(OLD.asignados, '{}'::uuid[])));
      IF cardinality(v_nuevos) > 0 THEN
        v_body := jsonb_build_object('evento', 'asignada', 'tarea_id', NEW.id, 'nuevos', to_jsonb(v_nuevos));
      END IF;
    END IF;
  END IF;

  IF v_body IS NOT NULL THEN
    PERFORM net.http_post(
      url := 'https://ftxpilbvjfxfkjkrbrnl.supabase.co/functions/v1/tareas-telegram',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', public.functions_cron_secret()
      ),
      body := v_body,
      timeout_milliseconds := 10000
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Un fallo de notificación nunca debe impedir crear/editar la tarea.
  RAISE WARNING 'tareas_telegram_notify: %', SQLERRM;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tareas-telegram-diario') THEN
    PERFORM cron.unschedule('tareas-telegram-diario');
  END IF;
END $$;

SELECT cron.schedule(
  'tareas-telegram-diario',
  '0 11 * * 1-5',
  $cron$
  SELECT net.http_post(
    url := 'https://ftxpilbvjfxfkjkrbrnl.supabase.co/functions/v1/tareas-telegram',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.functions_cron_secret()
    ),
    body := '{"evento":"diario"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);

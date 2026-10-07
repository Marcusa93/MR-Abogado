-- Tareas por Telegram:
--   1. Cada usuario puede vincular su chat de Telegram (profiles.telegram_chat_id)
--      mediante un código de un solo uso (telegram_link_codes) → /start <código>.
--   2. Trigger en tareas: al asignar o completar, dispara la function
--      tareas-telegram (aviso al asignado / aviso al creador).
--   3. Cron 08:00 AR (lun-vie): resumen diario de pendientes a cada vinculado.
--
-- Requiere el secret 'cron_secret' en Vault (ya usado por los otros crons).

-- ── 1. Vinculación ────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telegram_chat_id bigint UNIQUE;

CREATE TABLE IF NOT EXISTS public.telegram_link_codes (
  code        text PRIMARY KEY,
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Solo la service role (edge functions) lee/escribe códigos.
ALTER TABLE public.telegram_link_codes ENABLE ROW LEVEL SECURITY;

-- ── 2. Trigger de notificación ────────────────────────────────────────────────

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
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
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

DROP TRIGGER IF EXISTS tareas_telegram_notify ON public.tareas;
CREATE TRIGGER tareas_telegram_notify
  AFTER INSERT OR UPDATE OF estado, asignados ON public.tareas
  FOR EACH ROW EXECUTE FUNCTION public.tareas_telegram_notify();

-- ── 3. Resumen diario 08:00 AR (11:00 UTC), lunes a viernes ───────────────────

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
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body := '{"evento":"diario"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);

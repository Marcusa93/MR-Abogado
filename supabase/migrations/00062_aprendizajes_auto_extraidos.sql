-- ============================================================
-- Migración 062: auto-extracción de aprendizajes desde escritos
--
-- Capa 2 del aprendizaje real: cuando el abogado firma/presenta un escrito,
-- comparamos lo que generó la IA vs el texto final con sus correcciones,
-- y extraemos aprendizajes (patrones de estilo, preferencias, citas que
-- agrega/quita el abogado).
--
-- - escritos.contenido_original: snapshot inmutable del contenido al
--   momento de la generación IA. NUNCA se actualiza después. Sirve de
--   referencia para el diff.
-- - aprendizajes_rulebook.proposed: marca aprendizajes auto-extraídos
--   pendientes de revisión humana.
-- - aprendizajes_rulebook.source_escrito_id: FK al escrito que originó
--   el aprendizaje (trazabilidad).
-- - target_kind ahora acepta 'estilo' para patrones del abogado mismo.
-- ============================================================

ALTER TABLE public.escritos
  ADD COLUMN IF NOT EXISTS contenido_original jsonb;

COMMENT ON COLUMN public.escritos.contenido_original IS
  'Snapshot inmutable del contenido generado por la IA. Se llena al primer save desde escritos-generate. Sirve para diffear vs la versión final corregida por el abogado y extraer aprendizajes.';

ALTER TABLE public.aprendizajes_rulebook
  ADD COLUMN IF NOT EXISTS proposed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_escrito_id uuid REFERENCES public.escritos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_diff jsonb;

COMMENT ON COLUMN public.aprendizajes_rulebook.proposed IS
  'true = auto-extraído y pendiente de revisión humana. Se filtra para que la IA no use propuestas sin curar.';
COMMENT ON COLUMN public.aprendizajes_rulebook.source_escrito_id IS
  'Si el aprendizaje fue extraído de las correcciones del abogado sobre un escrito, link al escrito origen.';
COMMENT ON COLUMN public.aprendizajes_rulebook.source_diff IS
  'Diff resumido (before/after) del extracto del escrito. Útil para mostrar al user al revisarlo.';

CREATE INDEX IF NOT EXISTS idx_aprendizajes_proposed
  ON public.aprendizajes_rulebook (owner_id, created_at DESC)
  WHERE proposed = true AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_aprendizajes_source_escrito
  ON public.aprendizajes_rulebook (source_escrito_id)
  WHERE source_escrito_id IS NOT NULL;

ALTER TABLE public.aprendizajes_rulebook
  DROP CONSTRAINT IF EXISTS aprendizajes_rulebook_target_kind_check;
ALTER TABLE public.aprendizajes_rulebook
  ADD CONSTRAINT aprendizajes_rulebook_target_kind_check
  CHECK (target_kind IN ('juez','organismo','tipo_proceso','etapa_proceso','fuero','general','estilo'));

-- Trigger que dispara escrito-extraer-aprendizajes al firmar/presentar
CREATE OR REPLACE FUNCTION public.escrito_trigger_extraer_aprendizajes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_service_key text;
BEGIN
  IF NEW.estado NOT IN ('firmado','presentado_sae','presentado') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.estado = NEW.estado THEN RETURN NEW; END IF;
  IF NEW.contenido_original IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.aprendizajes_rulebook WHERE source_escrito_id = NEW.id) THEN
    RETURN NEW;
  END IF;
  SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_service_key IS NULL THEN
    RAISE WARNING '[escrito_trigger_extraer_aprendizajes] service_role_key faltante en vault';
    RETURN NEW;
  END IF;
  PERFORM net.http_post(
    url := 'https://ftxpilbvjfxfkjkrbrnl.supabase.co/functions/v1/escrito-extraer-aprendizajes',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_service_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'escrito_id', NEW.id::text,
      'on_behalf_of_user_id', NEW.user_id::text
    ),
    timeout_milliseconds := 60000
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_escrito_extraer_aprendizajes ON public.escritos;
CREATE TRIGGER trg_escrito_extraer_aprendizajes
  AFTER UPDATE OF estado ON public.escritos
  FOR EACH ROW EXECUTE FUNCTION public.escrito_trigger_extraer_aprendizajes();

DROP TRIGGER IF EXISTS trg_escrito_extraer_aprendizajes_insert ON public.escritos;
CREATE TRIGGER trg_escrito_extraer_aprendizajes_insert
  AFTER INSERT ON public.escritos
  FOR EACH ROW EXECUTE FUNCTION public.escrito_trigger_extraer_aprendizajes();

-- ============================================================
-- Migración 052: hash determinístico para deduplicar notif SAE.
--
-- Problema: usamos el verHref (permalink encriptado de Laravel)
-- como sae_notif_id, pero Laravel lo regenera cada request.
-- Resultado: cada poll detectaba todo como "nuevo" y disparaba
-- email + push otra vez. Confirmado en prod: 222 filas pero solo
-- 67 contenidos únicos.
--
-- Solución: notif_hash = SHA256 de campos estables (profile_id,
-- numero_expediente, fecha_emision, tipo, titulo, fuero). Unique
-- constraint en (profile_id, notif_hash). Cuando viene una notif
-- ya conocida, ON CONFLICT DO NOTHING evita la re-inserción y por
-- ende el re-envío de mail.
--
-- Trigger en vez de GENERATED column porque digest() de pgcrypto
-- es STABLE no IMMUTABLE (postgres rechaza generated cols con
-- funciones no immutables).
-- ============================================================

ALTER TABLE public.sae_notificaciones
  ADD COLUMN IF NOT EXISTS notif_hash text;

COMMENT ON COLUMN public.sae_notificaciones.notif_hash IS
  'Hash determinístico para deduplicar notifs cuando el permalink del portal Laravel cambia entre requests.';

-- Función que calcula el hash desde campos estables
CREATE OR REPLACE FUNCTION public.compute_sae_notif_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.notif_hash := encode(
    digest(
      NEW.profile_id::text || '|' ||
      COALESCE(NEW.numero_expediente, '') || '|' ||
      COALESCE(NEW.fecha_emision::text, '') || '|' ||
      COALESCE(NEW.tipo, '') || '|' ||
      COALESCE(NEW.titulo, '') || '|' ||
      COALESCE(NEW.raw_payload->>'fuero', ''),
      'sha256'
    ),
    'hex'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sae_notif_hash_trigger ON public.sae_notificaciones;
CREATE TRIGGER sae_notif_hash_trigger
  BEFORE INSERT OR UPDATE OF profile_id, numero_expediente, fecha_emision, tipo, titulo, raw_payload
  ON public.sae_notificaciones
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_sae_notif_hash();

-- Backfill: recalcular hash para filas existentes (sin notif_hash todavía)
UPDATE public.sae_notificaciones
SET notif_hash = encode(
  digest(
    profile_id::text || '|' ||
    COALESCE(numero_expediente, '') || '|' ||
    COALESCE(fecha_emision::text, '') || '|' ||
    COALESCE(tipo, '') || '|' ||
    COALESCE(titulo, '') || '|' ||
    COALESCE(raw_payload->>'fuero', ''),
    'sha256'
  ),
  'hex'
)
WHERE notif_hash IS NULL;

-- Borrar duplicados existentes (mantener el más antiguo por hash)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY profile_id, notif_hash
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.sae_notificaciones
)
DELETE FROM public.sae_notificaciones
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Unique constraint para que ON CONFLICT funcione en el insert del poll
CREATE UNIQUE INDEX IF NOT EXISTS sae_notif_unique_hash
  ON public.sae_notificaciones (profile_id, notif_hash);

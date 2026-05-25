-- ============================================================
-- Migración 054: cache + audit log para fuentes jurídicas externas
--
-- - legal_cache:        caché transparente de respuestas (SAIJ, InfoLEG, etc)
--                       con TTL por tool. Evita golpear la fuente externa
--                       en cada consulta.
-- - legal_lookup_logs:  log append-only de cada consulta (user, source, tool,
--                       status, latencia, error). Permite rate-limit y audit.
-- - RPCs: legal_lookup_recent_count(uid) y legal_cache_gc()
--
-- Esta migración fue aplicada vía MCP (apply_migration) el 2026-05-24.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.legal_cache (
  source      text NOT NULL,
  cache_key   text NOT NULL,
  tool        text NOT NULL,
  payload     jsonb NOT NULL,
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  hit_count   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (source, cache_key)
);

CREATE INDEX IF NOT EXISTS idx_legal_cache_expires_at
  ON public.legal_cache (expires_at);

CREATE TABLE IF NOT EXISTS public.legal_lookup_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid,
  source        text NOT NULL,
  tool          text NOT NULL,
  args          jsonb NOT NULL DEFAULT '{}'::jsonb,
  status        text NOT NULL,
  http_status   integer,
  latency_ms    integer,
  error_msg     text,
  result_count  integer,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_lookup_logs_user_time
  ON public.legal_lookup_logs (user_id, created_at DESC);

-- RPC: cuántas consultas hizo un user en el último minuto (rate-limit)
CREATE OR REPLACE FUNCTION public.legal_lookup_recent_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM public.legal_lookup_logs
  WHERE user_id = p_user_id AND created_at > now() - interval '1 minute';
$$;

GRANT EXECUTE ON FUNCTION public.legal_lookup_recent_count(uuid) TO authenticated;

-- RPC: cleanup oportunista del caché (llamado desde edge function con 1% prob)
CREATE OR REPLACE FUNCTION public.legal_cache_gc()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE deleted int;
BEGIN
  DELETE FROM public.legal_cache WHERE expires_at < now();
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

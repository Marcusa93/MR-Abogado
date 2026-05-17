-- ============================================================
-- Migración 049: Constancia legal de visualización de notif SAE.
--
-- Append-only log de cada vez que el usuario marca como leída una
-- notif SAE desde la app. Sirve como respaldo procesal: el abogado
-- puede acreditar fecha+hora+IP+device en que se enteró de la cédula,
-- lo cual da defensa frente a planteos de "debí enterarme antes".
--
-- Diseño:
--   - Append-only: nadie puede UPDATE ni DELETE. Solo INSERT desde
--     edge function (service_role).
--   - El user lee solo sus propios views.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sae_notif_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notif_id uuid NOT NULL REFERENCES public.sae_notificaciones(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  user_agent text,
  timezone text,
  -- Snapshot de campos clave de la notif al momento de la visualización.
  -- Si después se borra la notif, la constancia conserva el contexto.
  notif_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.sae_notif_views IS
  'Log append-only de visualizaciones de notificaciones SAE. Respaldo procesal: fecha+hora+IP+device de cuándo el abogado tomó conocimiento.';

CREATE INDEX IF NOT EXISTS sae_notif_views_notif_idx
  ON public.sae_notif_views (notif_id);

CREATE INDEX IF NOT EXISTS sae_notif_views_user_idx
  ON public.sae_notif_views (profile_id, viewed_at DESC);

-- RLS: solo el dueño lee. Nadie escribe directo (solo service_role).
ALTER TABLE public.sae_notif_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY sae_notif_views_own_select ON public.sae_notif_views
  FOR SELECT
  USING (profile_id = auth.uid());

-- No INSERT/UPDATE/DELETE policy → solo service_role puede escribir.
-- Esto da garantía de append-only: ni el dueño puede modificar.

-- ─── RPC: leer constancia de una notif ───────────────────────────
-- Si hay varias visualizaciones (raro), devuelve la primera (la legalmente
-- relevante: cuándo se enteró por primera vez).
CREATE OR REPLACE FUNCTION public.get_sae_notif_constancia(p_notif_id uuid)
RETURNS TABLE (
  view_id uuid,
  viewed_at timestamptz,
  ip text,
  user_agent text,
  timezone text,
  notif_snapshot jsonb,
  total_views bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT
      v.id, v.viewed_at, v.ip, v.user_agent, v.timezone, v.notif_snapshot,
      ROW_NUMBER() OVER (ORDER BY v.viewed_at ASC) AS rn,
      COUNT(*) OVER () AS cnt
    FROM public.sae_notif_views v
    WHERE v.notif_id = p_notif_id
      AND v.profile_id = auth.uid()
  )
  SELECT id, viewed_at, ip, user_agent, timezone, notif_snapshot, cnt
  FROM ranked
  WHERE rn = 1;
$$;

COMMENT ON FUNCTION public.get_sae_notif_constancia IS
  'Devuelve la constancia de visualización (la primera) de una notif SAE del propio user.';

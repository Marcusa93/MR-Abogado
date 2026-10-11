-- Módulo editorial: artículos de investigación y análisis jurídico.
-- Solo para Marco Rossi (profiles.acceso_editorial).
--
-- Flujo (protocolo del system prompt): propuesta → investigación → borrador
-- → revisión → aprobado. Nada se publica sin aprobación humana.
--
-- editorial_propuestas : radar diario, sentencias nuevas o carga manual
-- editorial_articulos  : el artículo en curso (cuerpo en markdown)
-- editorial_versiones  : cada versión (IA o edición de Marco), restaurable
-- editorial_movimientos_evaluados : sentencias ya evaluadas (no repetir)

-- ── Seguridad de perfiles (corrige escalada de privilegios) ───────────────────
-- La policy profiles_update_self (id = auth.uid()) no limitaba columnas: un
-- usuario podía ponerse rol DIRECTOR o tiene_acceso_caja = true por la API.
-- Este trigger protege las columnas sensibles:
--   rol, activo                      → solo ADMIN o DIRECTOR
--   tiene_acceso_caja, acceso_editorial → solo el sistema (service role)

CREATE OR REPLACE FUNCTION public.proteger_columnas_perfil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol_actor text;
BEGIN
  -- Service role / crons / funciones del sistema
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  IF NEW.tiene_acceso_caja IS DISTINCT FROM OLD.tiene_acceso_caja
     OR NEW.acceso_editorial IS DISTINCT FROM OLD.acceso_editorial THEN
    RAISE EXCEPTION 'No autorizado a cambiar accesos especiales' USING ERRCODE = '42501';
  END IF;

  IF NEW.rol IS DISTINCT FROM OLD.rol OR NEW.activo IS DISTINCT FROM OLD.activo THEN
    SELECT rol INTO v_rol_actor FROM public.profiles WHERE id = auth.uid();
    IF v_rol_actor IS NULL OR v_rol_actor NOT IN ('ADMIN', 'DIRECTOR') THEN
      RAISE EXCEPTION 'No autorizado a cambiar el rol o el estado del usuario' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── Acceso ────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS acceso_editorial boolean NOT NULL DEFAULT false;
UPDATE public.profiles SET acceso_editorial = true WHERE id = 'ceb22752-726c-4377-8f40-2bdccc8c8bbb'; -- Marco Rossi

DROP TRIGGER IF EXISTS proteger_columnas_perfil ON public.profiles;
CREATE TRIGGER proteger_columnas_perfil
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.proteger_columnas_perfil();

CREATE OR REPLACE FUNCTION public.can_access_editorial()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT acceso_editorial FROM public.profiles WHERE id = auth.uid()), false)
$$;
REVOKE ALL ON FUNCTION public.can_access_editorial() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_editorial() TO authenticated;

-- ── Propuestas ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.editorial_propuestas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origen         text NOT NULL CHECK (origen IN ('radar', 'sentencia', 'manual')),
  estado         text NOT NULL DEFAULT 'propuesta' CHECK (estado IN ('propuesta', 'en_curso', 'descartada')),
  titulo         text NOT NULL,
  problema       text,
  pregunta       text,
  fuentes        jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{tipo:'A'|'B'|'C', descripcion, ref}]
  hipotesis      text,
  relevancia     text,
  enfoque        text,
  actualidad     smallint CHECK (actualidad BETWEEN 1 AND 5),
  interes        smallint CHECK (interes BETWEEN 1 AND 5),
  originalidad   smallint CHECK (originalidad BETWEEN 1 AND 5),
  riesgos        text,
  tipo_sugerido  text,
  -- Fuente interna (nunca se publica): sentencia y expediente de origen
  movement_id    uuid REFERENCES public.sae_movements(id) ON DELETE SET NULL,
  expediente_id  uuid REFERENCES public.expedientes(id) ON DELETE SET NULL,
  notas          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_editorial_propuestas_estado ON public.editorial_propuestas(estado, created_at DESC);

-- ── Artículos y versiones ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.editorial_articulos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  propuesta_id     uuid REFERENCES public.editorial_propuestas(id) ON DELETE SET NULL,
  estado           text NOT NULL DEFAULT 'investigacion'
                     CHECK (estado IN ('investigacion', 'borrador', 'aprobado', 'publicado', 'archivado')),
  tipo             text NOT NULL DEFAULT 'analisis_profesional'
                     CHECK (tipo IN ('divulgacion', 'analisis_profesional', 'actualidad', 'reflexion', 'jurisprudencial')),
  titulo           text NOT NULL,
  bajada           text,
  cuerpo           text NOT NULL DEFAULT '',          -- markdown
  investigacion    text,                               -- modo investigación (markdown)
  revision_critica text,                               -- modo revisión crítica (markdown)
  referencias      jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{cita, fuente, verificada}]
  a_verificar      jsonb NOT NULL DEFAULT '[]'::jsonb, -- afirmaciones a comprobar
  alertas_confidencialidad jsonb NOT NULL DEFAULT '[]'::jsonb,
  adaptaciones     jsonb NOT NULL DEFAULT '{}'::jsonb, -- {linkedin, redes, boletin}
  version          integer NOT NULL DEFAULT 0,
  modelo_ia        text,
  aprobado_at      timestamptz,
  publicado_at     timestamptz,
  publicado_url    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_editorial_articulos_estado ON public.editorial_articulos(estado, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.editorial_versiones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  articulo_id  uuid NOT NULL REFERENCES public.editorial_articulos(id) ON DELETE CASCADE,
  version      integer NOT NULL,
  origen       text NOT NULL CHECK (origen IN ('ia', 'marco')),
  modo         text,              -- redaccion / edicion / restauracion
  titulo       text NOT NULL,
  bajada       text,
  cuerpo       text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (articulo_id, version)
);

CREATE TABLE IF NOT EXISTS public.editorial_movimientos_evaluados (
  movement_id  uuid PRIMARY KEY REFERENCES public.sae_movements(id) ON DELETE CASCADE,
  resultado    text NOT NULL CHECK (resultado IN ('propuesta', 'sin_interes', 'error')),
  propuesta_id uuid REFERENCES public.editorial_propuestas(id) ON DELETE SET NULL,
  motivo       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── RLS: solo quien tiene acceso editorial ────────────────────────────────────

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['editorial_propuestas', 'editorial_articulos', 'editorial_versiones', 'editorial_movimientos_evaluados'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS editorial_acceso ON public.%I', t);
    EXECUTE format('CREATE POLICY editorial_acceso ON public.%I FOR ALL USING (public.can_access_editorial()) WITH CHECK (public.can_access_editorial())', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- ── Crons ─────────────────────────────────────────────────────────────────────
-- Sentencias nuevas: cada 2 horas de 8 a 20 (AR), lunes a viernes.
-- Radar editorial: lunes a viernes 07:00 AR (10:00 UTC).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'editorial-sentencias') THEN PERFORM cron.unschedule('editorial-sentencias'); END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'editorial-radar') THEN PERFORM cron.unschedule('editorial-radar'); END IF;
END $$;

SELECT cron.schedule('editorial-sentencias', '15 11-23/2 * * 1-5', $cron$
  SELECT net.http_post(
    url := 'https://ftxpilbvjfxfkjkrbrnl.supabase.co/functions/v1/editorial-ia',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.functions_cron_secret()),
    body := '{"modo":"sentencias"}'::jsonb,
    timeout_milliseconds := 150000);
$cron$);

SELECT cron.schedule('editorial-radar', '0 10 * * 1-5', $cron$
  SELECT net.http_post(
    url := 'https://ftxpilbvjfxfkjkrbrnl.supabase.co/functions/v1/editorial-ia',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.functions_cron_secret()),
    body := '{"modo":"radar"}'::jsonb,
    timeout_milliseconds := 150000);
$cron$);

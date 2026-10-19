-- Editorial: investigación externa (Gemini Deep Research u otra). Marco pega o
-- sube el informe; el sistema lo separa en hallazgos, visita cada fuente y
-- comprueba que la cita textual esté en la página.

ALTER TABLE public.editorial_articulos
  ADD COLUMN IF NOT EXISTS informe_externo text,
  ADD COLUMN IF NOT EXISTS informe_cargado_at timestamptz;

CREATE TABLE IF NOT EXISTS public.editorial_fuentes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  articulo_id   uuid NOT NULL REFERENCES public.editorial_articulos(id) ON DELETE CASCADE,
  url           text NOT NULL,
  titulo        text,
  estado        text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'ok', 'sin_acceso', 'manual')),
  texto         text,
  error         text,
  obtenida_at   timestamptz,
  en_base       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (articulo_id, url)
);

CREATE TABLE IF NOT EXISTS public.editorial_hallazgos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  articulo_id   uuid NOT NULL REFERENCES public.editorial_articulos(id) ON DELETE CASCADE,
  fuente_id     uuid REFERENCES public.editorial_fuentes(id) ON DELETE SET NULL,
  orden         integer NOT NULL DEFAULT 0,
  afirmacion    text NOT NULL,
  tipo          text NOT NULL DEFAULT 'dato' CHECK (tipo IN ('norma', 'fallo', 'doctrina', 'dato')),
  fuente        text,
  url           text,
  cita          text,
  vigencia      text,
  confianza     text,
  numero        text,
  tribunal      text,
  fecha         text,
  jurisdiccion  text,
  estado        text NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente', 'comprobado', 'parcial', 'no_encontrado', 'sin_acceso', 'sin_fuente')),
  detalle       text,
  verificado_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS editorial_hallazgos_articulo_idx ON public.editorial_hallazgos (articulo_id, orden);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['editorial_fuentes', 'editorial_hallazgos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS editorial_acceso ON public.%I', t);
    EXECUTE format('CREATE POLICY editorial_acceso ON public.%I FOR ALL USING (public.can_access_editorial()) WITH CHECK (public.can_access_editorial())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

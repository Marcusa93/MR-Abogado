-- Editorial que aprende:
--  1) Guía de estilo de Marco, aprendida de sus correcciones al aprobar.
--  2) Líneas temáticas (ejes) con las tesis sostenidas y las preguntas abiertas.
--  3) Biblioteca de evidencia comprobada, compartida entre artículos.

CREATE TABLE IF NOT EXISTS public.editorial_estilo (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regla        text NOT NULL,
  antes        text,
  despues      text,
  origen       text NOT NULL DEFAULT 'aprendida' CHECK (origen IN ('aprendida', 'manual')),
  activa       boolean NOT NULL DEFAULT true,
  veces        integer NOT NULL DEFAULT 1,
  articulo_id  uuid REFERENCES public.editorial_articulos(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.editorial_ejes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       text NOT NULL UNIQUE,
  descripcion  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.editorial_articulos  ADD COLUMN IF NOT EXISTS eje_id uuid REFERENCES public.editorial_ejes(id) ON DELETE SET NULL;
ALTER TABLE public.editorial_articulos  ADD COLUMN IF NOT EXISTS aprendido_at timestamptz;
ALTER TABLE public.editorial_propuestas ADD COLUMN IF NOT EXISTS eje_id uuid REFERENCES public.editorial_ejes(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.editorial_tesis (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  eje_id       uuid REFERENCES public.editorial_ejes(id) ON DELETE CASCADE,
  articulo_id  uuid REFERENCES public.editorial_articulos(id) ON DELETE CASCADE,
  tipo         text NOT NULL CHECK (tipo IN ('tesis', 'pregunta')),
  texto        text NOT NULL,
  vigente      boolean NOT NULL DEFAULT true,
  propuesta_id uuid REFERENCES public.editorial_propuestas(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS editorial_tesis_eje_idx ON public.editorial_tesis (eje_id, tipo);

CREATE TABLE IF NOT EXISTS public.editorial_evidencia (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave         text NOT NULL UNIQUE,          -- url + cita normalizadas
  tipo          text NOT NULL,
  afirmacion    text NOT NULL,
  fuente        text,
  numero        text,
  tribunal      text,
  fecha         text,
  jurisdiccion  text,
  url           text,
  cita          text,
  vigencia      text,
  usos          integer NOT NULL DEFAULT 1,
  articulo_origen_id uuid REFERENCES public.editorial_articulos(id) ON DELETE SET NULL,
  verificado_at timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['editorial_estilo', 'editorial_ejes', 'editorial_tesis', 'editorial_evidencia'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS editorial_acceso ON public.%I', t);
    EXECUTE format('CREATE POLICY editorial_acceso ON public.%I FOR ALL USING (public.can_access_editorial()) WITH CHECK (public.can_access_editorial())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- La guía de estilo es de Marco: solo quien aprueba la modifica (los colaboradores la ven)
DROP POLICY IF EXISTS editorial_acceso ON public.editorial_estilo;
CREATE POLICY editorial_estilo_ver ON public.editorial_estilo FOR SELECT USING (public.can_access_editorial());
CREATE POLICY editorial_estilo_editar ON public.editorial_estilo FOR ALL USING (public.can_aprobar_editorial()) WITH CHECK (public.can_aprobar_editorial());

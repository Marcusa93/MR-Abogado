-- Perfil de redacción en capas para la IA de escritos:
--   estudio (común) → abogado → tipo de escrito → expediente (estrategia).
-- Además: modelo, calidad y costo de cada generación, y el esquema aprobado.

CREATE TABLE IF NOT EXISTS public.redaccion_perfiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ambito text NOT NULL CHECK (ambito IN ('estudio', 'abogado')),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  tono text,
  formulas text,
  evitar text,
  citas text,
  notas text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CHECK ((ambito = 'estudio' AND profile_id IS NULL) OR (ambito = 'abogado' AND profile_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS redaccion_perfiles_estudio_uq ON public.redaccion_perfiles (ambito) WHERE ambito = 'estudio';
CREATE UNIQUE INDEX IF NOT EXISTS redaccion_perfiles_abogado_uq ON public.redaccion_perfiles (profile_id) WHERE ambito = 'abogado';

ALTER TABLE public.redaccion_perfiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY redaccion_perfiles_select ON public.redaccion_perfiles FOR SELECT TO authenticated
  USING (ambito = 'estudio' OR profile_id = auth.uid() OR is_director());
CREATE POLICY redaccion_perfiles_insert ON public.redaccion_perfiles FOR INSERT TO authenticated
  WITH CHECK ((ambito = 'abogado' AND profile_id = auth.uid()) OR (ambito = 'estudio' AND is_director()));
CREATE POLICY redaccion_perfiles_update ON public.redaccion_perfiles FOR UPDATE TO authenticated
  USING ((ambito = 'abogado' AND profile_id = auth.uid()) OR (ambito = 'estudio' AND is_director()))
  WITH CHECK ((ambito = 'abogado' AND profile_id = auth.uid()) OR (ambito = 'estudio' AND is_director()));
CREATE POLICY redaccion_perfiles_delete ON public.redaccion_perfiles FOR DELETE TO authenticated
  USING ((ambito = 'abogado' AND profile_id = auth.uid()) OR (ambito = 'estudio' AND is_director()));

-- Reglas por tipo de escrito. profile_id NULL = regla del estudio.
CREATE TABLE IF NOT EXISTS public.redaccion_reglas_tipo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  reglas text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS redaccion_reglas_tipo_profile_idx ON public.redaccion_reglas_tipo (profile_id);

ALTER TABLE public.redaccion_reglas_tipo ENABLE ROW LEVEL SECURITY;

CREATE POLICY redaccion_reglas_select ON public.redaccion_reglas_tipo FOR SELECT TO authenticated
  USING (profile_id IS NULL OR profile_id = auth.uid() OR is_director());
CREATE POLICY redaccion_reglas_write ON public.redaccion_reglas_tipo FOR ALL TO authenticated
  USING (profile_id = auth.uid() OR (profile_id IS NULL AND is_director()))
  WITH CHECK (profile_id = auth.uid() OR (profile_id IS NULL AND is_director()));

-- Estrategia del caso para la redacción (capa expediente).
ALTER TABLE public.expedientes ADD COLUMN IF NOT EXISTS estrategia_redaccion text;

-- Trazabilidad de cada generación.
ALTER TABLE public.escritos
  ADD COLUMN IF NOT EXISTS calidad_ia text,
  ADD COLUMN IF NOT EXISTS costo_usd numeric(10,4),
  ADD COLUMN IF NOT EXISTS tokens_entrada integer,
  ADD COLUMN IF NOT EXISTS tokens_salida integer,
  ADD COLUMN IF NOT EXISTS esquema jsonb,
  ADD COLUMN IF NOT EXISTS contexto_ia jsonb,
  ADD COLUMN IF NOT EXISTS revision_formal jsonb,
  ADD COLUMN IF NOT EXISTS revision_formal_at timestamptz;

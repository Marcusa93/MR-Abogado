-- Datos que el cálculo de plazos necesita y no tenía:
--  1. De qué lado está el estudio en cada expediente (se pregunta una vez y queda guardado).
--  2. Calendario de días inhábiles en la base: nacionales (API oficial), provinciales de
--     Tucumán y los que declara la Corte por acordada. Reemplaza la lista fija en código.

-- ─── 1. Parte que representa el estudio ─────────────────────────────────────
ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS parte_estudio text
    CHECK (parte_estudio IS NULL OR parte_estudio IN ('actora', 'demandada', 'tercero', 'otra')),
  ADD COLUMN IF NOT EXISTS parte_estudio_detalle text,
  ADD COLUMN IF NOT EXISTS datos_plazos_confirmados_at timestamptz,
  ADD COLUMN IF NOT EXISTS datos_plazos_confirmados_por uuid REFERENCES public.profiles(id);

COMMENT ON COLUMN public.expedientes.parte_estudio IS
  'Parte que representa el estudio. Si datos_plazos_confirmados_at es NULL, es una inferencia (carátula/SAE) y se pregunta al abrir el expediente.';

-- Fuero desde el SAE cuando falta
UPDATE public.expedientes e SET fuero = CASE split_part(e.sae_proceeding_entry->'proceeding'->>'jurisdiction_slug', '-', 1)
    WHEN 'civil' THEN 'civil'
    WHEN 'mediacion' THEN 'mediacion'
    WHEN 'familia' THEN 'familia'
    WHEN 'trabajo' THEN 'laboral'
    WHEN 'documentos' THEN 'documentos_locaciones'
    WHEN 'contencioso' THEN 'administrativo'
  END
WHERE e.fuero IS NULL AND e.sae_proceeding_entry->'proceeding'->>'jurisdiction_slug' IS NOT NULL;

-- Inferencia de la parte (queda sin confirmar): el apellido del cliente o de un abogado
-- del estudio aparece antes del "C/" de la carátula → actora; después → demandada.
WITH base AS (
  SELECT e.id,
         upper(coalesce(e.sae_proceeding_entry->'proceeding'->>'acto', split_part(upper(e.caratula), ' C/ ', 1))) AS actor,
         upper(coalesce(e.sae_proceeding_entry->'proceeding'->>'dema', split_part(split_part(upper(e.caratula), ' C/ ', 2), ' S/ ', 1))) AS demandado,
         nullif(upper(trim(c.apellido)), 'IMPORTADO SAE') AS apellido
  FROM public.expedientes e
  LEFT JOIN public.clientes c ON c.id = e.cliente_id
  WHERE e.parte_estudio IS NULL AND e.caratula ILIKE '% C/ %'
), equipo AS (
  SELECT DISTINCT upper(trim(apellido)) AS ap FROM public.profiles WHERE activo AND rol IN ('DIRECTOR', 'ABOGADO') AND coalesce(trim(apellido), '') <> ''
)
UPDATE public.expedientes e SET parte_estudio = CASE
    WHEN b.apellido IS NOT NULL AND position(b.apellido IN b.actor) > 0 THEN 'actora'
    WHEN b.apellido IS NOT NULL AND position(b.apellido IN b.demandado) > 0 THEN 'demandada'
    WHEN EXISTS (SELECT 1 FROM equipo q WHERE b.actor LIKE q.ap || ' %') THEN 'actora'
  END
FROM base b WHERE b.id = e.id;

-- ─── 2. Días inhábiles ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dias_inhabiles (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fecha       date NOT NULL,
  ambito      text NOT NULL CHECK (ambito IN ('nacional', 'provincial', 'judicial')),
  descripcion text NOT NULL,
  -- 'api' = argentinadatos (decretos nacionales); 'ley' = provincial fijo; 'manual' = cargado por el estudio
  fuente      text NOT NULL DEFAULT 'manual' CHECK (fuente IN ('api', 'ley', 'manual')),
  referencia  text,                -- acordada, decreto, nota
  -- false = el Poder Judicial trabajó igual (p. ej. un puente turístico al que no adhirió)
  inhabil     boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fecha, ambito)
);
CREATE INDEX IF NOT EXISTS dias_inhabiles_fecha_idx ON public.dias_inhabiles (fecha);

ALTER TABLE public.dias_inhabiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dias_inhabiles_select ON public.dias_inhabiles;
CREATE POLICY dias_inhabiles_select ON public.dias_inhabiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS dias_inhabiles_write ON public.dias_inhabiles;
CREATE POLICY dias_inhabiles_write ON public.dias_inhabiles FOR ALL TO authenticated
  USING (public.is_director() OR public.current_user_role() IN ('ABOGADO', 'SECRETARIA'))
  WITH CHECK (public.is_director() OR public.current_user_role() IN ('ABOGADO', 'SECRETARIA'));

-- Ferias: también las puede cargar el estudio
DROP POLICY IF EXISTS feria_judicial_write ON public.feria_judicial;
CREATE POLICY feria_judicial_write ON public.feria_judicial FOR ALL TO authenticated
  USING (public.is_director() OR public.current_user_role() IN ('ABOGADO', 'SECRETARIA'))
  WITH CHECK (public.is_director() OR public.current_user_role() IN ('ABOGADO', 'SECRETARIA'));

-- Provinciales de Tucumán por ley
INSERT INTO public.dias_inhabiles (fecha, ambito, descripcion, fuente, referencia)
SELECT make_date(y, 9, 24), 'provincial', 'Batalla de Tucumán y Virgen de la Merced', 'ley', 'Ley provincial 7727'
FROM generate_series(2025, 2030) y
ON CONFLICT (fecha, ambito) DO NOTHING;

-- Inhábiles judiciales conocidos
INSERT INTO public.dias_inhabiles (fecha, ambito, descripcion, fuente, referencia) VALUES
  ('2026-11-02', 'judicial', 'Día de los Fieles Difuntos', 'manual', 'Corte Suprema de Tucumán (informado en prensa)')
ON CONFLICT (fecha, ambito) DO NOTHING;

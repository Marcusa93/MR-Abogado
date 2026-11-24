-- Cotización por procesos: un cliente puede tener un conflicto con varias áreas
-- (laboral, penal, civil...) y cada juicio, actuación administrativa o gestión
-- extrajudicial lleva su propio honorario. Cada fila de `presupuestos` pasa a
-- ser un proceso/actuación con su honorario; `cotizaciones` guarda cómo se
-- presenta (por separado o todo junto), la posible financiación y condiciones.

-- ── presupuestos: un proceso o actuación con su honorario ────────────────────
ALTER TABLE public.presupuestos
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS proceso text,
  ADD COLUMN IF NOT EXISTS tipo_actuacion text NOT NULL DEFAULT 'judicial',
  ADD COLUMN IF NOT EXISTS detalle text,
  ADD COLUMN IF NOT EXISTS monto_fijo numeric,
  ADD COLUMN IF NOT EXISTS orden integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS incluido boolean NOT NULL DEFAULT true;

ALTER TABLE public.presupuestos DROP CONSTRAINT IF EXISTS presupuestos_tipo_actuacion_check;
ALTER TABLE public.presupuestos ADD CONSTRAINT presupuestos_tipo_actuacion_check
  CHECK (tipo_actuacion IN ('judicial', 'administrativa', 'extrajudicial', 'consulta', 'otra'));

-- 'mixto' = monto fijo (monto_fijo) + porcentaje (multiplicador) sobre lo obtenido (monto_base)
ALTER TABLE public.presupuestos DROP CONSTRAINT IF EXISTS presupuestos_tipo_honorario_check;
ALTER TABLE public.presupuestos ADD CONSTRAINT presupuestos_tipo_honorario_check
  CHECK (tipo_honorario IN ('cuota_litis', 'arancel_verbal', 'arancel_escrito', 'honorario_fijo', 'mixto'));

COMMENT ON COLUMN public.presupuestos.area IS 'Área del conflicto (clave de tipo_asunto: laboral_trabajador, penal, civil...).';
COMMENT ON COLUMN public.presupuestos.proceso IS 'Juicio, actuación administrativa o gestión que se cotiza.';
COMMENT ON COLUMN public.presupuestos.detalle IS 'Alcance: qué incluye y qué no.';
COMMENT ON COLUMN public.presupuestos.monto_fijo IS 'Parte fija del honorario mixto (fijo + porcentaje del resultado).';
COMMENT ON COLUMN public.presupuestos.incluido IS 'Si figura en el documento y en los totales.';

-- Filas previas: el "concepto" se cargaba en notas; las consultas del Colegio son tipo consulta
UPDATE public.presupuestos SET proceso = notas WHERE proceso IS NULL AND notas IS NOT NULL;
UPDATE public.presupuestos SET tipo_actuacion = 'consulta'
  WHERE tipo_honorario IN ('arancel_verbal', 'arancel_escrito') AND tipo_actuacion = 'judicial';

CREATE INDEX IF NOT EXISTS idx_presupuestos_consulta ON public.presupuestos (consulta_id, orden);

-- ── cotizaciones: cómo se presenta la propuesta de honorarios ────────────────
CREATE TABLE IF NOT EXISTS public.cotizaciones (
  consulta_id uuid PRIMARY KEY REFERENCES public.consultas(id) ON DELETE CASCADE,
  modo text NOT NULL DEFAULT 'separado' CHECK (modo IN ('separado', 'conjunto')),
  precio_conjunto numeric CHECK (precio_conjunto IS NULL OR precio_conjunto >= 0),
  financiacion jsonb NOT NULL DEFAULT '[]'::jsonb,
  condiciones text,
  validez_dias integer CHECK (validez_dias IS NULL OR validez_dias > 0),
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cotizaciones IS 'Presentación de los honorarios de una consulta: por separado o todo junto, posible financiación y condiciones.';
COMMENT ON COLUMN public.cotizaciones.financiacion IS 'Opciones de pago: [{id, titulo, aplica_a ("total" | id de presupuesto), anticipo_tipo ("porcentaje"|"monto"), anticipo, cuotas, recargo_pct, nota}].';

ALTER TABLE public.cotizaciones ENABLE ROW LEVEL SECURITY;

-- Mismo criterio que presupuestos: los honorarios no los ve secretaría
DROP POLICY IF EXISTS cotizaciones_no_secretaria ON public.cotizaciones;
CREATE POLICY cotizaciones_no_secretaria ON public.cotizaciones
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.rol <> 'SECRETARIA'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.rol <> 'SECRETARIA'));

REVOKE ALL ON public.cotizaciones FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotizaciones TO authenticated;

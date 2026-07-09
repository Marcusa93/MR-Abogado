-- ============================================================
-- Consultas iniciales, presupuestos y actividad de seguimiento
-- ============================================================

CREATE TABLE public.consultas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          text NOT NULL,
  apellido        text,
  telefono        text,
  email           text,
  canal           text NOT NULL DEFAULT 'presencial'
                  CHECK (canal IN ('presencial', 'telefono', 'turno', 'web', 'referido')),
  tipo_asunto     text NOT NULL DEFAULT 'civil'
                  CHECK (tipo_asunto IN (
                    'laboral_trabajador', 'laboral_empleador',
                    'civil', 'familia', 'previsional', 'penal', 'otro'
                  )),
  notas_libres    text,
  diagnostico_ia  jsonb,
  diagnostico_at  timestamptz,
  estado          text NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN (
                    'pendiente', 'en_proceso', 'presupuestada', 'convertida', 'descartada'
                  )),
  convertida_expediente_id uuid REFERENCES public.expedientes(id),
  assigned_to     uuid REFERENCES public.profiles(id),
  created_by      uuid NOT NULL REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_consultas_estado ON public.consultas(estado);
CREATE INDEX idx_consultas_created_at ON public.consultas(created_at DESC);
CREATE INDEX idx_consultas_assigned_to ON public.consultas(assigned_to);

COMMENT ON TABLE public.consultas IS 'Potenciales clientes que consultaron antes de convertirse en expediente';

-- ============================================================
-- Presupuestos (solo abogados/director — no SECRETARIA)
-- ============================================================

CREATE TABLE public.presupuestos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consulta_id           uuid REFERENCES public.consultas(id) ON DELETE CASCADE,
  expediente_id         uuid REFERENCES public.expedientes(id) ON DELETE SET NULL,
  tipo_honorario        text NOT NULL DEFAULT 'arancel_verbal'
                        CHECK (tipo_honorario IN (
                          'cuota_litis', 'arancel_verbal', 'arancel_escrito', 'honorario_fijo'
                        )),
  monto_base            numeric,
  multiplicador         numeric NOT NULL DEFAULT 1.0,
  honorarios_calculados numeric NOT NULL,
  descripcion_ia        text,
  estado                text NOT NULL DEFAULT 'borrador'
                        CHECK (estado IN ('borrador', 'presentado', 'aceptado', 'rechazado')),
  notas                 text,
  created_by            uuid NOT NULL REFERENCES public.profiles(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_presupuestos_consulta_id ON public.presupuestos(consulta_id);
CREATE INDEX idx_presupuestos_expediente_id ON public.presupuestos(expediente_id);

COMMENT ON TABLE public.presupuestos IS 'Honorarios calculados para consultas o expedientes. Solo visible para abogados.';

-- ============================================================
-- Actividad de consultas (seguimiento admin — Sami/Facundo)
-- ============================================================

CREATE TABLE public.consulta_actividad (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consulta_id  uuid NOT NULL REFERENCES public.consultas(id) ON DELETE CASCADE,
  tipo         text NOT NULL DEFAULT 'nota'
               CHECK (tipo IN ('nota', 'llamada', 'email', 'reunion', 'cambio_estado')),
  descripcion  text NOT NULL,
  created_by   uuid NOT NULL REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_consulta_actividad_consulta_id ON public.consulta_actividad(consulta_id);

COMMENT ON TABLE public.consulta_actividad IS 'Log de seguimiento administrativo de consultas iniciales';

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.consultas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presupuestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consulta_actividad ENABLE ROW LEVEL SECURITY;

-- Consultas: todos los roles autenticados
CREATE POLICY "consultas_authenticated"
  ON public.consultas FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Presupuestos: solo roles que NO son SECRETARIA
CREATE POLICY "presupuestos_no_secretaria"
  ON public.presupuestos FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND rol NOT IN ('SECRETARIA')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND rol NOT IN ('SECRETARIA')
    )
  );

-- Actividad: todos los autenticados
CREATE POLICY "consulta_actividad_authenticated"
  ON public.consulta_actividad FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

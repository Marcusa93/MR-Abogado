-- Agrega campos para ordenamiento de hechos con IA y solicitud de documentación
ALTER TABLE public.consultas
  ADD COLUMN IF NOT EXISTS hechos_ordenados text,
  ADD COLUMN IF NOT EXISTS preguntas_sugeridas jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS hechos_ordenados_at timestamptz;

-- Extiende el CHECK de estado para incluir en_revision
ALTER TABLE public.consultas DROP CONSTRAINT IF EXISTS consultas_estado_check;
ALTER TABLE public.consultas
  ADD CONSTRAINT consultas_estado_check
  CHECK (estado IN ('pendiente', 'en_proceso', 'en_revision', 'presupuestada', 'convertida', 'descartada'));

-- Tabla para solicitudes de documentación en consultas
CREATE TABLE IF NOT EXISTS public.consulta_solicitud_docs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consulta_id uuid NOT NULL REFERENCES public.consultas(id) ON DELETE CASCADE,
  descripcion text NOT NULL,
  responsable_id uuid REFERENCES public.profiles(id),
  estado      text NOT NULL DEFAULT 'pendiente'
              CHECK (estado IN ('pendiente', 'recibido', 'cancelado')),
  notas       text,
  fecha_limite date,
  created_by  uuid NOT NULL REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.consulta_solicitud_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access"
  ON public.consulta_solicitud_docs
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_consulta_solicitud_docs_consulta_id
  ON public.consulta_solicitud_docs(consulta_id);

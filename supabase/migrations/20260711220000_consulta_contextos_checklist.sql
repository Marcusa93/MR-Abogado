-- Textos adicionales de contexto (transcripciones de audio, documentos pegados, apuntes)
CREATE TABLE public.consulta_contextos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consulta_id uuid NOT NULL REFERENCES public.consultas(id) ON DELETE CASCADE,
  tipo        text NOT NULL DEFAULT 'apunte'
              CHECK (tipo IN ('grabacion', 'documento', 'apunte')),
  titulo      text NOT NULL,
  contenido   text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_consulta_contextos_consulta ON public.consulta_contextos(consulta_id);
ALTER TABLE public.consulta_contextos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_full" ON public.consulta_contextos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Estado del checklist (array de booleans por índice)
ALTER TABLE public.consultas
  ADD COLUMN IF NOT EXISTS checklist_estado jsonb DEFAULT '[]';

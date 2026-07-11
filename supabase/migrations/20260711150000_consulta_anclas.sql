-- Tablas para anclar normativa y jurisprudencia a una consulta inicial
CREATE TABLE public.consulta_normativa (
  consulta_id  uuid NOT NULL REFERENCES public.consultas(id) ON DELETE CASCADE,
  documento_id uuid NOT NULL REFERENCES public.normativa_documentos(id) ON DELETE CASCADE,
  fijado_por   uuid NOT NULL REFERENCES public.profiles(id),
  nota         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consulta_id, documento_id)
);

CREATE TABLE public.consulta_jurisprudencia (
  consulta_id  uuid NOT NULL REFERENCES public.consultas(id) ON DELETE CASCADE,
  documento_id uuid NOT NULL REFERENCES public.jurisprudencia_documentos(id) ON DELETE CASCADE,
  fijado_por   uuid NOT NULL REFERENCES public.profiles(id),
  nota         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consulta_id, documento_id)
);

ALTER TABLE public.consulta_normativa    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consulta_jurisprudencia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_full" ON public.consulta_normativa
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_full" ON public.consulta_jurisprudencia
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_consulta_normativa_consulta
  ON public.consulta_normativa (consulta_id);

CREATE INDEX idx_consulta_jurisprudencia_consulta
  ON public.consulta_jurisprudencia (consulta_id);

-- Novedades del abogado por expediente: log de actualizaciones dictadas en lenguaje libre
-- que la IA convierte en notas estructuradas y tareas procesables.

CREATE TABLE public.expediente_novedades (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id   uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  texto_original  text NOT NULL,
  nota            text NOT NULL,
  tareas_ids      uuid[] NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_expediente_novedades_exp
  ON public.expediente_novedades (expediente_id, created_at DESC);

ALTER TABLE public.expediente_novedades ENABLE ROW LEVEL SECURITY;

CREATE POLICY novedades_select ON public.expediente_novedades
  FOR SELECT USING (public.can_view_expediente(expediente_id));

CREATE POLICY novedades_insert ON public.expediente_novedades
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND public.can_view_expediente(expediente_id)
  );

CREATE POLICY novedades_delete ON public.expediente_novedades
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE public.expediente_novedades IS
  'Log de novedades dictadas por el abogado. Cada entrada tiene el texto original y la nota formateada por la IA, más referencias a las tareas que generó.';

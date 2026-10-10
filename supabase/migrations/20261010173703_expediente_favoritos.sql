-- Expedientes favoritos (estrella), por usuario.
-- Cada usuario ve y modifica solo sus propias filas.

CREATE TABLE IF NOT EXISTS public.expediente_favoritos (
  profile_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  expediente_id uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, expediente_id)
);

CREATE INDEX IF NOT EXISTS idx_expediente_favoritos_expediente
  ON public.expediente_favoritos(expediente_id);

ALTER TABLE public.expediente_favoritos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS favoritos_select ON public.expediente_favoritos;
CREATE POLICY favoritos_select ON public.expediente_favoritos
  FOR SELECT USING (profile_id = auth.uid());

DROP POLICY IF EXISTS favoritos_insert ON public.expediente_favoritos;
CREATE POLICY favoritos_insert ON public.expediente_favoritos
  FOR INSERT WITH CHECK (profile_id = auth.uid() AND public.can_view_expediente(expediente_id));

DROP POLICY IF EXISTS favoritos_delete ON public.expediente_favoritos;
CREATE POLICY favoritos_delete ON public.expediente_favoritos
  FOR DELETE USING (profile_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.expediente_favoritos TO authenticated;
REVOKE ALL ON public.expediente_favoritos FROM anon;

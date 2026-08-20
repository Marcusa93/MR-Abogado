-- Add consulta_id to adjuntos
ALTER TABLE public.adjuntos
  ADD COLUMN IF NOT EXISTS consulta_id uuid REFERENCES public.consultas(id) ON DELETE SET NULL;

-- Relax constraint (antes: expediente_id OR cliente_id; ahora: + consulta_id)
ALTER TABLE public.adjuntos DROP CONSTRAINT IF EXISTS chk_adjunto_padre;
ALTER TABLE public.adjuntos ADD CONSTRAINT chk_adjunto_padre
  CHECK (expediente_id IS NOT NULL OR cliente_id IS NOT NULL OR consulta_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_adjuntos_consulta_id
  ON public.adjuntos(consulta_id) WHERE consulta_id IS NOT NULL;

-- Update RLS SELECT: add consulta branch (any authenticated user can see consulta adjuntos)
DROP POLICY IF EXISTS adjuntos_select_visible ON public.adjuntos;
CREATE POLICY adjuntos_select_visible ON public.adjuntos FOR SELECT USING (
  deleted_at IS NULL AND (
    public.is_admin()
    OR uploaded_by = auth.uid()
    OR (expediente_id IS NOT NULL AND public.can_view_expediente(expediente_id))
    OR (
      cliente_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.expedientes e
        WHERE e.cliente_id = adjuntos.cliente_id AND e.deleted_at IS NULL
          AND public.can_view_expediente(e.id)
      )
    )
    OR (consulta_id IS NOT NULL AND auth.uid() IS NOT NULL)
  )
);

-- Update RLS INSERT: cualquier usuario autenticado puede insertar adjuntos
-- de consultas (expediente_id IS NULL) o de expedientes que puede ver.
-- No se impone uploaded_by en RLS — se setea en código para auditoría.
DROP POLICY IF EXISTS adjuntos_insert_visible ON public.adjuntos;
CREATE POLICY adjuntos_insert_visible ON public.adjuntos FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    expediente_id IS NULL
    OR public.can_view_expediente(expediente_id)
  )
);

-- Storage: update bucket to allow images (currently only pdf)
UPDATE storage.buckets
  SET allowed_mime_types = ARRAY['application/pdf','image/jpeg','image/png']
  WHERE id = 'adjuntos';

-- Storage policies: add consultas/ path access for authenticated users
DROP POLICY IF EXISTS "adjuntos_consultas_select" ON storage.objects;
CREATE POLICY "adjuntos_consultas_select" ON storage.objects FOR SELECT USING (
  bucket_id = 'adjuntos'
  AND (storage.foldername(name))[1] = 'consultas'
  AND auth.uid() IS NOT NULL
);

DROP POLICY IF EXISTS "adjuntos_consultas_insert" ON storage.objects;
CREATE POLICY "adjuntos_consultas_insert" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'adjuntos'
  AND (storage.foldername(name))[1] = 'consultas'
  AND auth.uid() IS NOT NULL
);

DROP POLICY IF EXISTS "adjuntos_consultas_delete" ON storage.objects;
CREATE POLICY "adjuntos_consultas_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'adjuntos'
  AND (storage.foldername(name))[1] = 'consultas'
  AND auth.uid() IS NOT NULL
);

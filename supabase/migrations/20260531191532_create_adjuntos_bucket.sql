-- ============================================================
-- Bucket adjuntos: crear bucket + policies de storage.objects
--
-- Antes existía solo si alguien lo creaba a mano via dashboard.
-- Esta migración lo lleva a source control y agrega policies
-- alineadas con can_view_expediente (folder name = expediente_id).
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'adjuntos',
  'adjuntos',
  false,
  52428800, -- 50 MB (el frontend convierte imágenes a PDF antes de subir)
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- RLS: el path es ${expedienteId}/${ts}_${rand}.pdf — el primer
-- segmento es el UUID del expediente, así que can_view_expediente
-- decide quién puede leer/escribir.
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "adjuntos_select_visible" ON storage.objects;
CREATE POLICY "adjuntos_select_visible" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'adjuntos'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_view_expediente(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "adjuntos_insert_visible" ON storage.objects;
CREATE POLICY "adjuntos_insert_visible" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'adjuntos'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_view_expediente(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "adjuntos_update_visible" ON storage.objects;
CREATE POLICY "adjuntos_update_visible" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'adjuntos'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_view_expediente(((storage.foldername(name))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'adjuntos'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_view_expediente(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "adjuntos_delete_visible" ON storage.objects;
CREATE POLICY "adjuntos_delete_visible" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'adjuntos'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_view_expediente(((storage.foldername(name))[1])::uuid)
  );

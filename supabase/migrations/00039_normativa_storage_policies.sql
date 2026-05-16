-- Policies de storage.objects para el bucket normativa-originales.
-- Faltaban en la migración 00037 (por eso el upload tiraba "new row
-- violates row-level security policy"). Convención de path:
-- <user_id>/<documento_id>.<ext>  → la primera carpeta debe ser el uid.

CREATE POLICY "normativa_originales_owner_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'normativa-originales'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "normativa_originales_owner_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'normativa-originales'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "normativa_originales_owner_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'normativa-originales'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- Biblioteca jurídica compartida: normativa y jurisprudencia
--
-- Antes: cada usuario solo veía sus propios documentos (owner_all).
-- Ahora: todos los autenticados pueden leer cualquier documento;
--        solo el owner puede insertar, actualizar y eliminar los suyos.
--
-- También agrega las storage.objects policies para jurisprudencia-originales
-- que faltaban (similar a 00039_normativa_storage_policies.sql), y permite
-- que cualquier autenticado descargue archivos de ambos buckets.
-- ============================================================

-- ── normativa_documentos ────────────────────────────────────────
DROP POLICY IF EXISTS "normativa_documentos_owner_all" ON public.normativa_documentos;

CREATE POLICY "normativa_documentos_select_all" ON public.normativa_documentos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "normativa_documentos_owner_insert" ON public.normativa_documentos
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "normativa_documentos_owner_update" ON public.normativa_documentos
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "normativa_documentos_owner_delete" ON public.normativa_documentos
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── normativa_chunks ────────────────────────────────────────────
DROP POLICY IF EXISTS "normativa_chunks_owner_select" ON public.normativa_chunks;

CREATE POLICY "normativa_chunks_select_all" ON public.normativa_chunks
  FOR SELECT TO authenticated USING (true);

-- ── expediente_normativa: cualquiera con acceso al expediente puede fijar
-- (ya no se exige que el documento sea propio — la biblioteca es compartida)
DROP POLICY IF EXISTS "expediente_normativa_insert" ON public.expediente_normativa;

CREATE POLICY "expediente_normativa_insert" ON public.expediente_normativa
  FOR INSERT WITH CHECK (
    fijado_por = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.expedientes e
      WHERE e.id = expediente_id
        AND (
          e.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.expediente_miembros em
            WHERE em.expediente_id = e.id AND em.profile_id = auth.uid()
          )
        )
    )
  );

-- ── jurisprudencia_documentos ───────────────────────────────────
DROP POLICY IF EXISTS "jurisprudencia_documentos_owner_all" ON public.jurisprudencia_documentos;

CREATE POLICY "jurisprudencia_documentos_select_all" ON public.jurisprudencia_documentos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "jurisprudencia_documentos_owner_insert" ON public.jurisprudencia_documentos
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "jurisprudencia_documentos_owner_update" ON public.jurisprudencia_documentos
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "jurisprudencia_documentos_owner_delete" ON public.jurisprudencia_documentos
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── jurisprudencia_chunks ───────────────────────────────────────
DROP POLICY IF EXISTS "jurisprudencia_chunks_owner_select" ON public.jurisprudencia_chunks;

CREATE POLICY "jurisprudencia_chunks_select_all" ON public.jurisprudencia_chunks
  FOR SELECT TO authenticated USING (true);

-- ── expediente_jurisprudencia: idem normativa
DROP POLICY IF EXISTS "expediente_jurisprudencia_insert" ON public.expediente_jurisprudencia;

CREATE POLICY "expediente_jurisprudencia_insert" ON public.expediente_jurisprudencia
  FOR INSERT WITH CHECK (
    fijado_por = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.expedientes e
      WHERE e.id = expediente_id
        AND (
          e.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.expediente_miembros em
            WHERE em.expediente_id = e.id AND em.profile_id = auth.uid()
          )
        )
    )
  );

-- ── Storage: normativa-originales — SELECT abierto para descarga compartida
DROP POLICY IF EXISTS "normativa_originales_owner_select" ON storage.objects;

CREATE POLICY "normativa_originales_select_all" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'normativa-originales');

-- ── Storage: jurisprudencia-originales — faltaban todas las policies
-- Path convention: <user_id>/<documento_id>.<ext>
CREATE POLICY "jurisprudencia_originales_select_all" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'jurisprudencia-originales');

CREATE POLICY "jurisprudencia_originales_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'jurisprudencia-originales'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "jurisprudencia_originales_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'jurisprudencia-originales'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

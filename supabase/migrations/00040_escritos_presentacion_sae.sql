-- ============================================================
-- Migración 040: Soporte para presentación de escritos al SAE
--
-- - Agrega estados 'firmado' y 'presentado_sae' al enum.
-- - Agrega columnas en escritos para PDF firmado y comprobante.
-- - Bucket escritos-firmados para guardar el PDF post-firma.
-- ============================================================

ALTER TABLE public.escritos
  DROP CONSTRAINT IF EXISTS escritos_estado_check;

ALTER TABLE public.escritos
  ADD CONSTRAINT escritos_estado_check CHECK (
    estado IN ('borrador', 'final', 'firmado', 'presentado_sae', 'presentado')
  );

ALTER TABLE public.escritos
  ADD COLUMN IF NOT EXISTS pdf_firmado_path     text,
  ADD COLUMN IF NOT EXISTS pdf_firmado_at       timestamptz,
  ADD COLUMN IF NOT EXISTS firmante_cn          text,             -- Common Name del cert X.509
  ADD COLUMN IF NOT EXISTS presentado_sae_at    timestamptz,
  ADD COLUMN IF NOT EXISTS presentacion_sae     jsonb;            -- { nro_comprobante, categoria, descripcion, oficina, raw_response }

CREATE INDEX IF NOT EXISTS idx_escritos_estado
  ON public.escritos (estado);

-- ── Bucket: PDFs firmados ───────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'escritos-firmados',
  'escritos-firmados',
  false,
  7864320,  -- 7.5 MB, mismo límite que el portal del SAE
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: convención <user_id>/<escrito_id>.pdf
CREATE POLICY "escritos_firmados_owner_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'escritos-firmados'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "escritos_firmados_owner_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'escritos-firmados'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "escritos_firmados_owner_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'escritos-firmados'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

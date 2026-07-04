-- El bucket contenidos-media fue creado manualmente sin file_size_limit explícito.
-- La UI valida hasta 500 MB, pero Storage rechazaba archivos > 50 MB (default).
UPDATE storage.buckets
SET file_size_limit = 524288000  -- 500 MB en bytes
WHERE id = 'contenidos-media';

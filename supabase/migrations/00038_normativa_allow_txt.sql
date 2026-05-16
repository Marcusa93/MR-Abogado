-- Permite subir normativa en texto plano (UTF-8).
-- Útil cuando la norma viene de una página web o ya está en formato limpio.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain'
]
WHERE id = 'normativa-originales';

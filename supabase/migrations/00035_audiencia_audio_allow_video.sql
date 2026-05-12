-- ============================================================
-- Migración 035: Permitir subir videos al bucket audiencias-audio
--
-- Whisper acepta video también (extrae el audio internamente). El bucket
-- original solo permitía audio puro; ampliamos a contenedores comunes.
-- ============================================================

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  -- audio
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav',
  'audio/ogg', 'audio/opus', 'audio/webm', 'audio/flac',
  'audio/aac', 'audio/x-m4a',
  -- video / contenedores con audio
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
  'video/x-matroska', 'video/x-flv', 'video/3gpp', 'video/mpeg'
]
WHERE id = 'audiencias-audio';

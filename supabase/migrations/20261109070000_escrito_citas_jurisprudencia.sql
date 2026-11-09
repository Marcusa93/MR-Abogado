-- escrito_citas solo aceptaba fragmentos de normativa (FK a normativa_chunks):
-- si la IA citaba un fallo, el insert entero fallaba y no quedaba ninguna cita.
-- Se agrega la fuente y se quitan las FK de chunk/documento (pueden ser de
-- cualquiera de las dos tablas).
ALTER TABLE public.escrito_citas DROP CONSTRAINT IF EXISTS escrito_citas_chunk_id_fkey;
ALTER TABLE public.escrito_citas DROP CONSTRAINT IF EXISTS escrito_citas_documento_id_fkey;
ALTER TABLE public.escrito_citas ADD COLUMN IF NOT EXISTS fuente text NOT NULL DEFAULT 'normativa'
  CHECK (fuente IN ('normativa', 'jurisprudencia'));

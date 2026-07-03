-- Marca de "providencia respondida": cuando se genera un escrito que responde a
-- un movimiento SAE, se setea respondida_at. La UI muestra un badge y evita que
-- una orden quede sin contestar sin que se note.

ALTER TABLE public.sae_movements
  ADD COLUMN IF NOT EXISTS respondida_at timestamptz;

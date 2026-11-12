-- Revisión de escritos entre personas del estudio: quien redacta lo envía a
-- revisión (a un abogado o al director); el aviso llega por Telegram y se
-- aprueba o devuelve con observaciones desde el chat o desde la app.
ALTER TABLE public.escritos
  ADD COLUMN IF NOT EXISTS revision_pedida_a uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revision_pedida_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revision_pedida_at timestamptz,
  ADD COLUMN IF NOT EXISTS revision_nota text,
  ADD COLUMN IF NOT EXISTS revision_resultado text CHECK (revision_resultado IN ('aprobado', 'cambios')),
  ADD COLUMN IF NOT EXISTS revision_observaciones text,
  ADD COLUMN IF NOT EXISTS revision_resuelta_at timestamptz;

CREATE INDEX IF NOT EXISTS escritos_revision_pendiente_idx
  ON public.escritos (revision_pedida_a)
  WHERE revision_pedida_a IS NOT NULL AND revision_resultado IS NULL;

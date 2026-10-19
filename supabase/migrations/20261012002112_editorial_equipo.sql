-- Editorial en equipo: quién propuso, a quién se le asignó el tema, quién
-- escribió cada versión y qué artículos esperan la aprobación de Marco.

ALTER TABLE public.editorial_propuestas
  ADD COLUMN IF NOT EXISTS creado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS asignado_a uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nota_asignacion text,
  ADD COLUMN IF NOT EXISTS asignado_at timestamptz;

ALTER TABLE public.editorial_articulos
  ADD COLUMN IF NOT EXISTS creado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS asignado_a uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS aprobacion_pedida_at timestamptz;

ALTER TABLE public.editorial_versiones
  ADD COLUMN IF NOT EXISTS autor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid();

-- Lo existente lo hizo Marco
UPDATE public.editorial_propuestas SET creado_por = 'ceb22752-726c-4377-8f40-2bdccc8c8bbb' WHERE creado_por IS NULL AND origen = 'manual';
UPDATE public.editorial_articulos SET creado_por = 'ceb22752-726c-4377-8f40-2bdccc8c8bbb' WHERE creado_por IS NULL;
UPDATE public.editorial_versiones SET autor_id = 'ceb22752-726c-4377-8f40-2bdccc8c8bbb' WHERE autor_id IS NULL AND origen = 'marco';

CREATE INDEX IF NOT EXISTS editorial_propuestas_asignado_idx ON public.editorial_propuestas (asignado_a) WHERE asignado_a IS NOT NULL;

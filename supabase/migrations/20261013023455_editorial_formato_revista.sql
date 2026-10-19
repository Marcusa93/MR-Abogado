-- Editorial: versión en formato de revista jurídica (notas al pie, resumen y
-- palabras clave), generada a pedido y guardada para la versión del artículo.
ALTER TABLE public.editorial_articulos
  ADD COLUMN IF NOT EXISTS formato_revista jsonb,
  ADD COLUMN IF NOT EXISTS formato_revista_version integer;

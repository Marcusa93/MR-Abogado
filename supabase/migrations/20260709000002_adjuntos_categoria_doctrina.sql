-- Sumar 'doctrina' a las categorías de adjuntos (Documentos jurídicos).
ALTER TABLE public.adjuntos DROP CONSTRAINT IF EXISTS adjuntos_categoria_check;
ALTER TABLE public.adjuntos
  ADD CONSTRAINT adjuntos_categoria_check CHECK (
    categoria IS NULL OR categoria IN (
      'dni', 'cuil', 'poder',
      'demanda', 'contestacion', 'prueba', 'escrito', 'apelacion',
      'resolucion', 'sentencia',
      'cedula',
      'constancia', 'pericia', 'contrato', 'captura',
      'doctrina',
      'otro'
    )
  );

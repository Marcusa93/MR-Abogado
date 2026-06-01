-- ============================================================
-- Ampliar CHECK de adjuntos.categoria
--
-- La UI ofrece "demanda", "contestacion", "prueba", "cedula" que
-- el constraint original (00003) no incluía. Mantenemos también
-- las categorías viejas por si hay filas con esos valores.
-- ============================================================

ALTER TABLE public.adjuntos
  DROP CONSTRAINT IF EXISTS adjuntos_categoria_check;

ALTER TABLE public.adjuntos
  ADD CONSTRAINT adjuntos_categoria_check CHECK (
    categoria IS NULL OR categoria IN (
      -- Identificación / poderes
      'dni', 'cuil', 'poder',
      -- Escritos / piezas procesales
      'demanda', 'contestacion', 'prueba', 'escrito', 'apelacion',
      -- Resolutivos
      'resolucion', 'sentencia',
      -- Notificaciones
      'cedula',
      -- Documentación auxiliar
      'constancia', 'pericia', 'contrato', 'captura',
      -- Catch-all
      'otro'
    )
  );

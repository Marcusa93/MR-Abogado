-- Extiende buscar_clientes_por_termino para soportar personas jurídicas.
-- DROP requerido porque cambia el RETURNS TABLE (no se puede CREATE OR REPLACE con distinta firma).
DROP FUNCTION IF EXISTS public.buscar_clientes_por_termino(text, int);

-- Extiende buscar_clientes_por_termino para soportar personas jurídicas:
-- agrega razon_social y tipo_persona al resultado y a la búsqueda.

CREATE OR REPLACE FUNCTION public.buscar_clientes_por_termino(
  p_termino text,
  p_limit   int DEFAULT 20
)
RETURNS TABLE (
  id                uuid,
  apellido          text,
  nombre            text,
  dni               text,
  cuil              text,
  razon_social      text,
  tipo_persona      text,
  expedientes_count int,
  es_placeholder    boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.apellido,
    c.nombre,
    c.dni::text,
    c.cuil::text,
    c.razon_social,
    c.tipo_persona,
    COALESCE((SELECT count(*)::int FROM public.expedientes e WHERE e.cliente_id = c.id AND e.deleted_at IS NULL), 0) AS expedientes_count,
    (c.apellido = 'Importado SAE') AS es_placeholder
  FROM public.clientes c
  WHERE c.deleted_at IS NULL
    AND (
      p_termino IS NULL
      OR p_termino = ''
      OR c.apellido      ILIKE '%' || p_termino || '%'
      OR c.nombre        ILIKE '%' || p_termino || '%'
      OR c.razon_social  ILIKE '%' || p_termino || '%'
      OR c.dni           ILIKE '%' || p_termino || '%'
      OR c.cuil          ILIKE '%' || p_termino || '%'
    )
  ORDER BY
    CASE WHEN COALESCE(c.apellido, c.razon_social) ILIKE p_termino || '%' THEN 0 ELSE 1 END,
    COALESCE(c.apellido, c.razon_social),
    c.nombre
  LIMIT GREATEST(p_limit, 1)
$$;

GRANT EXECUTE ON FUNCTION public.buscar_clientes_por_termino(text, int) TO authenticated;

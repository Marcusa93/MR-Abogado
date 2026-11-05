-- Función RPC para el tablero Kanban de expedientes.
-- Acepta p_profile_id para filtrar por "Mis causas" vía expediente_miembros.
CREATE OR REPLACE FUNCTION public.get_kanban_data(
  p_tipo_tramite_id uuid DEFAULT NULL,
  p_prioridad       text DEFAULT NULL,
  p_profile_id      uuid DEFAULT NULL
)
RETURNS TABLE (
  id               uuid,
  numero           text,
  caratula         text,
  estado_interno   text,
  prioridad        text,
  cliente_nombre   text,
  cliente_apellido text,
  abogado_nombre   text,
  abogado_apellido text,
  tipo_tramite     text,
  tipo_tramite_nombre text,
  fecha_alta       date,
  updated_at       timestamptz,
  dias_en_estado   integer,
  tareas_pendientes integer,
  proximo_turno    date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.numero,
    e.caratula,
    e.estado_interno,
    e.prioridad,
    c.nombre       AS cliente_nombre,
    c.apellido     AS cliente_apellido,
    pr.nombre      AS abogado_nombre,
    pr.apellido    AS abogado_apellido,
    e.tipo_tramite_id::text AS tipo_tramite,
    tt.nombre      AS tipo_tramite_nombre,
    e.fecha_alta,
    e.updated_at,
    COALESCE(
      EXTRACT(DAY FROM (now() - e.etapa_actual_desde))::integer,
      EXTRACT(DAY FROM (now() - e.updated_at))::integer
    )              AS dias_en_estado,
    (
      SELECT COUNT(*)::integer
      FROM tareas t
      WHERE t.expediente_id = e.id
        AND t.estado IN ('PENDIENTE', 'EN_PROGRESO')
    )              AS tareas_pendientes,
    (
      SELECT a.fecha
      FROM audiencias a
      WHERE a.expediente_id = e.id
        AND a.fecha >= CURRENT_DATE
        AND a.estado IN ('PENDIENTE', 'CONFIRMADA')
      ORDER BY a.fecha ASC
      LIMIT 1
    )              AS proximo_turno
  FROM expedientes e
  LEFT JOIN clientes c        ON c.id  = e.cliente_id
  LEFT JOIN profiles pr       ON pr.id = e.abogado_responsable_id
  LEFT JOIN tipos_tramite tt  ON tt.id = e.tipo_tramite_id
  WHERE e.deleted_at IS NULL
    AND (p_tipo_tramite_id IS NULL OR e.tipo_tramite_id = p_tipo_tramite_id)
    AND (p_prioridad       IS NULL OR e.prioridad        = p_prioridad)
    AND (
      p_profile_id IS NULL
      OR e.abogado_responsable_id = p_profile_id
      OR EXISTS (
        SELECT 1 FROM expediente_miembros em
        WHERE em.expediente_id = e.id
          AND em.profile_id    = p_profile_id
          AND em.activo        = true
      )
    )
  ORDER BY e.updated_at DESC
  LIMIT 500;
$$;

GRANT EXECUTE ON FUNCTION public.get_kanban_data(uuid, text, uuid) TO authenticated;
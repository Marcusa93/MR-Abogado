-- ============================================================
-- Seguimiento activo por expediente
-- Permite marcar expedientes individuales para monitoreo diario
-- (vs. el chequeo semanal genérico de auto_alertas_seguimiento_pendiente)
-- ============================================================

ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS seguimiento_activo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_expedientes_seguimiento_activo
  ON public.expedientes (id) WHERE seguimiento_activo = true;

-- ============================================================
-- Función: alertas diarias para expedientes con seguimiento activo
-- Ventana de inactividad: 2 días (vs 7 del chequeo semanal)
-- Dedup: no crea si ya hay una alerta ACTIVA del mismo tipo
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_alertas_seguimiento_activo()
RETURNS jsonb AS $$
DECLARE
  v_count int := 0;
BEGIN
  INSERT INTO public.alertas (expediente_id, tipo, titulo, mensaje, destinatario_id, prioridad, fecha_vencimiento)
  SELECT
    e.id,
    'SEGUIMIENTO_PENDIENTE',
    'Seguimiento pendiente: ' || e.numero,
    'El expediente ' || e.numero || ' (' || c.apellido || ' ' || c.nombre
      || ') está en seguimiento activo y no registra actividad en las últimas 48 horas.',
    (SELECT profile_id FROM public.expediente_miembros
     WHERE expediente_id = e.id AND rol = 'abogado' AND activo = true LIMIT 1),
    'ALTA',
    CURRENT_DATE + interval '1 day'
  FROM public.expedientes e
  JOIN public.clientes c ON c.id = e.cliente_id
  WHERE e.seguimiento_activo = true
    AND e.deleted_at IS NULL
    AND e.estado_interno NOT IN ('FINALIZADO', 'NO_VIABLE_RECHAZADO', 'NUEVA_CONSULTA')
    AND NOT EXISTS (
      SELECT 1 FROM public.seguimientos s
      WHERE s.expediente_id = e.id
        AND s.fecha_control >= CURRENT_DATE - interval '2 days'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.alertas a
      WHERE a.expediente_id = e.id
        AND a.tipo = 'SEGUIMIENTO_PENDIENTE'
        AND a.estado = 'ACTIVA'
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('alertas_creadas', v_count, 'tipo', 'SEGUIMIENTO_PENDIENTE_ACTIVO');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- Programar ejecución diaria a las 8am Argentina (= 11:00 UTC)
-- Requiere pg_cron habilitado (disponible en Supabase)
-- ============================================================
SELECT cron.schedule(
  'seguimiento-activo-diario',
  '0 11 * * *',
  'SELECT public.auto_alertas_seguimiento_activo()'
) WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'seguimiento-activo-diario'
);

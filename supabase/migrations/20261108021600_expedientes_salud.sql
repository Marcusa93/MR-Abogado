-- Salud de cada expediente (semáforo) y resumen de un expediente.
-- Lo usan la lista de expedientes (semáforo y filtros rápidos), el tablero por etapa,
-- la pantalla Resumen del expediente y la vista por cliente.
-- Respetan la visibilidad: solo devuelven expedientes que el usuario puede ver.

CREATE OR REPLACE FUNCTION public.expedientes_salud(p_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  expediente_id uuid,
  semaforo text,              -- rojo | amarillo | verde | gris
  motivos text[],
  ultimo_movimiento date,
  dias_sin_movimiento integer,
  proxima_audiencia date,
  proximo_plazo date,
  plazos_vencidos integer,
  tareas_vencidas integer,
  sin_responsable boolean,
  estado_desactualizado boolean,
  dormido boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH
  hoy AS (SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS d),
  base AS (
    SELECT e.id, e.estado_interno, e.abogado_responsable_id,
           coalesce(e.fecha_alta, e.created_at::date) AS alta
    FROM expedientes e
    WHERE e.deleted_at IS NULL
      AND (p_ids IS NULL OR e.id = ANY (p_ids))
      AND auth.uid() IS NOT NULL
      AND can_view_expediente(e.id)
  ),
  mov AS (
    SELECT m.expediente_id, max(m.fecha) AS ultimo
    FROM sae_movements m JOIN base b ON b.id = m.expediente_id
    GROUP BY m.expediente_id
  ),
  aud AS (
    SELECT a.expediente_id,
           min(a.fecha) AS proxima,
           bool_or(a.profesional_asistente_id IS NULL AND a.fecha <= (SELECT d FROM hoy) + 3) AS sin_abogado_pronto,
           bool_or(a.profesional_asistente_id IS NULL) AS sin_abogado
    FROM audiencias a JOIN base b ON b.id = a.expediente_id
    WHERE a.fecha BETWEEN (SELECT d FROM hoy) AND (SELECT d FROM hoy) + 15
      AND coalesce(a.estado, '') <> 'CANCELADA'
    GROUP BY a.expediente_id
  ),
  aud_futura AS (
    SELECT a.expediente_id, min(a.fecha) AS proxima
    FROM audiencias a JOIN base b ON b.id = a.expediente_id
    WHERE a.fecha >= (SELECT d FROM hoy) AND coalesce(a.estado, '') <> 'CANCELADA'
    GROUP BY a.expediente_id
  ),
  tar AS (
    SELECT t.expediente_id,
           count(*) FILTER (WHERE t.es_plazo_judicial AND t.fecha_vencimiento < (SELECT d FROM hoy)) AS plazos_vencidos,
           min(t.fecha_vencimiento) FILTER (WHERE t.es_plazo_judicial AND t.fecha_vencimiento >= (SELECT d FROM hoy)) AS proximo_plazo,
           count(*) FILTER (WHERE t.fecha_vencimiento < (SELECT d FROM hoy)) AS vencidas,
           count(*) FILTER (WHERE t.fecha_vencimiento < (SELECT d FROM hoy) - 7) AS vencidas_semana
    FROM tareas t JOIN base b ON b.id = t.expediente_id
    WHERE t.estado IN ('PENDIENTE', 'EN_PROGRESO')
    GROUP BY t.expediente_id
  ),
  calc AS (
    SELECT b.id, b.estado_interno,
           b.estado_interno IN ('PARA_INICIAR','INICIADO','PRUEBA','ALEGATOS','SENTENCIA','APELACION','CORTE') AS en_tramite,
           mov.ultimo,
           CASE WHEN mov.ultimo IS NOT NULL THEN (SELECT d FROM hoy) - mov.ultimo END AS dias_mov,
           CASE WHEN b.estado_interno = 'PARA_INICIAR' AND mov.ultimo IS NULL THEN (SELECT d FROM hoy) - b.alta END AS dias_para_iniciar,
           af.proxima AS proxima_audiencia,
           coalesce(aud.sin_abogado_pronto, false) AS aud_sin_abogado_pronto,
           coalesce(aud.sin_abogado, false) AS aud_sin_abogado,
           tar.proximo_plazo,
           coalesce(tar.plazos_vencidos, 0)::int AS plazos_vencidos,
           coalesce(tar.vencidas, 0)::int AS tareas_vencidas,
           coalesce(tar.vencidas_semana, 0)::int AS vencidas_semana,
           b.abogado_responsable_id IS NULL AS sin_resp,
           (b.estado_interno IN ('PARA_INICIAR', 'NUEVA_CONSULTA') AND mov.ultimo IS NOT NULL) AS desactualizado
    FROM base b
    LEFT JOIN mov ON mov.expediente_id = b.id
    LEFT JOIN aud ON aud.expediente_id = b.id
    LEFT JOIN aud_futura af ON af.expediente_id = b.id
    LEFT JOIN tar ON tar.expediente_id = b.id
  ),
  motivos AS (
    SELECT c.*,
      array_remove(ARRAY[
        CASE WHEN c.plazos_vencidos > 0 THEN 'R:' || c.plazos_vencidos || CASE WHEN c.plazos_vencidos = 1 THEN ' plazo judicial vencido' ELSE ' plazos judiciales vencidos' END END,
        CASE WHEN c.aud_sin_abogado_pronto THEN 'R:Audiencia en 3 días sin abogado asignado' END,
        CASE WHEN c.en_tramite AND c.estado_interno <> 'PARA_INICIAR' AND c.dias_mov >= 120 THEN 'R:' || c.dias_mov || ' días sin movimiento en el SAE' END,
        CASE WHEN c.vencidas_semana > 0 THEN 'R:Tareas vencidas hace más de una semana' END,
        CASE WHEN c.proximo_plazo IS NOT NULL AND c.proximo_plazo <= (SELECT d FROM hoy) + 3 THEN 'A:Plazo judicial el ' || to_char(c.proximo_plazo, 'DD/MM') END,
        CASE WHEN c.aud_sin_abogado AND NOT c.aud_sin_abogado_pronto THEN 'A:Audiencia próxima sin abogado asignado' END,
        CASE WHEN c.en_tramite AND c.estado_interno <> 'PARA_INICIAR' AND c.dias_mov BETWEEN 60 AND 119 THEN 'A:' || c.dias_mov || ' días sin movimiento en el SAE' END,
        CASE WHEN c.dias_para_iniciar >= 30 THEN 'A:Para iniciar hace ' || c.dias_para_iniciar || ' días' END,
        CASE WHEN c.desactualizado THEN 'A:Ya tiene movimientos en el SAE: pasar a en trámite' END,
        CASE WHEN c.tareas_vencidas > 0 AND c.vencidas_semana = 0 THEN 'A:' || c.tareas_vencidas || CASE WHEN c.tareas_vencidas = 1 THEN ' tarea vencida' ELSE ' tareas vencidas' END END,
        CASE WHEN c.en_tramite AND c.sin_resp THEN 'A:Sin responsable' END
      ], NULL) AS m
    FROM calc c
  )
  SELECT
    x.id,
    CASE
      WHEN x.estado_interno IN ('FINALIZADO', 'NO_VIABLE_RECHAZADO', 'PAUSADO') THEN 'gris'
      WHEN EXISTS (SELECT 1 FROM unnest(x.m) v WHERE v LIKE 'R:%') THEN 'rojo'
      WHEN cardinality(x.m) > 0 THEN 'amarillo'
      WHEN x.estado_interno = 'NUEVA_CONSULTA' THEN 'gris'
      ELSE 'verde'
    END,
    CASE WHEN x.estado_interno IN ('FINALIZADO', 'NO_VIABLE_RECHAZADO', 'PAUSADO') THEN '{}'::text[]
         ELSE ARRAY(SELECT substr(v, 3) FROM unnest(x.m) v) END,
    x.ultimo,
    x.dias_mov,
    x.proxima_audiencia,
    x.proximo_plazo,
    x.plazos_vencidos,
    x.tareas_vencidas,
    x.en_tramite AND x.sin_resp,
    x.desactualizado,
    (x.en_tramite AND x.estado_interno <> 'PARA_INICIAR' AND coalesce(x.dias_mov, 0) >= 60) OR coalesce(x.dias_para_iniciar, 0) >= 30
  FROM motivos x;
$$;

REVOKE ALL ON FUNCTION public.expedientes_salud(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expedientes_salud(uuid[]) TO authenticated, service_role;


-- Hitos del proceso detectados en los movimientos del SAE (primera fecha de cada uno).
CREATE OR REPLACE FUNCTION public.expediente_hitos(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH m AS (
    SELECT fecha, upper(coalesce(titulo, '')) AS t, tipo_movimiento::text AS tipo
    FROM sae_movements
    WHERE expediente_id = p_id AND auth.uid() IS NOT NULL AND can_view_expediente(p_id)
  ),
  base AS (
    SELECT
      (SELECT min(fecha) FROM m WHERE t ~ 'MEDIACI|MEDIADOR') AS mediacion,
      (SELECT min(fecha) FROM m WHERE t ~ 'DEMANDA' AND t !~ 'CONTEST') AS demanda,
      (SELECT min(fecha) FROM m WHERE t ~ '(CONTESTA|CONTESTO|CONTESTACI[OÓ]N DE( LA)?) DEMANDA|AMPARO CONTESTACI') AS contestacion,
      (SELECT min(fecha) FROM m WHERE tipo = 'prueba' OR t ~ 'A PRUEBA|OFREZCO PRUEBA|CUADERNO DE PRUEBA|PERIODO DE PRUEBA|PERÍODO DE PRUEBA') AS prueba,
      (SELECT min(fecha) FROM m WHERE t ~ 'ALEGAT') AS alegatos,
      (SELECT min(fecha) FROM m WHERE t ~ 'SENTENCIA DEFINITIVA|SENTENCIA (DE )?FONDO|SENTENCIA ADMITE AMPARO|SENTENCIA MONITORIA|^SENTENCIA$') AS sentencia
  ),
  -- Apelación y ejecución solo cuentan después de la sentencia (antes son recursos o medidas
  -- de trámite); la mediación, solo antes de la demanda.
  h(orden, clave, label, fecha) AS (
    SELECT 1, 'mediacion', 'Mediación', CASE WHEN b.demanda IS NULL OR b.mediacion <= b.demanda THEN b.mediacion END FROM base b
    UNION ALL SELECT 2, 'demanda', 'Demanda', b.demanda FROM base b
    UNION ALL SELECT 3, 'contestacion', 'Contestación', b.contestacion FROM base b
    UNION ALL SELECT 4, 'prueba', 'Prueba', b.prueba FROM base b
    UNION ALL SELECT 5, 'alegatos', 'Alegatos', b.alegatos FROM base b
    UNION ALL SELECT 6, 'sentencia', 'Sentencia', b.sentencia FROM base b
    UNION ALL SELECT 7, 'apelacion', 'Apelación',
      (SELECT min(fecha) FROM m WHERE b.sentencia IS NOT NULL AND fecha >= b.sentencia
         AND t ~ 'APELA|INTERPONGO RECURSO|RECURSO DE CASACI|CONCEDE|MEMORIAL|AGRAVIOS|ELEV') FROM base b
    UNION ALL SELECT 8, 'ejecucion', 'Ejecución',
      (SELECT min(fecha) FROM m WHERE b.sentencia IS NOT NULL AND fecha >= b.sentencia
         AND t ~ 'EJECUCI|^EJEC|EMBARGO|PLANILLA|LIQUIDACI') FROM base b
  )
  SELECT jsonb_build_object(
    'inicio', (SELECT min(fecha) FROM m),
    'ultimo', (SELECT max(fecha) FROM m),
    'movimientos', (SELECT count(*) FROM m),
    'hitos', coalesce((SELECT jsonb_agg(jsonb_build_object('clave', clave, 'label', label, 'fecha', fecha) ORDER BY orden) FROM h), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.expediente_hitos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expediente_hitos(uuid) TO authenticated, service_role;

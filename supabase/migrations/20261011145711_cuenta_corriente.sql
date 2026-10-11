-- Cuenta corriente por cliente y por expediente.
--
-- DEBE (lo que el cliente debe):
--   - honorarios_cargos: honorarios pactados, cuotas, anticipos (nuevo)
--   - abonos mensuales devengados (clientes_abono_mensual, un cargo por mes,
--     desde que el abono se cargó en el sistema)
--   - gastos recuperables adelantados en sus expedientes
-- HABER (lo que pagó):
--   - ingresos del cliente o de sus expedientes (salvo tipo 'consulta', que se
--     cobra en el momento y no genera saldo)
--   - gastos marcados como recuperados (recuperado_at)
--
-- La vista cuenta_corriente_movimientos usa security_invoker: respeta el RLS
-- de las tablas de caja (solo quien tiene acceso a caja ve movimientos).

-- ── 1. Cargos (honorarios pactados, cuotas, anticipos) ───────────────────────

CREATE TABLE IF NOT EXISTS public.honorarios_cargos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id     uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  expediente_id  uuid REFERENCES public.expedientes(id) ON DELETE SET NULL,
  tipo           text NOT NULL DEFAULT 'honorario'
                   CHECK (tipo IN ('honorario', 'cuota', 'anticipo', 'regulacion', 'otro')),
  concepto       text NOT NULL,
  monto          numeric(14,2) NOT NULL CHECK (monto > 0),
  moneda         public.moneda_caja NOT NULL DEFAULT 'ARS',
  fecha          date NOT NULL DEFAULT CURRENT_DATE,
  vencimiento    date,
  -- Cuotas de un mismo plan comparten plan_id
  plan_id        uuid,
  cuota_numero   integer,
  cuotas_total   integer,
  notas          text,
  created_by     uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_honorarios_cargos_cliente ON public.honorarios_cargos(cliente_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_honorarios_cargos_expediente ON public.honorarios_cargos(expediente_id) WHERE deleted_at IS NULL;

ALTER TABLE public.honorarios_cargos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS honorarios_cargos_caja ON public.honorarios_cargos;
CREATE POLICY honorarios_cargos_caja ON public.honorarios_cargos
  FOR ALL USING (public.can_access_caja()) WITH CHECK (public.can_access_caja());

REVOKE ALL ON public.honorarios_cargos FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.honorarios_cargos TO authenticated;

DROP TRIGGER IF EXISTS audit_row_change ON public.honorarios_cargos;
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON public.honorarios_cargos
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- ── 2. Movimientos de la cuenta corriente ─────────────────────────────────────

CREATE OR REPLACE VIEW public.cuenta_corriente_movimientos
WITH (security_invoker = true) AS
SELECT mov.*, e.caratula AS expediente_caratula, e.numero AS expediente_numero
FROM (
  -- Honorarios pactados / cuotas
  SELECT 'cargo'::text AS clase, h.tipo AS tipo, 'honorarios_cargos'::text AS ref_tabla, h.id AS ref_id,
         h.cliente_id, h.expediente_id, h.fecha, h.vencimiento, h.concepto,
         h.monto AS debe, 0::numeric AS haber, h.moneda::text AS moneda
  FROM public.honorarios_cargos h
  WHERE h.deleted_at IS NULL

  UNION ALL
  -- Abonos mensuales: un cargo por mes de vigencia, al día de cobro
  SELECT 'cargo', 'abono', 'clientes_abono_mensual', a.id,
         a.cliente_id, NULL::uuid,
         cobro.fecha, cobro.fecha,
         'Abono ' || to_char(mes, 'MM/YYYY'),
         a.monto, 0, a.moneda::text
  FROM public.clientes_abono_mensual a
  -- Desde que el abono se cargó en el sistema (o su inicio, si es posterior):
  -- los meses previos no tienen pagos registrados acá y figurarían impagos.
  CROSS JOIN LATERAL generate_series(
    date_trunc('month', GREATEST(a.fecha_inicio, a.created_at::date)::timestamp),
    date_trunc('month', LEAST(
      COALESCE(a.fecha_fin, CASE WHEN a.activo THEN CURRENT_DATE ELSE a.updated_at::date END),
      CURRENT_DATE)::timestamp),
    interval '1 month') AS mes
  CROSS JOIN LATERAL (
    SELECT make_date(extract(year FROM mes)::int, extract(month FROM mes)::int,
                     LEAST(a.dia_de_cobro, extract(day FROM (mes + interval '1 month' - interval '1 day'))::int)) AS fecha
  ) cobro

  UNION ALL
  -- Gastos recuperables adelantados por el estudio
  SELECT 'cargo', 'gasto', 'gastos', g.id,
         ex.cliente_id, g.expediente_id, g.fecha, g.fecha,
         'Gasto: ' || COALESCE(NULLIF(g.descripcion, ''), g.categoria),
         g.monto, 0, g.moneda::text
  FROM public.gastos g
  JOIN public.expedientes ex ON ex.id = g.expediente_id
  WHERE g.deleted_at IS NULL AND g.recuperable

  UNION ALL
  -- Gastos marcados como recuperados
  SELECT 'pago', 'reintegro', 'gastos', g.id,
         ex.cliente_id, g.expediente_id, g.recuperado_at::date, NULL::date,
         'Reintegro de gasto: ' || COALESCE(NULLIF(g.descripcion, ''), g.categoria),
         0, g.monto, g.moneda::text
  FROM public.gastos g
  JOIN public.expedientes ex ON ex.id = g.expediente_id
  WHERE g.deleted_at IS NULL AND g.recuperable AND g.recuperado_at IS NOT NULL

  UNION ALL
  -- Pagos
  SELECT 'pago', i.tipo, 'ingresos', i.id,
         COALESCE(i.cliente_id, ex.cliente_id), i.expediente_id, i.fecha, NULL::date,
         COALESCE(NULLIF(i.descripcion, ''), CASE i.tipo
           WHEN 'abono_mensual' THEN 'Pago de abono'
           WHEN 'honorario_expediente' THEN 'Pago de honorarios'
           WHEN 'anticipo' THEN 'Anticipo'
           WHEN 'pacto_quota_litis' THEN 'Pago cuota litis'
           ELSE 'Pago' END),
         0, i.monto, i.moneda::text
  FROM public.ingresos i
  LEFT JOIN public.expedientes ex ON ex.id = i.expediente_id
  WHERE i.deleted_at IS NULL AND i.tipo <> 'consulta'
) mov
LEFT JOIN public.expedientes e ON e.id = mov.expediente_id;

GRANT SELECT ON public.cuenta_corriente_movimientos TO authenticated;
REVOKE ALL ON public.cuenta_corriente_movimientos FROM anon;

-- ── 3. Saldos por cliente (deudores) ──────────────────────────────────────────
-- Vencido = cargos ya vencidos menos todo lo pagado (si es positivo).

CREATE OR REPLACE FUNCTION public.cuentas_corrientes_saldos()
RETURNS TABLE (
  cliente_id uuid, nombre text, apellido text,
  saldo_ars numeric, saldo_usd numeric,
  vencido_ars numeric, vencido_usd numeric,
  ultimo_pago date, proximo_vencimiento date
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH m AS (
    SELECT * FROM public.cuenta_corriente_movimientos WHERE cliente_id IS NOT NULL
  ), agg AS (
    SELECT cliente_id,
      SUM(debe - haber) FILTER (WHERE moneda = 'ARS') AS saldo_ars,
      SUM(debe - haber) FILTER (WHERE moneda = 'USD') AS saldo_usd,
      SUM(debe) FILTER (WHERE moneda = 'ARS' AND clase = 'cargo' AND COALESCE(vencimiento, fecha) <= CURRENT_DATE) AS venc_ars,
      SUM(debe) FILTER (WHERE moneda = 'USD' AND clase = 'cargo' AND COALESCE(vencimiento, fecha) <= CURRENT_DATE) AS venc_usd,
      SUM(haber) FILTER (WHERE moneda = 'ARS') AS pagos_ars,
      SUM(haber) FILTER (WHERE moneda = 'USD') AS pagos_usd,
      MAX(fecha) FILTER (WHERE clase = 'pago') AS ultimo_pago,
      MIN(COALESCE(vencimiento, fecha)) FILTER (WHERE clase = 'cargo' AND COALESCE(vencimiento, fecha) > CURRENT_DATE) AS proximo_vencimiento
    FROM m GROUP BY cliente_id
  )
  SELECT a.cliente_id, c.nombre, c.apellido,
         COALESCE(a.saldo_ars, 0), COALESCE(a.saldo_usd, 0),
         GREATEST(COALESCE(a.venc_ars, 0) - COALESCE(a.pagos_ars, 0), 0),
         GREATEST(COALESCE(a.venc_usd, 0) - COALESCE(a.pagos_usd, 0), 0),
         a.ultimo_pago, a.proximo_vencimiento
  FROM agg a
  JOIN public.clientes c ON c.id = a.cliente_id
  WHERE c.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.cuentas_corrientes_saldos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cuentas_corrientes_saldos() TO authenticated;

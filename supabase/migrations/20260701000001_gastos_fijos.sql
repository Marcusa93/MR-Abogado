-- ============================================================
-- Gastos fijos del estudio: alquiler, sueldos, servicios, etc.
--
-- Espejo de clientes_abono_mensual pero para egresos internos.
-- Cada mes aparecen como "pendientes" hasta que se registra
-- el gasto correspondiente.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1) Tabla gastos_fijos
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.gastos_fijos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  descripcion   text NOT NULL,
  monto         numeric(14, 2) NOT NULL CHECK (monto > 0),
  moneda        public.moneda_caja NOT NULL DEFAULT 'ARS',
  categoria     text NOT NULL CHECK (categoria IN (
    'timbrado', 'oficios', 'pericia', 'viaticos', 'cedulas',
    'fotocopias', 'estacionamiento', 'alquiler', 'servicios',
    'sueldos', 'honorarios_externos', 'impuestos', 'software',
    'libros_bibliografia', 'otro'
  )),
  fecha_inicio  date NOT NULL DEFAULT CURRENT_DATE,
  fecha_fin     date,
  activo        boolean NOT NULL DEFAULT true,
  notas         text,
  created_by    uuid NOT NULL REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gastos_fijos_fechas_check
    CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

COMMENT ON TABLE public.gastos_fijos IS
  'Gastos fijos recurrentes del estudio (alquiler, sueldos, servicios, etc.). '
  'Se muestran cada mes como pendientes hasta registrar el pago efectivo.';

CREATE INDEX IF NOT EXISTS idx_gastos_fijos_activo
  ON public.gastos_fijos(activo, fecha_inicio);

DROP TRIGGER IF EXISTS trg_gastos_fijos_updated_at ON public.gastos_fijos;
CREATE TRIGGER trg_gastos_fijos_updated_at
  BEFORE UPDATE ON public.gastos_fijos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 2) RLS
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.gastos_fijos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gastos_fijos_all_caja ON public.gastos_fijos;
CREATE POLICY gastos_fijos_all_caja ON public.gastos_fijos
  FOR ALL
  USING (public.can_access_caja())
  WITH CHECK (public.can_access_caja());

-- ─────────────────────────────────────────────────────────────
-- 3) Columna gasto_fijo_id en gastos
--    Permite detectar qué gastos ya fueron registrados este mes
--    para un gasto fijo dado.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.gastos
  ADD COLUMN IF NOT EXISTS gasto_fijo_id uuid
    REFERENCES public.gastos_fijos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_gastos_fijo_id
  ON public.gastos(gasto_fijo_id, fecha)
  WHERE gasto_fijo_id IS NOT NULL AND deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 4) RPC: gastos fijos con estado para el mes dado
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.gastos_fijos_pendientes_mes(
  p_year  int DEFAULT NULL,
  p_month int DEFAULT NULL
)
RETURNS TABLE (
  gasto_fijo_id  uuid,
  descripcion    text,
  monto          numeric,
  moneda         public.moneda_caja,
  categoria      text,
  notas          text,
  estado         text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_year        int  := COALESCE(p_year,  EXTRACT(YEAR  FROM CURRENT_DATE)::int);
  v_month       int  := COALESCE(p_month, EXTRACT(MONTH FROM CURRENT_DATE)::int);
  v_inicio_mes  date;
  v_fin_mes     date;
BEGIN
  IF NOT public.can_access_caja() THEN
    RAISE EXCEPTION 'Sin acceso a caja' USING ERRCODE = 'P0403';
  END IF;

  v_inicio_mes := make_date(v_year, v_month, 1);
  v_fin_mes    := (v_inicio_mes + interval '1 month')::date;

  RETURN QUERY
  SELECT
    gf.id          AS gasto_fijo_id,
    gf.descripcion,
    gf.monto,
    gf.moneda,
    gf.categoria,
    gf.notas,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.gastos g
        WHERE g.gasto_fijo_id = gf.id
          AND g.fecha >= v_inicio_mes
          AND g.fecha <  v_fin_mes
          AND g.deleted_at IS NULL
      ) THEN 'registrado'
      ELSE 'pendiente'
    END AS estado
  FROM public.gastos_fijos gf
  WHERE gf.activo = true
    AND gf.fecha_inicio < v_fin_mes
    AND (gf.fecha_fin IS NULL OR gf.fecha_fin >= v_inicio_mes)
  ORDER BY
    (CASE WHEN EXISTS (
      SELECT 1 FROM public.gastos g
      WHERE g.gasto_fijo_id = gf.id
        AND g.fecha >= v_inicio_mes
        AND g.fecha <  v_fin_mes
        AND g.deleted_at IS NULL
    ) THEN 1 ELSE 0 END),
    gf.descripcion;
END;
$$;

GRANT EXECUTE ON FUNCTION public.gastos_fijos_pendientes_mes(int, int) TO authenticated;

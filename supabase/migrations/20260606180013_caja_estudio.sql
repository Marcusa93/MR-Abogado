-- ============================================================
-- Caja del estudio: gastos, ingresos, abonos mensuales y recordatorios
--
-- Acceso restringido vía profiles.tiene_acceso_caja. Permite que
-- mañana Marco habilite a un nuevo socio sin redeploy.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1) Flag de acceso en profiles
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tiene_acceso_caja boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.tiene_acceso_caja IS
  'Si true, este perfil puede ver y editar la caja del estudio (gastos, ingresos, abonos). Restringido por convicción societaria, no por jerarquía.';

CREATE INDEX IF NOT EXISTS idx_profiles_acceso_caja
  ON public.profiles(id) WHERE tiene_acceso_caja = true;

-- Activación inicial: Marco + cualquier ADMIN o DIRECTOR (red de seguridad
-- por si el lookup por email falla).
UPDATE public.profiles p
SET tiene_acceso_caja = true
WHERE p.rol IN ('ADMIN', 'DIRECTOR')
   OR EXISTS (
     SELECT 1 FROM auth.users u
     WHERE u.id = p.id
       AND u.email = 'marco.rossi@derecho.unt.edu.ar'
   );

-- Helper SECURITY DEFINER para usar en RLS
CREATE OR REPLACE FUNCTION public.can_access_caja()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT tiene_acceso_caja FROM public.profiles WHERE id = auth.uid()
  ), false);
$$;

GRANT EXECUTE ON FUNCTION public.can_access_caja() TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2) Catálogos
-- ─────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'moneda_caja') THEN
    CREATE TYPE public.moneda_caja AS ENUM ('ARS', 'USD');
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────
-- 3) Tabla gastos
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.gastos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha             date NOT NULL DEFAULT CURRENT_DATE,
  monto             numeric(14, 2) NOT NULL CHECK (monto > 0),
  moneda            public.moneda_caja NOT NULL DEFAULT 'ARS',
  categoria         text NOT NULL CHECK (categoria IN (
    'timbrado', 'oficios', 'pericia', 'viaticos', 'cedulas',
    'fotocopias', 'estacionamiento', 'alquiler', 'servicios',
    'sueldos', 'honorarios_externos', 'impuestos', 'software',
    'libros_bibliografia', 'otro'
  )),
  expediente_id     uuid REFERENCES public.expedientes(id) ON DELETE SET NULL,
  descripcion       text,
  comprobante_path  text,
  recuperable       boolean NOT NULL DEFAULT false,
  recuperado_at     timestamptz,
  cargado_por       uuid NOT NULL REFERENCES public.profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

COMMENT ON TABLE public.gastos IS
  'Gastos del estudio. recuperable=true cuando es trasladable al cliente del expediente.';

CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON public.gastos(fecha) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_gastos_expediente ON public.gastos(expediente_id) WHERE expediente_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_gastos_categoria ON public.gastos(categoria) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_gastos_recuperable ON public.gastos(recuperable, recuperado_at) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_gastos_updated_at ON public.gastos;
CREATE TRIGGER trg_gastos_updated_at
  BEFORE UPDATE ON public.gastos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 4) Tabla ingresos
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ingresos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha             date NOT NULL DEFAULT CURRENT_DATE,
  monto             numeric(14, 2) NOT NULL CHECK (monto > 0),
  moneda            public.moneda_caja NOT NULL DEFAULT 'ARS',
  tipo              text NOT NULL CHECK (tipo IN (
    'abono_mensual', 'honorario_expediente', 'anticipo',
    'consulta', 'pacto_quota_litis', 'otro'
  )),
  categoria         text,
  cliente_id        uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  expediente_id     uuid REFERENCES public.expedientes(id) ON DELETE SET NULL,
  abono_id          uuid,
  periodo_year      int,
  periodo_month     int CHECK (periodo_month BETWEEN 1 AND 12),
  descripcion       text,
  comprobante_path  text,
  cargado_por       uuid NOT NULL REFERENCES public.profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

COMMENT ON TABLE public.ingresos IS
  'Ingresos del estudio. Cuando tipo=abono_mensual, se llenan periodo_year/month + abono_id para tracking de cobranza recurrente.';

CREATE INDEX IF NOT EXISTS idx_ingresos_fecha ON public.ingresos(fecha) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ingresos_cliente ON public.ingresos(cliente_id) WHERE cliente_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ingresos_expediente ON public.ingresos(expediente_id) WHERE expediente_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ingresos_periodo ON public.ingresos(abono_id, periodo_year, periodo_month) WHERE abono_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ingresos_tipo ON public.ingresos(tipo) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_ingresos_updated_at ON public.ingresos;
CREATE TRIGGER trg_ingresos_updated_at
  BEFORE UPDATE ON public.ingresos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 5) Tabla clientes_abono_mensual
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.clientes_abono_mensual (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  monto           numeric(14, 2) NOT NULL CHECK (monto > 0),
  moneda          public.moneda_caja NOT NULL DEFAULT 'ARS',
  dia_de_cobro    int NOT NULL CHECK (dia_de_cobro BETWEEN 1 AND 28),
  fecha_inicio    date NOT NULL,
  fecha_fin       date,
  activo          boolean NOT NULL DEFAULT true,
  notas           text,
  created_by      uuid NOT NULL REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.clientes_abono_mensual IS
  'Clientes con abono recurrente mensual. Define monto, día de cobro y vigencia. dia_de_cobro limitado a 1-28 para evitar problemas de febrero.';

CREATE INDEX IF NOT EXISTS idx_abonos_cliente ON public.clientes_abono_mensual(cliente_id) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_abonos_activo ON public.clientes_abono_mensual(activo, dia_de_cobro);

DROP TRIGGER IF EXISTS trg_abonos_updated_at ON public.clientes_abono_mensual;
CREATE TRIGGER trg_abonos_updated_at
  BEFORE UPDATE ON public.clientes_abono_mensual
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- FK desde ingresos.abono_id (lazy porque la tabla nace después)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ingresos_abono_id_fkey'
  ) THEN
    ALTER TABLE public.ingresos
      ADD CONSTRAINT ingresos_abono_id_fkey
      FOREIGN KEY (abono_id) REFERENCES public.clientes_abono_mensual(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────
-- 6) RLS — todo solo para can_access_caja()
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.gastos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingresos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes_abono_mensual ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gastos_all_caja ON public.gastos;
CREATE POLICY gastos_all_caja ON public.gastos
  FOR ALL
  USING (public.can_access_caja() AND deleted_at IS NULL)
  WITH CHECK (public.can_access_caja());

DROP POLICY IF EXISTS ingresos_all_caja ON public.ingresos;
CREATE POLICY ingresos_all_caja ON public.ingresos
  FOR ALL
  USING (public.can_access_caja() AND deleted_at IS NULL)
  WITH CHECK (public.can_access_caja());

DROP POLICY IF EXISTS abonos_all_caja ON public.clientes_abono_mensual;
CREATE POLICY abonos_all_caja ON public.clientes_abono_mensual
  FOR ALL
  USING (public.can_access_caja())
  WITH CHECK (public.can_access_caja());

-- ─────────────────────────────────────────────────────────────
-- 7) RPC: estado de cobranza del mes actual
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.caja_pagos_pendientes_mes(
  p_year  int DEFAULT NULL,
  p_month int DEFAULT NULL
)
RETURNS TABLE (
  abono_id          uuid,
  cliente_id        uuid,
  cliente_nombre    text,
  cliente_apellido  text,
  monto             numeric,
  moneda            public.moneda_caja,
  dia_de_cobro      int,
  vence_el          date,
  dias_atraso       int,
  estado            text,
  ultimo_pago       date
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_year  int := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::int);
  v_month int := COALESCE(p_month, EXTRACT(MONTH FROM CURRENT_DATE)::int);
BEGIN
  IF NOT public.can_access_caja() THEN
    RAISE EXCEPTION 'Sin acceso a caja' USING ERRCODE = 'P0403';
  END IF;

  RETURN QUERY
  SELECT
    a.id                                                    AS abono_id,
    a.cliente_id,
    c.nombre                                                AS cliente_nombre,
    c.apellido                                              AS cliente_apellido,
    a.monto,
    a.moneda,
    a.dia_de_cobro,
    make_date(v_year, v_month, a.dia_de_cobro)              AS vence_el,
    GREATEST(0, (CURRENT_DATE - make_date(v_year, v_month, a.dia_de_cobro)))::int AS dias_atraso,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.ingresos i
        WHERE i.abono_id = a.id
          AND i.periodo_year = v_year
          AND i.periodo_month = v_month
          AND i.deleted_at IS NULL
      ) THEN 'pagado'
      WHEN CURRENT_DATE < make_date(v_year, v_month, a.dia_de_cobro) THEN 'por_vencer'
      WHEN CURRENT_DATE - make_date(v_year, v_month, a.dia_de_cobro) > 5 THEN 'atrasado'
      ELSE 'pendiente'
    END                                                     AS estado,
    (
      SELECT max(i.fecha) FROM public.ingresos i
      WHERE i.abono_id = a.id AND i.deleted_at IS NULL
    )                                                       AS ultimo_pago
  FROM public.clientes_abono_mensual a
  JOIN public.clientes c ON c.id = a.cliente_id
  WHERE a.activo = true
    AND a.fecha_inicio <= make_date(v_year, v_month, 28)
    AND (a.fecha_fin IS NULL OR a.fecha_fin >= make_date(v_year, v_month, 1))
  ORDER BY
    (CASE
      WHEN EXISTS (SELECT 1 FROM public.ingresos i WHERE i.abono_id = a.id AND i.periodo_year = v_year AND i.periodo_month = v_month AND i.deleted_at IS NULL) THEN 3
      WHEN CURRENT_DATE - make_date(v_year, v_month, a.dia_de_cobro) > 5 THEN 0
      WHEN CURRENT_DATE >= make_date(v_year, v_month, a.dia_de_cobro) THEN 1
      ELSE 2
    END),
    a.dia_de_cobro ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.caja_pagos_pendientes_mes(int, int) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 8) RPC: resumen mensual + anual
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.caja_resumen()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_y int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  v_m int := EXTRACT(MONTH FROM CURRENT_DATE)::int;
  v_inicio_mes date := make_date(v_y, v_m, 1);
  v_inicio_anio date := make_date(v_y, 1, 1);
BEGIN
  IF NOT public.can_access_caja() THEN
    RAISE EXCEPTION 'Sin acceso a caja' USING ERRCODE = 'P0403';
  END IF;

  SELECT jsonb_build_object(
    'periodo', jsonb_build_object('year', v_y, 'month', v_m),

    'mes_actual', jsonb_build_object(
      'ingresos_ars', COALESCE((
        SELECT sum(monto) FROM public.ingresos
        WHERE deleted_at IS NULL AND moneda = 'ARS' AND fecha >= v_inicio_mes
      ), 0),
      'ingresos_usd', COALESCE((
        SELECT sum(monto) FROM public.ingresos
        WHERE deleted_at IS NULL AND moneda = 'USD' AND fecha >= v_inicio_mes
      ), 0),
      'gastos_ars', COALESCE((
        SELECT sum(monto) FROM public.gastos
        WHERE deleted_at IS NULL AND moneda = 'ARS' AND fecha >= v_inicio_mes
      ), 0),
      'gastos_usd', COALESCE((
        SELECT sum(monto) FROM public.gastos
        WHERE deleted_at IS NULL AND moneda = 'USD' AND fecha >= v_inicio_mes
      ), 0)
    ),

    'anio_actual', jsonb_build_object(
      'ingresos_ars', COALESCE((
        SELECT sum(monto) FROM public.ingresos
        WHERE deleted_at IS NULL AND moneda = 'ARS' AND fecha >= v_inicio_anio
      ), 0),
      'gastos_ars', COALESCE((
        SELECT sum(monto) FROM public.gastos
        WHERE deleted_at IS NULL AND moneda = 'ARS' AND fecha >= v_inicio_anio
      ), 0)
    ),

    'gastos_por_categoria_mes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('categoria', categoria, 'monto', total) ORDER BY total DESC)
      FROM (
        SELECT categoria, sum(monto)::numeric AS total
        FROM public.gastos
        WHERE deleted_at IS NULL AND moneda = 'ARS' AND fecha >= v_inicio_mes
        GROUP BY categoria
      ) s
    ), '[]'::jsonb),

    'ingresos_por_tipo_mes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('tipo', tipo, 'monto', total) ORDER BY total DESC)
      FROM (
        SELECT tipo, sum(monto)::numeric AS total
        FROM public.ingresos
        WHERE deleted_at IS NULL AND moneda = 'ARS' AND fecha >= v_inicio_mes
        GROUP BY tipo
      ) s
    ), '[]'::jsonb),

    'abonos_activos', (
      SELECT count(*)::int FROM public.clientes_abono_mensual WHERE activo = true
    ),
    'abonos_total_mensual_ars', COALESCE((
      SELECT sum(monto) FROM public.clientes_abono_mensual WHERE activo = true AND moneda = 'ARS'
    ), 0),

    'pagos_pendientes_count', COALESCE((
      SELECT count(*)::int
      FROM public.caja_pagos_pendientes_mes(v_y, v_m)
      WHERE estado IN ('pendiente', 'atrasado')
    ), 0),
    'pagos_atrasados_count', COALESCE((
      SELECT count(*)::int
      FROM public.caja_pagos_pendientes_mes(v_y, v_m)
      WHERE estado = 'atrasado'
    ), 0)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.caja_resumen() TO authenticated;

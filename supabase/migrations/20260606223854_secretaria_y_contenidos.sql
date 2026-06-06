-- ============================================================
-- Rol SECRETARIA + módulo de Contenidos
--
-- - Suma SECRETARIA al CHECK constraint de profiles.rol.
-- - Helper is_secretaria() para usar en RLS y UI.
-- - Tabla contenidos: borradores de redes/comunicaciones/newsletter,
--   pensada para que la creadora de contenidos del estudio trabaje
--   sin meterse con lo jurídico.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1) Rol SECRETARIA
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_rol_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_rol_check
  CHECK (rol IN ('DIRECTOR', 'ADMIN', 'ABOGADO', 'COLABORADOR', 'SECRETARIA'));

COMMENT ON COLUMN public.profiles.rol IS
  'Roles del sistema: DIRECTOR (socio fundador, ve todo), ADMIN (administrador), ABOGADO (matriculado), COLABORADOR (no letrado del equipo jurídico), SECRETARIA (gestión administrativa y contenidos, sin acceso a IA jurídica).';

CREATE OR REPLACE FUNCTION public.is_secretaria()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT rol = 'SECRETARIA' FROM public.profiles WHERE id = auth.uid()
  ), false);
$$;

GRANT EXECUTE ON FUNCTION public.is_secretaria() TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2) Tabla contenidos
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contenidos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo        text NOT NULL CHECK (btrim(titulo) <> ''),
  categoria     text NOT NULL CHECK (categoria IN (
    'instagram', 'linkedin', 'facebook', 'twitter',
    'newsletter', 'email_cliente', 'whatsapp_difusion',
    'blog', 'video_guion', 'otro'
  )),
  estado        text NOT NULL DEFAULT 'borrador'
                CHECK (estado IN ('borrador', 'en_revision', 'aprobado', 'publicado', 'archivado')),
  cuerpo        text,
  notas_internas text,
  hashtags      text,
  enlace_referencia text,
  publicar_el   date,
  publicado_at  timestamptz,
  publicado_url text,
  created_by    uuid NOT NULL REFERENCES public.profiles(id),
  asignado_a    uuid REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

COMMENT ON TABLE public.contenidos IS
  'Borradores y posts del estudio para redes sociales, newsletters, emails a clientes y otros canales. Pensado para la creadora de contenidos (SECRETARIA) en flujo borrador → revisión → aprobado → publicado.';

CREATE INDEX IF NOT EXISTS idx_contenidos_estado ON public.contenidos(estado) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contenidos_categoria ON public.contenidos(categoria) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contenidos_publicar_el ON public.contenidos(publicar_el) WHERE publicar_el IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contenidos_created_by ON public.contenidos(created_by) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_contenidos_updated_at ON public.contenidos;
CREATE TRIGGER trg_contenidos_updated_at
  BEFORE UPDATE ON public.contenidos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.contenidos ENABLE ROW LEVEL SECURITY;

-- Cualquiera del equipo ve y edita contenidos (es operativo, no sensible).
-- Admin/Director también pueden borrar/aprobar.
DROP POLICY IF EXISTS contenidos_select_all ON public.contenidos;
CREATE POLICY contenidos_select_all ON public.contenidos
  FOR SELECT USING (auth.uid() IS NOT NULL AND deleted_at IS NULL);

DROP POLICY IF EXISTS contenidos_insert ON public.contenidos;
CREATE POLICY contenidos_insert ON public.contenidos
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());

DROP POLICY IF EXISTS contenidos_update ON public.contenidos;
CREATE POLICY contenidos_update ON public.contenidos
  FOR UPDATE USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS contenidos_delete ON public.contenidos;
CREATE POLICY contenidos_delete ON public.contenidos
  FOR DELETE USING (
    created_by = auth.uid() OR public.is_admin()
  );

-- ─────────────────────────────────────────────────────────────
-- 3) RPC: "Hoy en el estudio" — vista resumen del día
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.hoy_en_el_estudio()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
  v_today date := CURRENT_DATE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'P0401';
  END IF;

  SELECT jsonb_build_object(
    'fecha', v_today,
    'usuario', (SELECT jsonb_build_object('nombre', nombre, 'apellido', apellido, 'rol', rol) FROM public.profiles WHERE id = v_uid),

    'audiencias_hoy', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'hora', a.fecha,
          'tipo', a.tipo,
          'expediente_id', a.expediente_id,
          'expediente_caratula', e.caratula,
          'expediente_numero', e.numero,
          'cliente_nombre', c.nombre,
          'cliente_apellido', c.apellido,
          'organismo', o.nombre,
          'estado', a.estado
        ) ORDER BY a.fecha
      )
      FROM public.audiencias a
      JOIN public.expedientes e ON e.id = a.expediente_id
      JOIN public.clientes c ON c.id = e.cliente_id
      LEFT JOIN public.organismos o ON o.id = e.organismo_id
      WHERE a.fecha::date = v_today
        AND a.estado IN ('PENDIENTE','CONFIRMADA')
        AND public.can_view_expediente(a.expediente_id)
    ), '[]'::jsonb),

    'tareas_pendientes', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'titulo', t.titulo,
          'descripcion', t.descripcion,
          'prioridad', t.prioridad,
          'fecha_vencimiento', t.fecha_vencimiento,
          'expediente_id', t.expediente_id,
          'expediente_caratula', e.caratula,
          'estado', t.estado,
          'vencida', (t.fecha_vencimiento IS NOT NULL AND t.fecha_vencimiento < v_today)
        ) ORDER BY
          (CASE WHEN t.fecha_vencimiento IS NOT NULL AND t.fecha_vencimiento < v_today THEN 0
                WHEN t.fecha_vencimiento = v_today THEN 1
                ELSE 2 END),
          t.fecha_vencimiento NULLS LAST,
          (CASE t.prioridad WHEN 'URGENTE' THEN 0 WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 ELSE 3 END)
      )
      FROM public.tareas t
      LEFT JOIN public.expedientes e ON e.id = t.expediente_id
      WHERE t.estado IN ('PENDIENTE','EN_PROGRESO')
        AND (t.asignado_a = v_uid OR t.created_by = v_uid)
      LIMIT 12
    ), '[]'::jsonb),

    'tareas_hoy_count', (
      SELECT count(*)::int FROM public.tareas t
      WHERE t.estado IN ('PENDIENTE','EN_PROGRESO')
        AND (t.asignado_a = v_uid OR t.created_by = v_uid)
        AND t.fecha_vencimiento = v_today
    ),

    'tareas_vencidas_count', (
      SELECT count(*)::int FROM public.tareas t
      WHERE t.estado IN ('PENDIENTE','EN_PROGRESO')
        AND (t.asignado_a = v_uid OR t.created_by = v_uid)
        AND t.fecha_vencimiento IS NOT NULL
        AND t.fecha_vencimiento < v_today
    ),

    'contenidos_pendientes', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'titulo', c.titulo,
          'categoria', c.categoria,
          'estado', c.estado,
          'publicar_el', c.publicar_el
        ) ORDER BY c.publicar_el NULLS LAST, c.updated_at DESC
      )
      FROM public.contenidos c
      WHERE c.deleted_at IS NULL
        AND c.estado IN ('borrador','en_revision','aprobado')
        AND (c.created_by = v_uid OR c.asignado_a = v_uid)
      LIMIT 6
    ), '[]'::jsonb),

    'consultas_nuevas_count', (
      SELECT count(*)::int FROM public.clientes
      WHERE deleted_at IS NULL
        AND created_at >= v_today - interval '7 days'
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hoy_en_el_estudio() TO authenticated;

COMMENT ON FUNCTION public.hoy_en_el_estudio IS
  'Resumen del día para el dashboard "Hoy". Devuelve audiencias del día, tareas pendientes/vencidas, contenidos pendientes y conteo de consultas nuevas. RLS-aware vía can_view_expediente para audiencias.';

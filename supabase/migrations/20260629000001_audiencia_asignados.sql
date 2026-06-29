-- Asignación de usuarios a audiencias y notificación automática.
-- audiencia_asignados: relación N:M entre audiencias y profiles.
-- Al insertar una fila, el trigger crea una alerta AUDIENCIA_PROXIMA
-- para el usuario asignado.

-- ── Tabla ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audiencia_asignados (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audiencia_id uuid NOT NULL REFERENCES public.audiencias(id) ON DELETE CASCADE,
  profile_id   uuid NOT NULL REFERENCES public.profiles(id)   ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (audiencia_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_audiencia_asignados_audiencia
  ON public.audiencia_asignados (audiencia_id);
CREATE INDEX IF NOT EXISTS idx_audiencia_asignados_profile
  ON public.audiencia_asignados (profile_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.audiencia_asignados ENABLE ROW LEVEL SECURITY;

-- Cualquiera que pueda ver el expediente puede ver los asignados.
CREATE POLICY "asignados_select" ON public.audiencia_asignados
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.audiencias a
      WHERE a.id = audiencia_asignados.audiencia_id
        AND public.can_view_expediente(a.expediente_id)
    )
  );

-- Cualquier miembro autenticado con visibilidad puede asignar.
CREATE POLICY "asignados_insert" ON public.audiencia_asignados
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.audiencias a
      WHERE a.id = audiencia_asignados.audiencia_id
        AND public.can_view_expediente(a.expediente_id)
    )
  );

-- Solo roles con permisos de edición pueden quitar asignados.
CREATE POLICY "asignados_delete" ON public.audiencia_asignados
  FOR DELETE USING (
    public.current_user_role() = ANY (ARRAY['ADMIN','DIRECTOR','ABOGADO','SECRETARIA'])
    AND EXISTS (
      SELECT 1 FROM public.audiencias a
      WHERE a.id = audiencia_asignados.audiencia_id
        AND public.can_view_expediente(a.expediente_id)
    )
  );

-- ── Trigger: alerta automática al asignar ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_audiencia_asignado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expediente_id uuid;
  v_fecha         date;
  v_hora          time;
  v_tipo_id       uuid;
  v_tipo_nombre   text;
  v_titulo        text;
  v_mensaje       text;
BEGIN
  SELECT a.expediente_id, a.fecha, a.hora, a.tipo_audiencia_id
    INTO v_expediente_id, v_fecha, v_hora, v_tipo_id
    FROM public.audiencias a
   WHERE a.id = NEW.audiencia_id;

  IF v_tipo_id IS NOT NULL THEN
    SELECT nombre INTO v_tipo_nombre
      FROM public.catalogo_tipos_audiencia WHERE id = v_tipo_id;
  END IF;

  v_titulo  := COALESCE(v_tipo_nombre, 'Audiencia') || ' — ' || to_char(v_fecha, 'DD/MM/YYYY');
  IF v_hora IS NOT NULL THEN
    v_titulo := v_titulo || ' ' || to_char(v_hora, 'HH24:MI');
  END IF;
  v_mensaje := 'Fuiste asignado/a a esta audiencia.';

  INSERT INTO public.alertas (
    expediente_id, tipo, titulo, mensaje,
    destinatario_id, prioridad, estado, origen, fecha_vencimiento
  ) VALUES (
    v_expediente_id, 'AUDIENCIA_PROXIMA', v_titulo, v_mensaje,
    NEW.profile_id, 'ALTA', 'ACTIVA', 'AUTOMATICA', v_fecha
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_audiencia_asignado error: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audiencia_asignados_notify ON public.audiencia_asignados;
CREATE TRIGGER audiencia_asignados_notify
  AFTER INSERT ON public.audiencia_asignados
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_audiencia_asignado();

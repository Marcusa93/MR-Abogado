-- Seguimiento de diligencias de prueba para la procuración automática.
--
-- Cada oficio / testigo / pericia / cédula / mandamiento que se ordena en un
-- expediente procurado queda registrado con su ciclo de vida:
--   ordenado → confeccionado → enviado → contestado
-- (o notificado / diligenciado / fracasado / reiterado).
-- procuracion-procesar actualiza estados al leer cada actuación y, en el
-- control diario, crea tareas cuando algo se traba:
--   - diligencia propia ordenada y no enviada → urgir confección/envío
--   - oficio propio enviado, vencido y sin respuesta → reiteración / astreintes
--   - testigo sin notificar con audiencia próxima → controlar notificación

CREATE TABLE IF NOT EXISTS public.procuracion_diligencias (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id       uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  tipo                text NOT NULL CHECK (tipo IN ('oficio', 'testigo', 'pericia', 'cedula', 'mandamiento', 'otro')),
  destinatario        text NOT NULL,
  a_pedido            text NOT NULL DEFAULT 'nuestra' CHECK (a_pedido IN ('nuestra', 'contraria', 'juzgado')),
  estado              text NOT NULL DEFAULT 'ordenado' CHECK (estado IN (
                        'ordenado', 'confeccionado', 'enviado', 'contestado',
                        'notificado', 'diligenciado', 'fracasado', 'reiterado', 'desistido')),
  fecha_ordenado      date,
  fecha_envio         date,
  -- Plazo de respuesta: el que fija el oficio/decreto o, si no hay, un control
  plazo_respuesta_dias integer,
  plazo_es_control    boolean NOT NULL DEFAULT false,
  vence_respuesta     date,
  fecha_audiencia     date,
  fecha_respuesta     date,
  origen_movement_id     uuid REFERENCES public.sae_movements(id) ON DELETE SET NULL,
  ultimo_movement_id     uuid REFERENCES public.sae_movements(id) ON DELETE SET NULL,
  -- Tareas de control ya creadas (para no repetirlas)
  tarea_envio_id      uuid REFERENCES public.tareas(id) ON DELETE SET NULL,
  tarea_reiteracion_id uuid REFERENCES public.tareas(id) ON DELETE SET NULL,
  tarea_testigo_id    uuid REFERENCES public.tareas(id) ON DELETE SET NULL,
  notas               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_procuracion_diligencias_expediente
  ON public.procuracion_diligencias(expediente_id, estado);

ALTER TABLE public.procuracion_diligencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS procuracion_diligencias_select ON public.procuracion_diligencias;
CREATE POLICY procuracion_diligencias_select ON public.procuracion_diligencias
  FOR SELECT USING (public.can_view_expediente(expediente_id));

-- Corrección manual desde la app (ej. "ya se contestó", "desistido").
DROP POLICY IF EXISTS procuracion_diligencias_update ON public.procuracion_diligencias;
CREATE POLICY procuracion_diligencias_update ON public.procuracion_diligencias
  FOR UPDATE
  USING (public.can_view_expediente(expediente_id)
         AND public.current_user_role() = ANY (ARRAY['ADMIN', 'DIRECTOR', 'ABOGADO', 'COLABORADOR', 'SECRETARIA', 'CRITERIO']))
  WITH CHECK (public.can_view_expediente(expediente_id));

REVOKE ALL ON public.procuracion_diligencias FROM anon;
GRANT SELECT, UPDATE ON public.procuracion_diligencias TO authenticated;

-- Etapa procesal que detecta el procurador en cada actuación.
ALTER TABLE public.procuracion_eventos ADD COLUMN IF NOT EXISTS etapa text;

-- El procurador NO redacta solo: propone el escrito y se redacta cuando el
-- abogado lo aprueba (botón en la app o en Telegram).
ALTER TABLE public.procuracion_eventos ADD COLUMN IF NOT EXISTS escrito_instrucciones text;
ALTER TABLE public.procuracion_diligencias
  ADD COLUMN IF NOT EXISTS reiteracion_escrito_id uuid REFERENCES public.escritos(id) ON DELETE SET NULL;

-- Ficha del caso: de qué trata cada expediente y en qué está.
--
-- Una fila por expediente con lo esencial (resumen, demanda, contestación,
-- prueba, resoluciones, próximo paso). La IA la arma la primera vez desde el
-- SAE y después, con cada movimiento relevante, deja una PROPUESTA que el
-- abogado acepta o descarta: nunca pisa la ficha por su cuenta.

CREATE TABLE public.expediente_fichas (
  expediente_id   uuid PRIMARY KEY REFERENCES public.expedientes(id) ON DELETE CASCADE,
  resumen         text NOT NULL DEFAULT '',
  demanda         text NOT NULL DEFAULT '',
  contestacion    text NOT NULL DEFAULT '',
  -- [{id, medio, detalle, estado: ofrecida|producida|pendiente|desistida}]
  prueba          jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- [{id, fecha, texto}]
  resoluciones    jsonb NOT NULL DEFAULT '[]'::jsonb,
  proximo_paso    text NOT NULL DEFAULT '',
  -- false mientras la armó la IA y nadie la revisó
  revisada        boolean NOT NULL DEFAULT false,
  -- created_at del último movimiento del SAE ya considerado
  revisado_hasta  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE public.expediente_ficha_propuestas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id   uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  origen          text NOT NULL CHECK (origen IN ('sae', 'dictado')),
  titulo          text NOT NULL,
  -- [{campo, modo?, texto?, medio?, detalle?, estado?, prueba_id?, fecha?, completar?}]
  cambios         jsonb NOT NULL DEFAULT '[]'::jsonb,
  estado          text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aplicada', 'descartada')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  resuelta_at     timestamptz,
  resuelta_por    uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX idx_ficha_propuestas_pendientes
  ON public.expediente_ficha_propuestas (expediente_id, created_at)
  WHERE estado = 'pendiente';

ALTER TABLE public.expediente_fichas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expediente_ficha_propuestas ENABLE ROW LEVEL SECURITY;

CREATE POLICY fichas_select ON public.expediente_fichas FOR SELECT TO authenticated
  USING (public.can_view_expediente(expediente_id));
CREATE POLICY fichas_insert ON public.expediente_fichas FOR INSERT TO authenticated
  WITH CHECK (public.can_view_expediente(expediente_id));
CREATE POLICY fichas_update ON public.expediente_fichas FOR UPDATE TO authenticated
  USING (public.can_view_expediente(expediente_id))
  WITH CHECK (public.can_view_expediente(expediente_id));

CREATE POLICY ficha_propuestas_select ON public.expediente_ficha_propuestas FOR SELECT TO authenticated
  USING (public.can_view_expediente(expediente_id));
CREATE POLICY ficha_propuestas_update ON public.expediente_ficha_propuestas FOR UPDATE TO authenticated
  USING (public.can_view_expediente(expediente_id))
  WITH CHECK (public.can_view_expediente(expediente_id));
-- Las propuestas las crea solo la edge function (service role).

CREATE TRIGGER trg_expediente_fichas_updated_at
  BEFORE UPDATE ON public.expediente_fichas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.expediente_fichas IS 'Ficha del caso: resumen, demanda, contestación, prueba, resoluciones y próximo paso de cada expediente.';
COMMENT ON TABLE public.expediente_ficha_propuestas IS 'Cambios a la ficha propuestos por la IA (desde el SAE o un dictado) que esperan confirmación.';

-- Preguntas que solo el abogado puede responder, por campo
-- (p. ej. {"contestacion": "¿Qué defensas opuso?"}: el SAE trae el título del escrito, no el texto)
ALTER TABLE public.expediente_fichas ADD COLUMN completar jsonb NOT NULL DEFAULT '{}'::jsonb;

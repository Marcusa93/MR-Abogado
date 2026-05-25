-- ============================================================
-- Migración 056: Brief estructurado del expediente (Capa 2)
--
-- Modela la "memoria viva" del expediente:
--   - expediente_brief_entries: entradas atómicas y VERSIONADAS
--   - expediente_brief_preguntas: preguntas abiertas que la IA hace
--   - expediente_brief_contradicciones: choques detectados
--
-- Reglas duras (las garantías que pedimos):
--   1. Nada se sobreescribe: cada cambio crea una nueva versión y
--      desactiva la anterior. Histórico inmutable.
--   2. Cada entry lleva `source` y `created_by` — siempre sabés si
--      la dijo la IA, vos, o vino de una actuación.
--   3. `confidence='confirmada_humana'` marca lo validado por vos.
--   4. RLS hereda del expediente: si podés ver el expediente, ves
--      su brief; si no, no.
--
-- La columna `ai_brief` original de migración 031 NO se toca:
--   el brief estructurado vive 100% en estas tablas. El text bruto
--   queda como histórico/fallback.
-- ============================================================

-- ============================================================
-- 1) Entradas del brief (atómicas, versionadas)
-- ============================================================
CREATE TABLE public.expediente_brief_entries (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id               uuid NOT NULL,
  expediente_id          uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  seccion                text NOT NULL CHECK (seccion IN (
    'hechos', 'partes', 'estrategia', 'riesgos',
    'decisiones', 'normativa', 'jurisprudencia', 'hitos', 'observaciones'
  )),
  tipo                   text NOT NULL CHECK (tipo IN (
    'hecho', 'hipotesis', 'decision_estrategica', 'riesgo',
    'parte', 'referencia_norma', 'referencia_jurisprudencia',
    'hito', 'observacion'
  )),
  contenido              text NOT NULL,
  contenido_estructurado jsonb,
  source                 text NOT NULL CHECK (source IN (
    'pregunta_predef', 'input_libre', 'importado_actuacion',
    'generado_por_ia', 'manual'
  )),
  confidence             text NOT NULL DEFAULT 'media' CHECK (confidence IN (
    'baja', 'media', 'alta', 'confirmada_humana'
  )),
  evidence_refs          jsonb NOT NULL DEFAULT '[]'::jsonb,
  version                integer NOT NULL DEFAULT 1,
  is_active              boolean NOT NULL DEFAULT true,
  superseded_by          uuid REFERENCES public.expediente_brief_entries(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CHECK (version >= 1)
);

COMMENT ON TABLE public.expediente_brief_entries IS
  'Entradas atómicas del brief estructurado. Versionadas: cada cambio crea nueva versión y desactiva la anterior. Solo una versión por chain_id puede estar activa simultáneamente.';
COMMENT ON COLUMN public.expediente_brief_entries.chain_id IS
  'Identidad de la entrada que se mantiene entre versiones. Al crear una entrada nueva, chain_id = id. Al versionar, hereda chain_id del padre.';
COMMENT ON COLUMN public.expediente_brief_entries.source IS
  'De dónde proviene la entrada: pregunta_predef, input_libre del usuario, importado_actuacion (SAE), generado_por_ia (al armar el brief), manual (edición humana directa).';
COMMENT ON COLUMN public.expediente_brief_entries.evidence_refs IS
  'Array JSON con referencias de evidencia. Schema flexible: [{kind:"actuacion",id:"..."},{kind:"escrito",id:"..."},{kind:"norma",documento_id:"...",chunk_id:1},{kind:"jurisprudencia",doc_id:"..."}].';
COMMENT ON COLUMN public.expediente_brief_entries.confidence IS
  'baja/media/alta = nivel de confianza de la IA o estimación. "confirmada_humana" = vos validaste o escribiste vos.';

-- Solo una versión activa por chain (clave para que el brief actual no se duplique)
CREATE UNIQUE INDEX uq_brief_entry_active_chain
  ON public.expediente_brief_entries(chain_id)
  WHERE is_active = true;

CREATE INDEX idx_brief_entries_expediente_active
  ON public.expediente_brief_entries(expediente_id, seccion)
  WHERE is_active = true;

CREATE INDEX idx_brief_entries_chain ON public.expediente_brief_entries(chain_id);
CREATE INDEX idx_brief_entries_created_by ON public.expediente_brief_entries(created_by);

-- ============================================================
-- 2) Preguntas abiertas (la IA quiere saber X)
-- ============================================================
CREATE TABLE public.expediente_brief_preguntas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id       uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  pregunta            text NOT NULL,
  origen              text NOT NULL CHECK (origen IN (
    'rulebook', 'ia_brief_gen', 'ia_input_libre', 'manual'
  )),
  contexto            jsonb NOT NULL DEFAULT '{}'::jsonb,
  prioridad           text NOT NULL DEFAULT 'normal' CHECK (prioridad IN ('baja', 'normal', 'alta')),
  estado              text NOT NULL DEFAULT 'pendiente' CHECK (estado IN (
    'pendiente', 'respondida', 'descartada'
  )),
  respuesta_entry_id  uuid REFERENCES public.expediente_brief_entries(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  answered_at         timestamptz,
  answered_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CHECK (
    (estado = 'pendiente'   AND respuesta_entry_id IS NULL AND answered_at IS NULL)
    OR (estado = 'respondida' AND answered_at IS NOT NULL)
    OR (estado = 'descartada' AND answered_at IS NOT NULL)
  )
);

COMMENT ON TABLE public.expediente_brief_preguntas IS
  'Preguntas abiertas que el sistema (IA o rulebook) plantea al abogado. Opt-in: no acumulan deuda visible — viven solo en el panel IA, no en el dashboard.';
COMMENT ON COLUMN public.expediente_brief_preguntas.origen IS
  'Quién generó la pregunta: rulebook (pregunta predefinida por etapa), ia_brief_gen (al armar el brief), ia_input_libre (al procesar texto libre), manual.';
COMMENT ON COLUMN public.expediente_brief_preguntas.contexto IS
  'Contexto opcional para responder: opciones predefinidas, sección/tipo esperada, etapa del proceso, etc.';

CREATE INDEX idx_brief_preguntas_expediente_estado
  ON public.expediente_brief_preguntas(expediente_id, estado);

-- ============================================================
-- 3) Contradicciones detectadas
-- ============================================================
CREATE TABLE public.expediente_brief_contradicciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id   uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  entry_a_id      uuid NOT NULL REFERENCES public.expediente_brief_entries(id) ON DELETE CASCADE,
  entry_b_id      uuid REFERENCES public.expediente_brief_entries(id) ON DELETE CASCADE,
  external_ref    jsonb,
  descripcion     text NOT NULL,
  detectada_por   text NOT NULL CHECK (detectada_por IN ('ia', 'humano')),
  estado          text NOT NULL DEFAULT 'pendiente' CHECK (estado IN (
    'pendiente', 'resuelta', 'descartada'
  )),
  resolucion      text CHECK (resolucion IN (
    'a_vale', 'b_vale', 'ambas_validas', 'reescribir', 'ninguna'
  )),
  resuelta_at     timestamptz,
  resuelta_por    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (
    entry_b_id IS NOT NULL OR external_ref IS NOT NULL
  ),
  CHECK (entry_a_id <> entry_b_id OR entry_b_id IS NULL),
  CHECK (
    (estado = 'pendiente' AND resolucion IS NULL AND resuelta_at IS NULL)
    OR (estado IN ('resuelta', 'descartada') AND resuelta_at IS NOT NULL)
  )
);

COMMENT ON TABLE public.expediente_brief_contradicciones IS
  'Contradicciones detectadas entre entradas del brief, o entre una entrada y una fuente externa (rulebook, actuación, normativa).';
COMMENT ON COLUMN public.expediente_brief_contradicciones.external_ref IS
  'Si entry_b_id es NULL, acá va la referencia a la fuente externa que choca con entry_a. Schema: {kind, ref_id, ref_text}.';

CREATE INDEX idx_brief_contradicciones_expediente_estado
  ON public.expediente_brief_contradicciones(expediente_id, estado);

-- ============================================================
-- 4) RLS — visibilidad heredada del expediente
-- ============================================================
ALTER TABLE public.expediente_brief_entries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expediente_brief_preguntas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expediente_brief_contradicciones  ENABLE ROW LEVEL SECURITY;

-- entries
CREATE POLICY brief_entries_select ON public.expediente_brief_entries
  FOR SELECT TO authenticated
  USING (public.can_view_expediente(expediente_id));

CREATE POLICY brief_entries_insert ON public.expediente_brief_entries
  FOR INSERT TO authenticated
  WITH CHECK (public.can_view_expediente(expediente_id));

CREATE POLICY brief_entries_update ON public.expediente_brief_entries
  FOR UPDATE TO authenticated
  USING (public.can_view_expediente(expediente_id))
  WITH CHECK (public.can_view_expediente(expediente_id));

CREATE POLICY brief_entries_delete ON public.expediente_brief_entries
  FOR DELETE TO authenticated
  USING (public.can_view_expediente(expediente_id));

-- preguntas
CREATE POLICY brief_preguntas_select ON public.expediente_brief_preguntas
  FOR SELECT TO authenticated
  USING (public.can_view_expediente(expediente_id));

CREATE POLICY brief_preguntas_insert ON public.expediente_brief_preguntas
  FOR INSERT TO authenticated
  WITH CHECK (public.can_view_expediente(expediente_id));

CREATE POLICY brief_preguntas_update ON public.expediente_brief_preguntas
  FOR UPDATE TO authenticated
  USING (public.can_view_expediente(expediente_id))
  WITH CHECK (public.can_view_expediente(expediente_id));

CREATE POLICY brief_preguntas_delete ON public.expediente_brief_preguntas
  FOR DELETE TO authenticated
  USING (public.can_view_expediente(expediente_id));

-- contradicciones
CREATE POLICY brief_contradicciones_select ON public.expediente_brief_contradicciones
  FOR SELECT TO authenticated
  USING (public.can_view_expediente(expediente_id));

CREATE POLICY brief_contradicciones_insert ON public.expediente_brief_contradicciones
  FOR INSERT TO authenticated
  WITH CHECK (public.can_view_expediente(expediente_id));

CREATE POLICY brief_contradicciones_update ON public.expediente_brief_contradicciones
  FOR UPDATE TO authenticated
  USING (public.can_view_expediente(expediente_id))
  WITH CHECK (public.can_view_expediente(expediente_id));

CREATE POLICY brief_contradicciones_delete ON public.expediente_brief_contradicciones
  FOR DELETE TO authenticated
  USING (public.can_view_expediente(expediente_id));

-- ============================================================
-- 5) Vista de conveniencia: brief actual armado por sección
-- ============================================================
CREATE OR REPLACE VIEW public.expediente_brief_actual AS
SELECT
  e.id            AS expediente_id,
  e.seccion,
  e.tipo,
  e.id            AS entry_id,
  e.chain_id,
  e.version,
  e.contenido,
  e.contenido_estructurado,
  e.source,
  e.confidence,
  e.evidence_refs,
  e.created_at,
  e.created_by
FROM public.expediente_brief_entries e
WHERE e.is_active = true;

COMMENT ON VIEW public.expediente_brief_actual IS
  'Snapshot del brief vigente: solo entradas activas (la última versión de cada chain). Hereda RLS de expediente_brief_entries.';

-- ============================================================
-- 6) Función para versionar una entry de forma atómica
--
-- Crea una nueva versión basada en una entry existente:
--   - Marca la entry padre como inactive (superseded_by = nueva)
--   - Crea nueva entry con mismo chain_id y version+1
-- Devuelve la nueva entry.
-- ============================================================
CREATE OR REPLACE FUNCTION public.expediente_brief_versionar(
  p_entry_padre_id     uuid,
  p_nuevo_contenido    text,
  p_nuevo_estructurado jsonb DEFAULT NULL,
  p_nueva_source       text DEFAULT 'manual',
  p_nueva_confidence   text DEFAULT 'confirmada_humana',
  p_nuevos_evidence    jsonb DEFAULT NULL
)
RETURNS public.expediente_brief_entries
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_padre  public.expediente_brief_entries%ROWTYPE;
  v_nueva  public.expediente_brief_entries%ROWTYPE;
  v_nuevo_id uuid := gen_random_uuid();
BEGIN
  SELECT * INTO v_padre FROM public.expediente_brief_entries WHERE id = p_entry_padre_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entry padre % no existe', p_entry_padre_id;
  END IF;
  IF NOT v_padre.is_active THEN
    RAISE EXCEPTION 'Entry padre % no está activa (ya fue versionada)', p_entry_padre_id;
  END IF;

  -- Desactivar padre
  UPDATE public.expediente_brief_entries
     SET is_active = false, superseded_by = v_nuevo_id
   WHERE id = p_entry_padre_id;

  -- Crear nueva versión
  INSERT INTO public.expediente_brief_entries (
    id, chain_id, expediente_id, seccion, tipo,
    contenido, contenido_estructurado, source, confidence,
    evidence_refs, version, is_active, created_by
  )
  VALUES (
    v_nuevo_id, v_padre.chain_id, v_padre.expediente_id, v_padre.seccion, v_padre.tipo,
    p_nuevo_contenido,
    COALESCE(p_nuevo_estructurado, v_padre.contenido_estructurado),
    p_nueva_source,
    p_nueva_confidence,
    COALESCE(p_nuevos_evidence, v_padre.evidence_refs),
    v_padre.version + 1,
    true,
    auth.uid()
  )
  RETURNING * INTO v_nueva;

  RETURN v_nueva;
END $$;

COMMENT ON FUNCTION public.expediente_brief_versionar IS
  'Versiona atómicamente una entrada del brief: desactiva la padre, crea una nueva versión con chain_id heredado y version+1. La nueva entry queda como activa.';

-- ============================================================
-- 7) Trigger: al insertar una entry sin chain_id, hace chain_id := id
--    Garantiza que siempre haya chain_id válido sin que el código cliente
--    tenga que pasarlo en el INSERT inicial.
-- ============================================================
CREATE OR REPLACE FUNCTION public.expediente_brief_set_chain_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.chain_id IS NULL THEN
    NEW.chain_id := NEW.id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER set_chain_id_before_insert
  BEFORE INSERT ON public.expediente_brief_entries
  FOR EACH ROW EXECUTE FUNCTION public.expediente_brief_set_chain_id();

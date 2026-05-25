-- ============================================================
-- Migración 054: Rulebook de procesos judiciales (Capa 1)
--
-- Modela el conocimiento reutilizable del dominio:
--   - tipos_proceso_judicial: catálogo (ejecutivo monitorio, daños, etc.)
--   - etapas_proceso: etapas de cada proceso con plazos y decisiones
--   - transiciones_proceso: cómo se pasa de una etapa a otra (grafo)
--   - aprendizajes_rulebook: conocimiento aprendido (capa compartible)
--   - aprendizajes_compartidos: granular sharing entre abogados
--
-- También extiende `expedientes` con tipo_proceso_id + etapa_actual_id
-- para anclar cada caso al rulebook.
--
-- Convivencia con tipos_tramite:
--   `tipos_tramite` sigue siendo el catálogo administrativo (qué tipo de
--   trámite hace el estudio: sucesión, divorcio, daños...).
--   `tipos_proceso_judicial` es el rulebook PROCESAL (cómo se desarrolla
--   ese trámite en sede judicial: etapas, plazos, decisiones).
--   Un expediente puede tener ambos: tipo_tramite (qué) + tipo_proceso (cómo).
-- ============================================================

-- ============================================================
-- 1) Catálogo de tipos de proceso
-- ============================================================
CREATE TABLE public.tipos_proceso_judicial (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo         text NOT NULL UNIQUE,
  nombre         text NOT NULL,
  fuero          text NOT NULL CHECK (fuero IN (
    'civil', 'comercial', 'laboral', 'penal', 'familia',
    'administrativo', 'previsional', 'otro'
  )),
  jurisdiccion   text NOT NULL DEFAULT 'tucuman',
  descripcion    text,
  norma_base     text,
  activo         boolean NOT NULL DEFAULT true,
  orden          integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tipos_proceso_judicial IS
  'Capa 1 del rulebook: catálogo de tipos de proceso judicial. Conocimiento universal del dominio (curado por DIRECTOR).';
COMMENT ON COLUMN public.tipos_proceso_judicial.codigo IS
  'Slug del tipo de proceso (ej: ejecutivo_monitorio_tucuman, danos_perjuicios_tucuman).';
COMMENT ON COLUMN public.tipos_proceso_judicial.norma_base IS
  'Referencia normativa que regula el proceso (ej: CPCC Tucumán arts. 480-510).';

CREATE INDEX idx_tipos_proceso_fuero ON public.tipos_proceso_judicial(fuero) WHERE activo = true;
CREATE INDEX idx_tipos_proceso_jurisdiccion ON public.tipos_proceso_judicial(jurisdiccion) WHERE activo = true;

-- ============================================================
-- 1.b) Relación tipo_proceso ↔ normativa (base + supletoria)
--
-- Algunos procesos se rigen por una norma especial y supletoriamente
-- por otra (ej: sucesiones por CPF y supletoriamente por CPCC; amparo
-- por ley 16.986 y supletoriamente por CPCC). Modelamos N:N con rol.
-- Linkea opcionalmente a normativa_documentos para acceso directo al
-- texto indexado.
-- ============================================================
CREATE TABLE public.tipos_proceso_normas (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_proceso_id          uuid NOT NULL REFERENCES public.tipos_proceso_judicial(id) ON DELETE CASCADE,
  rol                      text NOT NULL CHECK (rol IN ('base', 'supletoria', 'especial')),
  norma_codigo             text NOT NULL,
  norma_descripcion        text,
  normativa_documento_id   uuid REFERENCES public.normativa_documentos(id) ON DELETE SET NULL,
  orden                    integer NOT NULL DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo_proceso_id, rol, norma_codigo)
);

COMMENT ON TABLE public.tipos_proceso_normas IS
  'Relación N:N entre tipos de proceso y la normativa que los regula. Rol distingue base / supletoria / especial. Permite que el panel IA cite el artículo correcto y enlazar al documento indexado.';
COMMENT ON COLUMN public.tipos_proceso_normas.norma_codigo IS
  'Cita corta de la norma (ej: "CPCC arts. 480-510", "Ley 16.986", "CPF arts. 624-660"). Texto libre porque a veces la norma puntual no está cargada en normativa_documentos.';

CREATE INDEX idx_tipos_proceso_normas_tipo ON public.tipos_proceso_normas(tipo_proceso_id);
CREATE INDEX idx_tipos_proceso_normas_doc ON public.tipos_proceso_normas(normativa_documento_id) WHERE normativa_documento_id IS NOT NULL;

-- ============================================================
-- 2) Etapas de cada proceso
-- ============================================================
CREATE TABLE public.etapas_proceso (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_proceso_id     uuid NOT NULL REFERENCES public.tipos_proceso_judicial(id) ON DELETE CASCADE,
  codigo              text NOT NULL,
  nombre              text NOT NULL,
  orden               integer NOT NULL,
  descripcion         text,
  plazo_dias          integer,
  plazo_es_perentorio boolean NOT NULL DEFAULT false,
  decisiones_posibles jsonb NOT NULL DEFAULT '[]'::jsonb,
  escritos_tipicos    jsonb NOT NULL DEFAULT '[]'::jsonb,
  es_terminal         boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo_proceso_id, codigo)
);

COMMENT ON TABLE public.etapas_proceso IS
  'Etapas de cada tipo de proceso. Incluye plazos típicos (días hábiles) y decisiones estratégicas posibles del abogado en esa etapa.';
COMMENT ON COLUMN public.etapas_proceso.decisiones_posibles IS
  'Array JSON de decisiones que el abogado puede tomar en esta etapa. Schema: [{codigo, nombre, descripcion}].';
COMMENT ON COLUMN public.etapas_proceso.escritos_tipicos IS
  'Array JSON de tipos de escrito que se presentan en esta etapa. Schema: [{tipo, descripcion}].';

CREATE INDEX idx_etapas_proceso_tipo ON public.etapas_proceso(tipo_proceso_id);

-- ============================================================
-- 3) Transiciones entre etapas (grafo del proceso)
-- ============================================================
CREATE TABLE public.transiciones_proceso (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etapa_origen_id     uuid NOT NULL REFERENCES public.etapas_proceso(id) ON DELETE CASCADE,
  etapa_destino_id    uuid NOT NULL REFERENCES public.etapas_proceso(id) ON DELETE CASCADE,
  condicion           text NOT NULL,
  descripcion         text,
  plazo_dias          integer,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (etapa_origen_id <> etapa_destino_id)
);

COMMENT ON TABLE public.transiciones_proceso IS
  'Grafo de transiciones entre etapas. Soporta branching (ej: si_opone / si_no_opone en ejecutivo monitorio).';
COMMENT ON COLUMN public.transiciones_proceso.condicion IS
  'Condición de la transición. Ej: "siempre", "si_opone", "si_no_opone", "si_admite_cautelar", "si_rechaza".';

CREATE INDEX idx_transiciones_origen ON public.transiciones_proceso(etapa_origen_id);
CREATE INDEX idx_transiciones_destino ON public.transiciones_proceso(etapa_destino_id);

-- ============================================================
-- 4) Aprendizajes del rulebook (capa 1 enriquecida)
-- ============================================================
CREATE TABLE public.aprendizajes_rulebook (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope                  text NOT NULL DEFAULT 'personal'
                         CHECK (scope IN ('personal', 'compartido', 'universal')),
  owner_id               uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_kind            text NOT NULL
                         CHECK (target_kind IN (
                           'juez', 'organismo', 'tipo_proceso',
                           'etapa_proceso', 'fuero', 'general'
                         )),
  target_ref_text        text,
  target_organismo_id    uuid REFERENCES public.organismos(id),
  tipo_proceso_id        uuid REFERENCES public.tipos_proceso_judicial(id),
  etapa_proceso_id       uuid REFERENCES public.etapas_proceso(id),
  contenido              text NOT NULL,
  contenido_estructurado jsonb,
  confidence             text NOT NULL DEFAULT 'media'
                         CHECK (confidence IN ('baja', 'media', 'alta')),
  observed_in_cases      integer NOT NULL DEFAULT 1,
  is_active              boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid REFERENCES public.profiles(id),
  CHECK (
    (scope = 'universal' AND owner_id IS NULL) OR
    (scope IN ('personal', 'compartido') AND owner_id IS NOT NULL)
  )
);

COMMENT ON TABLE public.aprendizajes_rulebook IS
  'Conocimiento aprendido reutilizable: patrones sobre jueces, juzgados, procesos. Tres scopes: personal (solo autor), compartido (autor + lista explícita en aprendizajes_compartidos), universal (curado por DIRECTOR).';
COMMENT ON COLUMN public.aprendizajes_rulebook.target_kind IS
  'Sobre QUÉ es el aprendizaje: juez, organismo, tipo_proceso, etapa_proceso, fuero, general.';
COMMENT ON COLUMN public.aprendizajes_rulebook.target_ref_text IS
  'Identificador libre del target (ej: "Pérez" para juez, "Juzgado Civil 3a Nom" si no está en organismos).';
COMMENT ON COLUMN public.aprendizajes_rulebook.observed_in_cases IS
  'Cantidad de expedientes que respaldan este aprendizaje. Sube cuando se confirma desde otro caso.';

CREATE INDEX idx_aprendizajes_owner ON public.aprendizajes_rulebook(owner_id) WHERE is_active = true;
CREATE INDEX idx_aprendizajes_target ON public.aprendizajes_rulebook(target_kind, target_ref_text) WHERE is_active = true;
CREATE INDEX idx_aprendizajes_tipo_proceso ON public.aprendizajes_rulebook(tipo_proceso_id) WHERE is_active = true;
CREATE INDEX idx_aprendizajes_organismo ON public.aprendizajes_rulebook(target_organismo_id) WHERE target_organismo_id IS NOT NULL;
CREATE INDEX idx_aprendizajes_scope ON public.aprendizajes_rulebook(scope) WHERE is_active = true;

-- ============================================================
-- 5) Tabla puente: con quién se comparte cada aprendizaje
-- ============================================================
CREATE TABLE public.aprendizajes_compartidos (
  aprendizaje_id  uuid NOT NULL REFERENCES public.aprendizajes_rulebook(id) ON DELETE CASCADE,
  profile_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_at      timestamptz NOT NULL DEFAULT now(),
  granted_by      uuid REFERENCES public.profiles(id),
  PRIMARY KEY (aprendizaje_id, profile_id)
);

COMMENT ON TABLE public.aprendizajes_compartidos IS
  'Permisos granulares: define con qué colegas comparte cada aprendizaje de scope=compartido.';

CREATE INDEX idx_aprendizajes_compartidos_profile ON public.aprendizajes_compartidos(profile_id);

-- ============================================================
-- 6) Extender expedientes con anclaje al rulebook
-- ============================================================
ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS tipo_proceso_id    uuid REFERENCES public.tipos_proceso_judicial(id),
  ADD COLUMN IF NOT EXISTS etapa_actual_id    uuid REFERENCES public.etapas_proceso(id),
  ADD COLUMN IF NOT EXISTS etapa_actual_desde timestamptz;

COMMENT ON COLUMN public.expedientes.tipo_proceso_id IS
  'Anclaje al rulebook (capa 1). Permite calcular etapas, plazos y decisiones esperadas. Opcional — si NULL el panel IA funciona en modo degradado.';
COMMENT ON COLUMN public.expedientes.etapa_actual_id IS
  'Etapa actual del proceso. La IA puede sugerirla desde las actuaciones SAE; siempre requiere confirmación humana.';
COMMENT ON COLUMN public.expedientes.etapa_actual_desde IS
  'Cuándo se entró a la etapa actual. Útil para calcular plazos en curso.';

CREATE INDEX IF NOT EXISTS idx_exp_tipo_proceso ON public.expedientes(tipo_proceso_id) WHERE tipo_proceso_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exp_etapa_actual ON public.expedientes(etapa_actual_id) WHERE etapa_actual_id IS NOT NULL;

-- ============================================================
-- 7) Triggers updated_at
-- ============================================================
CREATE TRIGGER set_updated_at_tipos_proceso_judicial
  BEFORE UPDATE ON public.tipos_proceso_judicial
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_updated_at_aprendizajes_rulebook
  BEFORE UPDATE ON public.aprendizajes_rulebook
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ============================================================
-- 8) RLS
-- ============================================================
ALTER TABLE public.tipos_proceso_judicial    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipos_proceso_normas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etapas_proceso            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transiciones_proceso      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aprendizajes_rulebook     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aprendizajes_compartidos  ENABLE ROW LEVEL SECURITY;

-- Rulebook estructural (tipos/etapas/transiciones): lectura para todos los
-- autenticados, escritura solo DIRECTOR.
CREATE POLICY tipos_proceso_select_all ON public.tipos_proceso_judicial
  FOR SELECT TO authenticated USING (true);
CREATE POLICY tipos_proceso_modify_director ON public.tipos_proceso_judicial
  FOR ALL TO authenticated
  USING (public.is_director())
  WITH CHECK (public.is_director());

CREATE POLICY tipos_proceso_normas_select_all ON public.tipos_proceso_normas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY tipos_proceso_normas_modify_director ON public.tipos_proceso_normas
  FOR ALL TO authenticated
  USING (public.is_director())
  WITH CHECK (public.is_director());

CREATE POLICY etapas_proceso_select_all ON public.etapas_proceso
  FOR SELECT TO authenticated USING (true);
CREATE POLICY etapas_proceso_modify_director ON public.etapas_proceso
  FOR ALL TO authenticated
  USING (public.is_director())
  WITH CHECK (public.is_director());

CREATE POLICY transiciones_select_all ON public.transiciones_proceso
  FOR SELECT TO authenticated USING (true);
CREATE POLICY transiciones_modify_director ON public.transiciones_proceso
  FOR ALL TO authenticated
  USING (public.is_director())
  WITH CHECK (public.is_director());

-- Aprendizajes: visibilidad según scope
CREATE POLICY aprendizajes_select ON public.aprendizajes_rulebook
  FOR SELECT TO authenticated USING (
    is_active = true AND (
      scope = 'universal'
      OR owner_id = auth.uid()
      OR (scope = 'compartido' AND EXISTS (
        SELECT 1 FROM public.aprendizajes_compartidos ac
        WHERE ac.aprendizaje_id = aprendizajes_rulebook.id
          AND ac.profile_id = auth.uid()
      ))
      OR public.is_director()
    )
  );

CREATE POLICY aprendizajes_insert ON public.aprendizajes_rulebook
  FOR INSERT TO authenticated WITH CHECK (
    (scope IN ('personal', 'compartido') AND owner_id = auth.uid())
    OR (scope = 'universal' AND public.is_director())
  );

CREATE POLICY aprendizajes_update ON public.aprendizajes_rulebook
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.is_director())
  WITH CHECK (
    (scope IN ('personal', 'compartido') AND owner_id = auth.uid())
    OR (scope = 'universal' AND public.is_director())
  );

CREATE POLICY aprendizajes_delete ON public.aprendizajes_rulebook
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.is_director());

-- Aprendizajes compartidos: el owner del aprendizaje decide con quién compartir.
-- El destinatario también puede leer su propia fila (para saber qué le compartieron).
CREATE POLICY aprendizajes_compartidos_select ON public.aprendizajes_compartidos
  FOR SELECT TO authenticated USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.aprendizajes_rulebook ar
      WHERE ar.id = aprendizajes_compartidos.aprendizaje_id
        AND ar.owner_id = auth.uid()
    )
    OR public.is_director()
  );

CREATE POLICY aprendizajes_compartidos_modify_owner ON public.aprendizajes_compartidos
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.aprendizajes_rulebook ar
      WHERE ar.id = aprendizajes_compartidos.aprendizaje_id
        AND (ar.owner_id = auth.uid() OR public.is_director())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.aprendizajes_rulebook ar
      WHERE ar.id = aprendizajes_compartidos.aprendizaje_id
        AND (ar.owner_id = auth.uid() OR public.is_director())
    )
  );

-- ============================================================
-- 9) Helper: aprendizajes aplicables a un contexto dado
-- ============================================================
CREATE OR REPLACE FUNCTION public.aprendizajes_aplicables(
  p_tipo_proceso_id uuid DEFAULT NULL,
  p_organismo_id    uuid DEFAULT NULL,
  p_juez            text DEFAULT NULL
)
RETURNS SETOF public.aprendizajes_rulebook
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT *
  FROM public.aprendizajes_rulebook
  WHERE is_active = true
    AND (
      (p_tipo_proceso_id IS NOT NULL AND tipo_proceso_id = p_tipo_proceso_id)
      OR (p_organismo_id IS NOT NULL AND target_organismo_id = p_organismo_id)
      OR (p_juez IS NOT NULL AND target_kind = 'juez' AND target_ref_text ILIKE '%' || p_juez || '%')
      OR (target_kind = 'general' AND tipo_proceso_id IS NULL)
    )
  ORDER BY
    CASE confidence WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END,
    observed_in_cases DESC,
    updated_at DESC
$$;

COMMENT ON FUNCTION public.aprendizajes_aplicables IS
  'Devuelve aprendizajes aplicables a un contexto (tipo de proceso + organismo + juez). RLS filtra automáticamente por scope.';

-- ============================================================
-- Migración: juez/secretaria en expedientes + sentencias +
--            prueba_informativa + seed procesos Tucumán
-- ============================================================

-- 1) Nuevos campos en expedientes
ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS juez                    text,
  ADD COLUMN IF NOT EXISTS secretaria_juzgado      text,
  ADD COLUMN IF NOT EXISTS termino_probatorio_vence date;

COMMENT ON COLUMN public.expedientes.juez IS 'Juez/a que interviene en la causa.';
COMMENT ON COLUMN public.expedientes.secretaria_juzgado IS 'Secretaría del juzgado a cargo.';
COMMENT ON COLUMN public.expedientes.termino_probatorio_vence IS 'Fecha de vencimiento del término probatorio. Visible solo cuando la etapa es de prueba.';

-- ============================================================
-- 2) Sentencias y resoluciones
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sentencias (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id       uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  tipo                text NOT NULL CHECK (tipo IN (
    'FAVORABLE','DESFAVORABLE','PARCIAL','HOMOLOGACION','RECHAZO'
  )),
  instancia           text NOT NULL DEFAULT 'PRIMERA' CHECK (instancia IN (
    'PRIMERA','SEGUNDA','CASACION','CORTE','ADMINISTRATIVA'
  )),
  fecha               date NOT NULL,
  resumen             text,
  apelada             boolean NOT NULL DEFAULT false,
  apelante            text CHECK (apelante IN ('ACTORA','DEMANDADA','AMBAS',NULL)),
  resultado_apelacion text,
  created_by          uuid NOT NULL REFERENCES public.profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sentencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY sentencias_select  ON public.sentencias FOR SELECT TO authenticated USING (true);
CREATE POLICY sentencias_insert  ON public.sentencias FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY sentencias_update  ON public.sentencias FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sentencias_delete  ON public.sentencias FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_sentencias_expediente ON public.sentencias(expediente_id);

CREATE TRIGGER set_updated_at_sentencias
  BEFORE UPDATE ON public.sentencias
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ============================================================
-- 3) Prueba informativa (oficios / informes solicitados)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.prueba_informativa (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id    uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  institucion      text NOT NULL,
  descripcion      text NOT NULL,
  fecha_enviado    date,
  fecha_plazo      date,
  fecha_contestado date,
  estado           text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN (
    'PENDIENTE','ENVIADO','RECIBIDO','VENCIDO','DESISTIDO'
  )),
  observaciones    text,
  created_by       uuid NOT NULL REFERENCES public.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prueba_informativa ENABLE ROW LEVEL SECURITY;

CREATE POLICY prueba_informativa_select ON public.prueba_informativa FOR SELECT TO authenticated USING (true);
CREATE POLICY prueba_informativa_insert ON public.prueba_informativa FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY prueba_informativa_update ON public.prueba_informativa FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY prueba_informativa_delete ON public.prueba_informativa FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_prueba_informativa_expediente ON public.prueba_informativa(expediente_id);

CREATE TRIGGER set_updated_at_prueba_informativa
  BEFORE UPDATE ON public.prueba_informativa
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ============================================================
-- 4) Seed: Ordinario Laboral (Tucumán)
-- ============================================================
DO $$
DECLARE
  v_tipo_id uuid;
  e uuid[] := ARRAY[NULL::uuid, NULL, NULL, NULL, NULL, NULL, NULL, NULL]::uuid[];
BEGIN
  IF EXISTS (SELECT 1 FROM public.tipos_proceso_judicial WHERE codigo = 'ordinario_laboral_tucuman') THEN
    RAISE NOTICE 'Ya existe ordinario_laboral_tucuman, skip.'; RETURN;
  END IF;

  INSERT INTO public.tipos_proceso_judicial
    (codigo, nombre, fuero, jurisdiccion, descripcion, norma_base, orden)
  VALUES (
    'ordinario_laboral_tucuman',
    'Ordinario Laboral (Tucumán)',
    'laboral', 'tucuman',
    'Proceso laboral ordinario ante el fuero de trabajo de Tucumán. Rige la Ley 6.205 (CPL). Etapas: demanda, contestación, apertura a prueba (término probatorio), clausura, alegatos, sentencia, recursos.',
    'Ley 6.205 (CPL Tucumán)',
    1
  ) RETURNING id INTO v_tipo_id;

  INSERT INTO public.etapas_proceso
    (tipo_proceso_id, codigo, nombre, orden, descripcion, plazo_dias, plazo_es_perentorio, decisiones_posibles, escritos_tipicos, es_terminal)
  VALUES
    (v_tipo_id,'demanda','Demanda',1,'Presentación del escrito de demanda laboral.',NULL,false,
     '[{"codigo":"con_cautelar","nombre":"Con medida cautelar (embargo preventivo)","descripcion":"Solicitar embargo sobre haberes o bienes del empleador al inicio"}]'::jsonb,
     '[{"tipo":"demanda_laboral","descripcion":"Escrito inicial"}]'::jsonb,false)
  RETURNING id INTO e[1];

  INSERT INTO public.etapas_proceso
    (tipo_proceso_id, codigo, nombre, orden, descripcion, plazo_dias, plazo_es_perentorio, decisiones_posibles, escritos_tipicos, es_terminal)
  VALUES
    (v_tipo_id,'contestacion','Contestación de demanda',2,'El demandado contesta en plazo legal. Puede oponer excepciones.',NULL,false,
     '[{"codigo":"replica_excepcion","nombre":"Replicar excepciones opuestas","descripcion":"Contestar excepciones del demandado"},{"codigo":"ampliar_demanda","nombre":"Ampliar demanda","descripcion":"Ampliar hechos o montos si surgen nuevos elementos del informe patronal"}]'::jsonb,
     '[{"tipo":"replica_excepciones","descripcion":"Contestación de excepciones"},{"tipo":"ampliacion_demanda","descripcion":"Ampliación de demanda"}]'::jsonb,false)
  RETURNING id INTO e[2];

  INSERT INTO public.etapas_proceso
    (tipo_proceso_id, codigo, nombre, orden, descripcion, plazo_dias, plazo_es_perentorio, decisiones_posibles, escritos_tipicos, es_terminal)
  VALUES
    (v_tipo_id,'apertura_prueba','Apertura a prueba',3,'Decreto que abre el período de prueba. Se fija el término probatorio (habitualmente 40 días hábiles en laboral Tucumán).',40,false,
     '[{"codigo":"ofrecer_prueba","nombre":"Ofrecer prueba","descripcion":"Presentar lista de testigos, peritos, documentos, informativa"},{"codigo":"ampliar_prueba","nombre":"Ampliar prueba ofrecida","descripcion":"En plazo, agregar medios probatorios no incluidos inicialmente"}]'::jsonb,
     '[{"tipo":"ofrecimiento_prueba","descripcion":"Escrito de ofrecimiento de prueba"},{"tipo":"oficio_informativa","descripcion":"Oficios a organismos para prueba informativa"}]'::jsonb,false)
  RETURNING id INTO e[3];

  INSERT INTO public.etapas_proceso
    (tipo_proceso_id, codigo, nombre, orden, descripcion, plazo_dias, plazo_es_perentorio, decisiones_posibles, escritos_tipicos, es_terminal)
  VALUES
    (v_tipo_id,'produccion_prueba','Producción de prueba',4,'Período activo de producción de prueba: audiencias de testigos, peritos, oficios informativa.',NULL,false,
     '[{"codigo":"urgir_produccion","nombre":"Urgir producción de prueba","descripcion":"Intimar producción antes del vencimiento del término"},{"codigo":"pedir_prorroga","nombre":"Pedir prórroga del término","descripcion":"Si queda prueba pendiente por causas no imputables"}]'::jsonb,
     '[{"tipo":"urgimiento_prueba","descripcion":"Urgimiento de producción de prueba"},{"tipo":"prorroga_termino","descripcion":"Pedido de prórroga del término probatorio"}]'::jsonb,false)
  RETURNING id INTO e[4];

  INSERT INTO public.etapas_proceso
    (tipo_proceso_id, codigo, nombre, orden, descripcion, plazo_dias, plazo_es_perentorio, decisiones_posibles, escritos_tipicos, es_terminal)
  VALUES
    (v_tipo_id,'clausura_prueba','Clausura de prueba',5,'Decreto de clausura del término probatorio. Queda en estado de alegatos.',NULL,false,
     '[{"codigo":"pedir_apertura_cuaderno","nombre":"Pedir apertura cuaderno de prueba","descripcion":"Solicitar vista de los cuadernos para redactar alegatos"}]'::jsonb,
     '[]'::jsonb,false)
  RETURNING id INTO e[5];

  INSERT INTO public.etapas_proceso
    (tipo_proceso_id, codigo, nombre, orden, descripcion, plazo_dias, plazo_es_perentorio, decisiones_posibles, escritos_tipicos, es_terminal)
  VALUES
    (v_tipo_id,'alegatos','Alegatos',6,'Presentación de los alegatos sobre el mérito de la prueba producida.',NULL,false,
     '[{"codigo":"presentar_alegato","nombre":"Presentar alegato","descripcion":"Analizar la prueba producida y concluir sobre los hechos y el derecho"}]'::jsonb,
     '[{"tipo":"alegato","descripcion":"Escrito de alegatos"}]'::jsonb,false)
  RETURNING id INTO e[6];

  INSERT INTO public.etapas_proceso
    (tipo_proceso_id, codigo, nombre, orden, descripcion, plazo_dias, plazo_es_perentorio, decisiones_posibles, escritos_tipicos, es_terminal)
  VALUES
    (v_tipo_id,'sentencia_primera','Sentencia de primera instancia',7,'El juez dicta sentencia. Plazo legal para apelar: 5 días hábiles (verificar CPL Tucumán).',5,true,
     '[{"codigo":"apelar","nombre":"Apelar la sentencia","descripcion":"Recurso de apelación ante la Cámara del Trabajo"},{"codigo":"ejecutar","nombre":"Ejecutar sentencia favorable","descripcion":"Iniciar ejecución si la sentencia es favorable y firme"},{"codigo":"aceptar","nombre":"Aceptar — dejar firme","descripcion":"No apelar, sentencia firme"}]'::jsonb,
     '[{"tipo":"recurso_apelacion_laboral","descripcion":"Recurso de apelación"},{"tipo":"expresion_agravios","descripcion":"Expresión de agravios ante la Cámara"}]'::jsonb,false)
  RETURNING id INTO e[7];

  INSERT INTO public.etapas_proceso
    (tipo_proceso_id, codigo, nombre, orden, descripcion, plazo_dias, plazo_es_perentorio, decisiones_posibles, escritos_tipicos, es_terminal)
  VALUES
    (v_tipo_id,'camara','Sentencia de Cámara',8,'Resolución del tribunal de alzada.',NULL,false,
     '[{"codigo":"recurso_casacion","nombre":"Recurso de casación (CSJT)","descripcion":"Si hay cuestión de derecho importante"},{"codigo":"ejecutar","nombre":"Ejecutar","descripcion":"Si la sentencia es favorable y firme"}]'::jsonb,
     '[{"tipo":"recurso_casacion","descripcion":"Recurso de casación ante la CSJT"}]'::jsonb,true)
  RETURNING id INTO e[8];

  -- Transiciones
  INSERT INTO public.transiciones_proceso (etapa_origen_id, etapa_destino_id, condicion, descripcion) VALUES
    (e[1],e[2],'siempre','Luego de la demanda, el demandado contesta'),
    (e[2],e[3],'siempre','Vencido el plazo de contestación, se abre a prueba'),
    (e[3],e[4],'siempre','Apertura: comienza la producción'),
    (e[4],e[5],'siempre','Vencido el término, se clausura'),
    (e[5],e[6],'siempre','Clausurada la prueba, se presentan alegatos'),
    (e[6],e[7],'siempre','Alegatos presentados, el juez dicta sentencia'),
    (e[7],e[8],'si_apela','Si alguna parte apela');

  RAISE NOTICE 'Ordinario Laboral Tucumán creado. id=%', v_tipo_id;
END $$;

-- ============================================================
-- 5) Seed: Autosatisfactiva (Tucumán)
-- ============================================================
DO $$
DECLARE
  v_tipo_id uuid;
  e1 uuid; e2 uuid; e3 uuid; e4 uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.tipos_proceso_judicial WHERE codigo = 'autosatisfactiva_tucuman') THEN
    RAISE NOTICE 'Ya existe autosatisfactiva_tucuman, skip.'; RETURN;
  END IF;

  INSERT INTO public.tipos_proceso_judicial
    (codigo, nombre, fuero, jurisdiccion, descripcion, norma_base, orden)
  VALUES (
    'autosatisfactiva_tucuman',
    'Autosatisfactiva (Tucumán)',
    'civil','tucuman',
    'Medida autosatisfactiva: tutela urgente y definitiva en una sola etapa. No hay juicio de conocimiento posterior obligatorio.',
    'CPCC Tucumán — Medidas Urgentes',
    20
  ) RETURNING id INTO v_tipo_id;

  INSERT INTO public.etapas_proceso (tipo_proceso_id,codigo,nombre,orden,descripcion,decisiones_posibles,escritos_tipicos,es_terminal) VALUES
    (v_tipo_id,'presentacion','Presentación',1,'Escrito con urgencia, verosimilitud del derecho y periculum in mora.',
     '[{"codigo":"con_medida_innovativa","nombre":"Pedir medida innovativa","descripcion":"Que el juez ordene hacer algo"},{"codigo":"con_medida_prohibicion","nombre":"Pedir prohibición","descripcion":"Que el juez ordene no hacer algo"}]'::jsonb,
     '[{"tipo":"autosatisfactiva","descripcion":"Escrito de medida autosatisfactiva"}]'::jsonb,false)
  RETURNING id INTO e1;

  INSERT INTO public.etapas_proceso (tipo_proceso_id,codigo,nombre,orden,descripcion,plazo_dias,plazo_es_perentorio,decisiones_posibles,escritos_tipicos,es_terminal) VALUES
    (v_tipo_id,'audiencia_juez','Audiencia o resolución in audita parte',2,'El juez puede convocar a una audiencia brevísima o resolver directamente.',NULL,false,
     '[{"codigo":"ampliar_fundamentos","nombre":"Ampliar fundamentos en audiencia","descripcion":"Reforzar la urgencia ante el juez"}]'::jsonb,
     '[]'::jsonb,false)
  RETURNING id INTO e2;

  INSERT INTO public.etapas_proceso (tipo_proceso_id,codigo,nombre,orden,descripcion,plazo_dias,plazo_es_perentorio,decisiones_posibles,escritos_tipicos,es_terminal) VALUES
    (v_tipo_id,'resolucion','Resolución del juez',3,'Acogimiento o rechazo de la medida.',5,true,
     '[{"codigo":"apelar_rechazo","nombre":"Apelar el rechazo","descripcion":"Si el juez rechaza, apelar ante la Cámara"},{"codigo":"ejecutar","nombre":"Ejecutar la medida","descripcion":"Si fue acogida, hacerla cumplir"}]'::jsonb,
     '[{"tipo":"recurso_apelacion_autosatisfactiva","descripcion":"Apelación contra rechazo"}]'::jsonb,false)
  RETURNING id INTO e3;

  INSERT INTO public.etapas_proceso (tipo_proceso_id,codigo,nombre,orden,descripcion,decisiones_posibles,escritos_tipicos,es_terminal) VALUES
    (v_tipo_id,'apelacion_camara','Cámara / Apelación',4,'Resolución de la Cámara.',
     '[{"codigo":"firme","nombre":"Dejar firme","descripcion":"Fin del proceso"}]'::jsonb,
     '[]'::jsonb,true)
  RETURNING id INTO e4;

  INSERT INTO public.transiciones_proceso (etapa_origen_id,etapa_destino_id,condicion,descripcion) VALUES
    (e1,e2,'siempre','El juez evalúa y puede convocar audiencia'),
    (e2,e3,'siempre','Resolución del juez'),
    (e3,e4,'si_apela','Si alguna parte apela');

  RAISE NOTICE 'Autosatisfactiva Tucumán creada. id=%', v_tipo_id;
END $$;

-- ============================================================
-- 6) Seed: Sumarísimo Laboral
-- ============================================================
DO $$
DECLARE
  v_tipo_id uuid;
  e1 uuid; e2 uuid; e3 uuid; e4 uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.tipos_proceso_judicial WHERE codigo = 'sumarisimo_laboral_tucuman') THEN
    RAISE NOTICE 'Ya existe sumarisimo_laboral_tucuman, skip.'; RETURN;
  END IF;

  INSERT INTO public.tipos_proceso_judicial (codigo,nombre,fuero,jurisdiccion,descripcion,norma_base,orden)
  VALUES ('sumarisimo_laboral_tucuman','Sumarísimo Laboral (Tucumán)','laboral','tucuman',
    'Proceso sumarísimo laboral. Plazos reducidos, prueba acotada. Típico en reinstalación de despido discriminatorio.',
    'Ley 6.205 (CPL Tucumán) — Proceso Sumarísimo',30)
  RETURNING id INTO v_tipo_id;

  INSERT INTO public.etapas_proceso (tipo_proceso_id,codigo,nombre,orden,descripcion,decisiones_posibles,escritos_tipicos,es_terminal) VALUES
    (v_tipo_id,'demanda','Demanda',1,'Presentación de demanda con urgencia.',
     '[{"codigo":"cautelar","nombre":"Medida cautelar anticipada","descripcion":"Reinstalación o embargo preventivo simultáneo"}]'::jsonb,
     '[{"tipo":"demanda_sumarisimo","descripcion":"Demanda sumarísima"}]'::jsonb,false)
  RETURNING id INTO e1;

  INSERT INTO public.etapas_proceso (tipo_proceso_id,codigo,nombre,orden,descripcion,plazo_dias,plazo_es_perentorio,decisiones_posibles,escritos_tipicos,es_terminal) VALUES
    (v_tipo_id,'contestacion_breve','Contestación (plazo reducido)',2,'Plazo breve de contestación.',NULL,false,
     '[{"codigo":"excepcion_prescripcion","nombre":"Oponer prescripción","descripcion":"Si la acción está prescripta"}]'::jsonb,
     '[{"tipo":"contesta_sumarisimo","descripcion":"Contestación sumarísima"}]'::jsonb,false)
  RETURNING id INTO e2;

  INSERT INTO public.etapas_proceso (tipo_proceso_id,codigo,nombre,orden,descripcion,plazo_dias,plazo_es_perentorio,decisiones_posibles,escritos_tipicos,es_terminal) VALUES
    (v_tipo_id,'audiencia_y_prueba','Audiencia y producción de prueba',3,'Audiencia de trámite con producción concentrada de prueba.',NULL,false,
     '[{"codigo":"alegar_en_audiencia","nombre":"Alegar en la audiencia","descripcion":"Clausurada la prueba, alegar en el mismo acto"}]'::jsonb,
     '[]'::jsonb,false)
  RETURNING id INTO e3;

  INSERT INTO public.etapas_proceso (tipo_proceso_id,codigo,nombre,orden,descripcion,plazo_dias,plazo_es_perentorio,decisiones_posibles,escritos_tipicos,es_terminal) VALUES
    (v_tipo_id,'sentencia','Sentencia',4,'El juez dicta sentencia en plazo breve.',5,true,
     '[{"codigo":"apelar","nombre":"Apelar","descripcion":"Recurso ante la Cámara Laboral"},{"codigo":"ejecutar","nombre":"Ejecutar sentencia favorable","descripcion":"Ejecución inmediata"}]'::jsonb,
     '[{"tipo":"recurso_apelacion","descripcion":"Apelación"}]'::jsonb,true)
  RETURNING id INTO e4;

  INSERT INTO public.transiciones_proceso (etapa_origen_id,etapa_destino_id,condicion,descripcion) VALUES
    (e1,e2,'siempre','Demanda notificada, demandado contesta'),
    (e2,e3,'siempre','Se convoca audiencia de trámite'),
    (e3,e4,'siempre','Audiencia celebrada, el juez dicta sentencia');

  RAISE NOTICE 'Sumarísimo Laboral creado. id=%', v_tipo_id;
END $$;

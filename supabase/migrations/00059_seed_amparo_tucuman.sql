-- ============================================================
-- Migración 055: Seed plantilla "Amparo Provincial Tucumán"
--
-- Primera plantilla del rulebook. Sirve como piloto del modelo
-- para validar end-to-end. Marco la corrige antes de seguir con
-- las demás (daños, ejecutivo, laboral, familia, etc).
--
-- Norma base   : Ley provincial 6944 + Const. provincial art. 37
-- Norma suplet.: CPCC Tucumán
--
-- Plazos: salvo verificación contra texto vigente de Ley 6944.
-- Marco corrige si difieren.
-- ============================================================

DO $$
DECLARE
  v_tipo_id      uuid;
  v_e1_id        uuid;  -- presentacion
  v_e2_id        uuid;  -- admisibilidad
  v_e3_id        uuid;  -- informe_demandado
  v_e4_id        uuid;  -- prueba
  v_e5_id        uuid;  -- sentencia_primera
  v_e6_id        uuid;  -- apelacion
  v_e7_id        uuid;  -- sentencia_camara
  v_e_rechazo_id uuid;  -- rechazo_in_limine (rama)
BEGIN
  -- 1) Tipo de proceso
  INSERT INTO public.tipos_proceso_judicial
    (codigo, nombre, fuero, jurisdiccion, descripcion, norma_base, orden)
  VALUES (
    'amparo_provincial_tucuman',
    'Amparo Provincial (Tucumán)',
    'civil',
    'tucuman',
    'Acción de amparo provincial regulada por Ley 6944 y Const. provincial art. 37. Procedimiento sumarísimo para tutela de derechos constitucionales contra actos u omisiones de autoridad pública o particulares.',
    'Ley provincial 6944 + Const. Tucumán art. 37',
    10
  )
  RETURNING id INTO v_tipo_id;

  -- 2) Relación con normativa (base + supletoria)
  INSERT INTO public.tipos_proceso_normas
    (tipo_proceso_id, rol, norma_codigo, norma_descripcion, orden)
  VALUES
    (v_tipo_id, 'base',       'Ley provincial 6944',          'Ley de Acción de Amparo de Tucumán',                0),
    (v_tipo_id, 'base',       'Const. Tucumán art. 37',       'Garantía constitucional provincial del amparo',     1),
    (v_tipo_id, 'base',       'CN art. 43',                   'Garantía constitucional federal del amparo',        2),
    (v_tipo_id, 'supletoria', 'CPCC Tucumán',                 'Régimen procesal aplicable en lo no previsto',      0);

  -- 3) Etapas
  INSERT INTO public.etapas_proceso
    (tipo_proceso_id, codigo, nombre, orden, descripcion, plazo_dias, plazo_es_perentorio,
     decisiones_posibles, escritos_tipicos, es_terminal)
  VALUES
    (v_tipo_id, 'presentacion_demanda', 'Presentación de la demanda de amparo', 1,
     'Promoción del amparo. Caducidad de 15 días desde el hecho lesivo (verificar plazo vigente en Ley 6944).',
     NULL, false,
     '[
       {"codigo":"con_cautelar","nombre":"Pedir medida cautelar dentro del amparo","descripcion":"Suspensión del acto lesivo mientras dura el proceso"},
       {"codigo":"sin_cautelar","nombre":"Sin medida cautelar","descripcion":"Solo acción de fondo"},
       {"codigo":"cautelar_autonoma_previa","nombre":"Cautelar autónoma previa","descripcion":"Planteo de medida cautelar antes de la demanda de fondo"}
     ]'::jsonb,
     '[{"tipo":"demanda_amparo","descripcion":"Escrito de demanda con requisitos del art. 6 ley 16.986 / Ley 6944"}]'::jsonb,
     false)
  RETURNING id INTO v_e1_id;

  INSERT INTO public.etapas_proceso
    (tipo_proceso_id, codigo, nombre, orden, descripcion, plazo_dias, plazo_es_perentorio,
     decisiones_posibles, escritos_tipicos, es_terminal)
  VALUES
    (v_tipo_id, 'admisibilidad', 'Análisis de admisibilidad', 2,
     'El juez analiza si el amparo es formalmente procedente. Puede rechazarlo in limine por existir vía idónea o por extemporaneidad.',
     NULL, false,
     '[
       {"codigo":"esperar","nombre":"Esperar resolución de admisibilidad","descripcion":"Sin acción del actor en esta etapa"}
     ]'::jsonb,
     '[]'::jsonb,
     false)
  RETURNING id INTO v_e2_id;

  INSERT INTO public.etapas_proceso
    (tipo_proceso_id, codigo, nombre, orden, descripcion, plazo_dias, plazo_es_perentorio,
     decisiones_posibles, escritos_tipicos, es_terminal)
  VALUES
    (v_tipo_id, 'rechazo_in_limine', 'Rechazo in limine (rama)', 3,
     'Si el juez rechaza el amparo in limine, se puede apelar el rechazo en plazo breve.',
     5, true,
     '[
       {"codigo":"apelar_rechazo","nombre":"Apelar el rechazo in limine","descripcion":"Recurrir el rechazo formal ante la Cámara"},
       {"codigo":"abandonar","nombre":"Abandonar y replantear por vía ordinaria","descripcion":"Iniciar acción ordinaria por la vía que el juez consideró idónea"}
     ]'::jsonb,
     '[{"tipo":"recurso_apelacion_rechazo_in_limine","descripcion":"Apelación contra rechazo in limine"}]'::jsonb,
     false)
  RETURNING id INTO v_e_rechazo_id;

  INSERT INTO public.etapas_proceso
    (tipo_proceso_id, codigo, nombre, orden, descripcion, plazo_dias, plazo_es_perentorio,
     decisiones_posibles, escritos_tipicos, es_terminal)
  VALUES
    (v_tipo_id, 'informe_demandado', 'Informe del demandado', 4,
     'El demandado debe rendir informe sobre los hechos y el derecho. Plazo breve y perentorio (verificar contra Ley 6944).',
     5, true,
     '[
       {"codigo":"esperar","nombre":"Esperar el informe","descripcion":"Sin acción del actor durante el plazo del demandado"}
     ]'::jsonb,
     '[]'::jsonb,
     false)
  RETURNING id INTO v_e3_id;

  INSERT INTO public.etapas_proceso
    (tipo_proceso_id, codigo, nombre, orden, descripcion, plazo_dias, plazo_es_perentorio,
     decisiones_posibles, escritos_tipicos, es_terminal)
  VALUES
    (v_tipo_id, 'prueba', 'Producción de prueba (eventual)', 5,
     'Solo se admite prueba si es indispensable y no entorpece la sumariedad. Régimen muy restrictivo.',
     3, true,
     '[
       {"codigo":"ofrecer_prueba_ampliada","nombre":"Ofrecer prueba complementaria","descripcion":"Solo prueba esencial y rápida"},
       {"codigo":"replicar_informe","nombre":"Replicar el informe del demandado","descripcion":"Observaciones al informe presentado"},
       {"codigo":"desistir_prueba","nombre":"Desistir de prueba ofrecida","descripcion":"Acelerar el dictado de sentencia"}
     ]'::jsonb,
     '[
       {"tipo":"replica_informe","descripcion":"Réplica al informe del demandado"},
       {"tipo":"ofrecimiento_prueba","descripcion":"Ofrecimiento ampliado de prueba"}
     ]'::jsonb,
     false)
  RETURNING id INTO v_e4_id;

  INSERT INTO public.etapas_proceso
    (tipo_proceso_id, codigo, nombre, orden, descripcion, plazo_dias, plazo_es_perentorio,
     decisiones_posibles, escritos_tipicos, es_terminal)
  VALUES
    (v_tipo_id, 'sentencia_primera_instancia', 'Sentencia de primera instancia', 6,
     'El juez dicta sentencia en plazo breve. Hace o no lugar al amparo.',
     3, true,
     '[
       {"codigo":"esperar","nombre":"Esperar sentencia","descripcion":"Sin acción del actor"}
     ]'::jsonb,
     '[]'::jsonb,
     false)
  RETURNING id INTO v_e5_id;

  INSERT INTO public.etapas_proceso
    (tipo_proceso_id, codigo, nombre, orden, descripcion, plazo_dias, plazo_es_perentorio,
     decisiones_posibles, escritos_tipicos, es_terminal)
  VALUES
    (v_tipo_id, 'apelacion', 'Apelación', 7,
     'Plazo perentorio breve para apelar la sentencia (verificar contra Ley 6944: típicamente 48 hs en el régimen federal).',
     2, true,
     '[
       {"codigo":"apelar","nombre":"Apelar la sentencia","descripcion":"Recurrir el fallo de primera instancia"},
       {"codigo":"no_apelar","nombre":"No apelar — sentencia firme","descripcion":"Aceptar el fallo"},
       {"codigo":"adherir","nombre":"Adherir a la apelación del contrario","descripcion":"Si apela el demandado, sumarse al recurso"}
     ]'::jsonb,
     '[
       {"tipo":"recurso_apelacion","descripcion":"Recurso de apelación"},
       {"tipo":"expresion_agravios","descripcion":"Expresión de agravios ante la Cámara"}
     ]'::jsonb,
     false)
  RETURNING id INTO v_e6_id;

  INSERT INTO public.etapas_proceso
    (tipo_proceso_id, codigo, nombre, orden, descripcion, plazo_dias, plazo_es_perentorio,
     decisiones_posibles, escritos_tipicos, es_terminal)
  VALUES
    (v_tipo_id, 'sentencia_camara', 'Sentencia de Cámara — firme', 8,
     'Resolución de la Cámara. Cierra el proceso ordinariamente. Procede REF/Recurso Extraordinario en casos de cuestión federal o arbitrariedad.',
     NULL, false,
     '[
       {"codigo":"interponer_ref","nombre":"Interponer REF ante CSJT / CSJN","descripcion":"Solo si hay cuestión federal o gravedad institucional"},
       {"codigo":"firmar","nombre":"Dejar firme","descripcion":"Fin del proceso"}
     ]'::jsonb,
     '[{"tipo":"recurso_extraordinario","descripcion":"Recurso extraordinario federal o provincial"}]'::jsonb,
     true)
  RETURNING id INTO v_e7_id;

  -- 4) Transiciones (grafo del proceso)
  INSERT INTO public.transiciones_proceso (etapa_origen_id, etapa_destino_id, condicion, descripcion, plazo_dias) VALUES
    (v_e1_id,        v_e2_id,        'siempre',            'Tras la presentación, el juez analiza admisibilidad',           NULL),
    (v_e2_id,        v_e_rechazo_id, 'si_rechaza',         'Si el juez rechaza in limine',                                  NULL),
    (v_e2_id,        v_e3_id,        'si_admite',          'Si admite, pide informe al demandado',                          NULL),
    (v_e_rechazo_id, v_e6_id,        'si_apela_rechazo',   'Si se apela el rechazo, va a Cámara',                           NULL),
    (v_e3_id,        v_e4_id,        'si_hay_prueba',      'Si se ofrece y admite prueba',                                  NULL),
    (v_e3_id,        v_e5_id,        'si_no_hay_prueba',   'Sin prueba, queda en estado de sentencia',                      NULL),
    (v_e4_id,        v_e5_id,        'siempre',            'Tras la prueba, queda en estado de sentencia',                  NULL),
    (v_e5_id,        v_e6_id,        'si_apela',           'Si alguna parte apela',                                         NULL),
    (v_e5_id,        v_e7_id,        'si_no_apela',        'Si nadie apela, queda firme',                                   NULL),
    (v_e6_id,        v_e7_id,        'siempre',            'La Cámara resuelve y cierra ordinariamente',                    NULL);

  -- 5) Aprendizaje universal asociado (sembrado por el sistema, scope=universal)
  INSERT INTO public.aprendizajes_rulebook
    (scope, target_kind, tipo_proceso_id, contenido, contenido_estructurado, confidence, observed_in_cases, owner_id, created_by)
  VALUES (
    'universal',
    'tipo_proceso',
    v_tipo_id,
    'En amparo, el plazo de 15 días para promover la acción desde el hecho lesivo es de CADUCIDAD, no prescripción. No se suspende ni interrumpe. Vencido, la vía idónea pasa a ser la ordinaria.',
    '{"tipo":"regla_dura","ambito":"plazo_caducidad","articulo_referencia":"Ley 16.986 art. 2 / Ley 6944"}'::jsonb,
    'alta',
    1,
    NULL,
    NULL
  );

  RAISE NOTICE 'Plantilla "Amparo Provincial Tucumán" creada. tipo_id=%', v_tipo_id;
END $$;

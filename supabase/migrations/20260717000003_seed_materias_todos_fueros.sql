-- Seed de materias (tipos_proceso_judicial) para todos los fueros.
-- Los fueros civil y mediacion ya tienen entradas; se agregan los restantes
-- y un "Otro" por fuero para texto libre en observaciones.

INSERT INTO public.tipos_proceso_judicial
  (codigo, nombre, fuero, jurisdiccion, descripcion, norma_base, orden)
VALUES

  -- ── CIVIL: agregar Otro ──────────────────────────────────────────
  ('civil_otro_tucuman',              'Otro (Civil)',                 'civil',               'tucuman', 'Materia civil no categorizada. Especificar en observaciones.',                              NULL,                         999),

  -- ── LABORAL ─────────────────────────────────────────────────────
  ('laboral_cobro_pesos_tucuman',     'Cobro de Pesos',              'laboral',             'tucuman', 'Reclamo de créditos laborales: salarios, horas extra, SAC, vacaciones no gozadas.',        'LCT arts. 103 y ss.',        10),
  ('laboral_accidente_trabajo',       'Accidente de Trabajo',        'laboral',             'tucuman', 'Acción por accidente in itinere o en el lugar de trabajo. Sistema LRT y/o derecho civil.', 'Ley 24.557 / CCyC art. 1710', 20),
  ('laboral_enfermedad_profesional',  'Enfermedad Profesional',      'laboral',             'tucuman', 'Enfermedad causada o agravada por el trabajo. Listado LRT o acción civil.',                 'Ley 24.557',                 30),
  ('laboral_despido_injustificado',   'Despido Injustificado',       'laboral',             'tucuman', 'Extinción del contrato sin causa o con causa insuficiente. Indemnizaciones LCT.',           'LCT arts. 245 y ss.',        40),
  ('laboral_diferencias_salariales',  'Diferencias Salariales',      'laboral',             'tucuman', 'Reclamo por diferencias entre lo cobrado y lo que correspondía según convenio o ley.',      'LCT / CCT aplicable',        50),
  ('laboral_reinstalacion',           'Reinstalación',               'laboral',             'tucuman', 'Acción de reinstalación por despido discriminatorio o con tutela sindical.',                'Ley 23.592 / LCT art. 52',   60),
  ('laboral_otro_tucuman',            'Otro (Laboral)',               'laboral',             'tucuman', 'Materia laboral no categorizada. Especificar en observaciones.',                           NULL,                         999),

  -- ── FAMILIA ─────────────────────────────────────────────────────
  ('familia_divorcio_tucuman',        'Divorcio',                    'familia',             'tucuman', 'Disolución del vínculo matrimonial. Puede incluir convenio regulador.',                     'CCyC arts. 437 y ss.',       10),
  ('familia_alimentos_tucuman',       'Alimentos',                   'familia',             'tucuman', 'Fijación, modificación o cese de cuota alimentaria entre cónyuges o ex cónyuges.',         'CCyC arts. 432 y ss.',       20),
  ('familia_cuota_alimentaria',       'Cuota Alimentaria (Hijos)',   'familia',             'tucuman', 'Fijación o modificación de alimentos para hijos menores o mayores con discapacidad.',       'CCyC arts. 658 y ss.',       30),
  ('familia_regimen_comunicacion',    'Régimen de Comunicación',     'familia',             'tucuman', 'Organización del contacto entre el progenitor no conviviente y el hijo.',                   'CCyC art. 652',              40),
  ('familia_guarda',                  'Cuidado Personal / Guarda',   'familia',             'tucuman', 'Cuidado personal unilateral o compartido del hijo. Antes: tenencia.',                      'CCyC arts. 648 y ss.',       50),
  ('familia_adopcion_tucuman',        'Adopción',                    'familia',             'tucuman', 'Proceso de adopción plena, simple o de integración.',                                      'CCyC arts. 594 y ss.',       60),
  ('familia_violencia_familiar',      'Violencia Familiar / Género', 'familia',             'tucuman', 'Medidas de protección, exclusión del hogar y cese de violencia.',                          'Ley 26.485 / Ley Prov. 7.586', 70),
  ('familia_otro_tucuman',            'Otro (Familia)',               'familia',             'tucuman', 'Materia de familia no categorizada. Especificar en observaciones.',                        NULL,                         999),

  -- ── PREVISIONAL ─────────────────────────────────────────────────
  ('prev_jubilacion_tucuman',         'Jubilación',                  'previsional',         'tucuman', 'Acceso al beneficio jubilatorio ordinario.',                                               'Ley 24.241',                 10),
  ('prev_reajuste_tucuman',           'Reajuste de Haberes',         'previsional',         'tucuman', 'Actualización del haber jubilatorio (Badaro, índice Ripte, etc.).',                       'Fallo Badaro / Ley 27.426',  20),
  ('prev_pension_tucuman',            'Pensión por Fallecimiento',   'previsional',         'tucuman', 'Otorgamiento o mejora de pensión derivada.',                                              'Ley 24.241 art. 53',         30),
  ('prev_reconocimiento_servicios',   'Reconocimiento de Servicios', 'previsional',         'tucuman', 'Cómputo de períodos de trabajo no registrados o mal computados.',                         'Ley 24.241',                 40),
  ('prev_otro_tucuman',               'Otro (Previsional)',           'previsional',         'tucuman', 'Materia previsional no categorizada. Especificar en observaciones.',                      NULL,                         999),

  -- ── DOCUMENTOS Y LOCACIONES ─────────────────────────────────────
  ('docsloc_pagare_tucuman',          'Ejecución de Pagaré',         'documentos_locaciones','tucuman','Proceso ejecutivo por pagaré impago.',                                                    'CPCC Tucumán / CCyC',        10),
  ('docsloc_cheque_tucuman',          'Ejecución de Cheque',         'documentos_locaciones','tucuman','Proceso ejecutivo por cheque rechazado.',                                                  'Ley 24.452 / CPCC',          20),
  ('docsloc_desalojo_falta_pago',     'Desalojo por Falta de Pago',  'documentos_locaciones','tucuman','Recuperación de inmueble por mora en el pago del alquiler.',                              'CCyC art. 1222 / CPCC',      30),
  ('docsloc_desalojo_vencimiento',    'Desalojo por Vencimiento',    'documentos_locaciones','tucuman','Recuperación de inmueble por vencimiento del contrato de locación.',                      'CCyC art. 1218 / CPCC',      40),
  ('docsloc_cobro_alquileres',        'Cobro de Alquileres',         'documentos_locaciones','tucuman','Reclamo de cánones locativos adeudados.',                                                 'CCyC / CPCC',                50),
  ('docsloc_otro_tucuman',            'Otro (Documentos y Locaciones)','documentos_locaciones','tucuman','Materia no categorizada. Especificar en observaciones.',                                NULL,                         999),

  -- ── PENAL ────────────────────────────────────────────────────────
  ('penal_robo_hurto_tucuman',        'Robo y Hurto',                'penal',               'tucuman', 'Defensa o querella por delitos contra la propiedad: hurto simple o robo.',                'CP arts. 162 y 164 y ss.',   10),
  ('penal_amenazas_lesiones',         'Amenazas y Lesiones',         'penal',               'tucuman', 'Defensa o querella por amenazas coactivas o lesiones leves/graves.',                      'CP arts. 89 y ss., 149 bis', 20),
  ('penal_calumnias_injurias',        'Calumnias e Injurias',        'penal',               'tucuman', 'Querella por delitos contra el honor.',                                                   'CP arts. 109 y 110',         30),
  ('penal_homicidio_tucuman',         'Homicidio',                   'penal',               'tucuman', 'Defensa en causa por homicidio simple, culposo o agravado.',                              'CP arts. 79 y ss.',          40),
  ('penal_otro_tucuman',              'Otro (Penal)',                 'penal',               'tucuman', 'Materia penal no categorizada. Especificar en observaciones.',                            NULL,                         999),

  -- ── ADMINISTRATIVO ───────────────────────────────────────────────
  ('adm_amparo_mora_tucuman',         'Amparo por Mora',             'administrativo',      'tucuman', 'Acción de amparo por mora de la administración en resolver.',                             'Ley 19.549 art. 28',         10),
  ('adm_danos_perjuicios_tucuman',    'Daños y Perjuicios (Estado)', 'administrativo',      'tucuman', 'Responsabilidad del Estado por actividad legítima o ilegítima.',                          'Ley 26.944 / CCyC',          20),
  ('adm_otro_tucuman',                'Otro (Administrativo)',        'administrativo',      'tucuman', 'Materia administrativa no categorizada. Especificar en observaciones.',                   NULL,                         999),

  -- ── MEDIACION: agregar Otro ──────────────────────────────────────
  ('mediacion_otro_tucuman',          'Otro (Mediación)',             'mediacion',           'tucuman', 'Materia de mediación no categorizada. Especificar en observaciones.',                     NULL,                         999)

ON CONFLICT (codigo) DO NOTHING;

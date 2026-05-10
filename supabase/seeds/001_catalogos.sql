-- ============================================================
-- Marco Rossi Estudio Jurídico - Seeds: Catálogos iniciales
-- ============================================================

-- Tipos de trámite (catálogo genérico — se amplía desde Configuración)
INSERT INTO public.tipos_tramite (codigo, nombre, descripcion, requiere_turno, orden) VALUES
  ('civil_general',          'Civil General',              'Causas civiles de contenido patrimonial y no patrimonial', true, 1),
  ('laboral',                'Laboral',                    'Demandas y conflictos laborales', true, 2),
  ('familia',                'Familia',                    'Divorcio, alimentos, filiación, adopción', true, 3),
  ('penal',                  'Penal',                      'Causas penales y contravencionales', true, 4),
  ('administrativo',         'Administrativo',             'Recursos y reclamos ante organismos del Estado', true, 5),
  ('previsional',            'Previsional / ANSES',        'Jubilaciones, pensiones y beneficios de la seguridad social', true, 6),
  ('comercial',              'Comercial',                  'Contratos, sociedades, concursos y quiebras', true, 7),
  ('amparo',                 'Amparo / Medida Cautelar',   'Acciones de amparo y medidas urgentes', true, 8),
  ('otro',                   'Otro',                       'Otros tipos de trámite no clasificados', false, 99);

-- Tipos de audiencia (catálogo genérico — se amplía desde Configuración)
INSERT INTO public.catalogo_tipos_audiencia (codigo, nombre, descripcion, orden) VALUES
  ('preliminar',             'Audiencia Preliminar',       'Primera audiencia de conocimiento y conciliación', 1),
  ('vista_causa',            'Vista de Causa / Juicio',    'Audiencia de debate o juicio oral', 2),
  ('mediacion',              'Mediación',                  'Instancia de mediación prejudicial o judicial', 3),
  ('pericial',               'Pericial',                   'Audiencia para informe o explicación pericial', 4),
  ('conciliacion',           'Conciliación',               'Audiencia de conciliación entre partes', 5),
  ('informativa',            'Informativa',                'Audiencia para recepción de informes', 6),
  ('sentencia',              'Lectura de Sentencia',       'Lectura o notificación de sentencia', 7),
  ('apelacion',              'Audiencia de Apelación',     'Audiencia ante cámara o tribunal de alzada', 8),
  ('otro',                   'Otra',                       'Otro tipo de audiencia o acto procesal', 99);

-- Tipos de tarea (catálogo genérico)
INSERT INTO public.catalogo_tipos_tarea (nombre, descripcion) VALUES
  ('redactar_escrito',          'Redactar escrito procesal'),
  ('presentar_escrito',         'Presentar escrito en mesa de entradas'),
  ('sacar_turno',               'Obtener turno / audiencia'),
  ('notificar_cliente',         'Notificar al cliente sobre novedades'),
  ('solicitar_informe',         'Solicitar informe o documento a organismo'),
  ('revisar_expediente',        'Revisar estado del expediente en el sistema'),
  ('gestionar_poder',           'Gestionar poder notarial'),
  ('preparar_documentacion',    'Preparar documentación requerida'),
  ('coordinar_pericia',         'Coordinar o revisar pericia'),
  ('revisar_liquidacion',       'Revisar liquidación o cálculo de condena'),
  ('otro',                      'Otra tarea');

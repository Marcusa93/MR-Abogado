-- Corrige juzfam10 (localidad + teléfono), agrega Cámara de Familia y todo el fuero Penal.

-- ── Corrección juzfam10 ───────────────────────────────────────────────────────

UPDATE organismos
SET localidad = 'Banda del Río Salí',
    telefono  = '3815752734'
WHERE nombre = 'Juzgado Civil en Familia y Sucesiones X';

-- ── Cámara de Familia y Sucesiones ───────────────────────────────────────────

INSERT INTO organismos (nombre, tipo, jurisdiccion, localidad, provincia, telefono, email, activo) VALUES
  ('Cámara de Familia y Sucesiones - Sala I',  'camara', 'Familia y Sucesiones', 'San Miguel de Tucumán', 'Tucumán', '3815737872', 'camfam1@justucuman.gov.ar', true),
  ('Cámara de Familia y Sucesiones - Sala II', 'camara', 'Familia y Sucesiones', 'San Miguel de Tucumán', 'Tucumán', '3815752557', 'camfam2@justucuman.gov.ar', true)
ON CONFLICT (nombre) DO NOTHING;

-- ── Penal ─────────────────────────────────────────────────────────────────────
-- Los correos del fuero penal figuran en anexo aparte; se cargan sin email por ahora.

INSERT INTO organismos (nombre, tipo, jurisdiccion, localidad, provincia, telefono, email, activo) VALUES
  ('Cámara en lo Penal - Presidencia',                              'camara',  'Penal', 'San Miguel de Tucumán', 'Tucumán', '3815741883', NULL, true),
  ('Cámara en lo Penal - Sala I',                                   'camara',  'Penal', 'San Miguel de Tucumán', 'Tucumán', '3815529840', NULL, true),
  ('Cámara en lo Penal - Sala II',                                  'camara',  'Penal', 'San Miguel de Tucumán', 'Tucumán', '3815555518', NULL, true),
  ('Cámara en lo Penal - Sala III',                                 'camara',  'Penal', 'San Miguel de Tucumán', 'Tucumán', '3815760828', NULL, true),
  ('Cámara en lo Penal - Sala IV',                                  'camara',  'Penal', 'San Miguel de Tucumán', 'Tucumán', '3815520891', NULL, true),
  ('Cámara en lo Penal - Sala V',                                   'camara',  'Penal', 'San Miguel de Tucumán', 'Tucumán', '3815555258', NULL, true),
  ('Cámara en lo Penal - Sala VI',                                  'camara',  'Penal', 'San Miguel de Tucumán', 'Tucumán', '3815542559', NULL, true),
  ('Juzgado Correccional en lo Penal I',                            'juzgado', 'Penal', 'San Miguel de Tucumán', 'Tucumán', '3815753049', NULL, true),
  ('Juzgado Correccional en lo Penal II',                           'juzgado', 'Penal', 'San Miguel de Tucumán', 'Tucumán', '3815980975', NULL, true),
  ('Juzgado de Instrucción en lo Penal I',                          'juzgado', 'Penal', 'San Miguel de Tucumán', 'Tucumán', '3815744359', NULL, true),
  ('Juzgado de Instrucción en lo Penal II',                         'juzgado', 'Penal', 'San Miguel de Tucumán', 'Tucumán', '3815984469', NULL, true),
  ('Juzgado de Instrucción en lo Penal III',                        'juzgado', 'Penal', 'San Miguel de Tucumán', 'Tucumán', '3815576310', NULL, true),
  ('Juzgado de Instrucción en lo Penal IV',                         'juzgado', 'Penal', 'San Miguel de Tucumán', 'Tucumán', '3815554941', NULL, true),
  ('Juzgado de Instrucción en lo Penal V',                          'juzgado', 'Penal', 'San Miguel de Tucumán', 'Tucumán', '3815521756', NULL, true),
  ('Cámara de Apelaciones en lo Penal de Instrucción - Secretaría I',  'camara', 'Penal', 'San Miguel de Tucumán', 'Tucumán', '3815975367', NULL, true),
  ('Cámara de Apelaciones en lo Penal de Instrucción - Secretaría II', 'camara', 'Penal', 'San Miguel de Tucumán', 'Tucumán', '381598514',  NULL, true),
  ('Juzgado Penal de Menores I - Capital',                          'juzgado', 'Penal', 'San Miguel de Tucumán', 'Tucumán', '3815970913', NULL, true),
  ('Juzgado Penal de Menores II - Capital',                         'juzgado', 'Penal', 'San Miguel de Tucumán', 'Tucumán', '3815744769', NULL, true),
  ('Juzgado Penal de Menores - Banda del Río Salí',                 'juzgado', 'Penal', 'Banda del Río Salí',    'Tucumán', '3815556080', NULL, true),
  ('Juzgado de Ejecución de Sentencias',                            'juzgado', 'Penal', 'San Miguel de Tucumán', 'Tucumán', '3816592865', NULL, true)
ON CONFLICT (nombre) DO NOTHING;

-- Agrega columna email a organismos y pre-carga los juzgados/cámaras de Tucumán.
-- Idempotente: usa ON CONFLICT DO NOTHING con restricción única por nombre.

ALTER TABLE organismos
  ADD COLUMN IF NOT EXISTS email text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organismos_nombre_unique'
  ) THEN
    ALTER TABLE organismos ADD CONSTRAINT organismos_nombre_unique UNIQUE (nombre);
  END IF;
END $$;

-- ── Mesa de Entrada ───────────────────────────────────────────────────────────

INSERT INTO organismos (nombre, tipo, jurisdiccion, localidad, provincia, telefono, email, activo) VALUES
  ('Mesa de Entrada Capital',           'organismo_administrativo', NULL, 'San Miguel de Tucumán', 'Tucumán', '3815694983', 'mec@justucuman.gov.ar',    true),
  ('Mesa de Entrada Banda del Río Salí','organismo_administrativo', NULL, 'Banda del Río Salí',    'Tucumán', NULL,         'mecbrs@justucuman.gov.ar', true)
ON CONFLICT (nombre) DO NOTHING;

-- ── Civil y Comercial Común ───────────────────────────────────────────────────

INSERT INTO organismos (nombre, tipo, jurisdiccion, localidad, provincia, telefono, email, activo) VALUES
  ('Juzgado Civil y Comercial Común I Nom.',    'juzgado', 'Civil y Comercial Común', 'San Miguel de Tucumán', 'Tucumán', '3816460430', 'juzciv1@justucuman.gov.ar', true),
  ('Juzgado Civil y Comercial Común II Nom.',   'juzgado', 'Civil y Comercial Común', 'San Miguel de Tucumán', 'Tucumán', '3816576395', 'juzciv2@justucuman.gov.ar', true),
  ('Juzgado Civil y Comercial Común III Nom.',  'juzgado', 'Civil y Comercial Común', 'San Miguel de Tucumán', 'Tucumán', '3815978280', 'juzciv3@justucuman.gov.ar', true),
  ('Juzgado Civil y Comercial Común IV Nom.',   'juzgado', 'Civil y Comercial Común', 'San Miguel de Tucumán', 'Tucumán', '3816592879', 'juzciv4@justucuman.gov.ar', true),
  ('Juzgado Civil y Comercial Común V Nom.',    'juzgado', 'Civil y Comercial Común', 'San Miguel de Tucumán', 'Tucumán', '3815975131', 'juzciv5@justucuman.gov.ar', true),
  ('Juzgado Civil y Comercial Común VI Nom.',   'juzgado', 'Civil y Comercial Común', 'San Miguel de Tucumán', 'Tucumán', '3815972114', 'juzciv6@justucuman.gov.ar', true),
  ('Juzgado Civil y Comercial Común VII Nom.',  'juzgado', 'Civil y Comercial Común', 'San Miguel de Tucumán', 'Tucumán', '3815799046', 'juzciv7@justucuman.gov.ar', true),
  ('Juzgado Civil y Comercial Común VIII Nom.', 'juzgado', 'Civil y Comercial Común', 'San Miguel de Tucumán', 'Tucumán', '3815970810', 'juzciv8@justucuman.gov.ar', true),
  ('Cámara Civil y Comercial Común - Sala I',   'camara',  'Civil y Comercial Común', 'San Miguel de Tucumán', 'Tucumán', '3816611181', 'camccc@justucuman.gov.ar',  true),
  ('Cámara Civil y Comercial Común - Sala II',  'camara',  'Civil y Comercial Común', 'San Miguel de Tucumán', 'Tucumán', '3816592862', 'camccc@justucuman.gov.ar',  true),
  ('Cámara Civil y Comercial Común - Sala III', 'camara',  'Civil y Comercial Común', 'San Miguel de Tucumán', 'Tucumán', '3815985421', 'camccc@justucuman.gov.ar',  true)
ON CONFLICT (nombre) DO NOTHING;

-- ── Documentos y Locaciones ───────────────────────────────────────────────────

INSERT INTO organismos (nombre, tipo, jurisdiccion, localidad, provincia, telefono, email, activo) VALUES
  ('Juzgado Documentos y Locaciones I Nom.',    'juzgado', 'Documentos y Locaciones', 'San Miguel de Tucumán', 'Tucumán', '3815682282', 'juzdoc1@justucuman.gov.ar',    true),
  ('Juzgado Documentos y Locaciones II Nom.',   'juzgado', 'Documentos y Locaciones', 'San Miguel de Tucumán', 'Tucumán', '3815755202', 'juzdoc2@justucuman.gov.ar',    true),
  ('Juzgado Documentos y Locaciones III Nom.',  'juzgado', 'Documentos y Locaciones', 'San Miguel de Tucumán', 'Tucumán', '3815756683', 'juzdoc3@justucuman.gov.ar',    true),
  ('Juzgado Documentos y Locaciones IV Nom.',   'juzgado', 'Documentos y Locaciones', 'San Miguel de Tucumán', 'Tucumán', '3815680686', 'juzdoc4@justucuman.gov.ar',    true),
  ('Juzgado Documentos y Locaciones V Nom.',    'juzgado', 'Documentos y Locaciones', 'San Miguel de Tucumán', 'Tucumán', '3815735871', 'juzdoc5@justucuman.gov.ar',    true),
  ('Juzgado Documentos y Locaciones VI Nom.',   'juzgado', 'Documentos y Locaciones', 'San Miguel de Tucumán', 'Tucumán', '3815760360', 'juzdoc6@justucuman.gov.ar',    true),
  ('Juzgado Documentos y Locaciones VII Nom.',  'juzgado', 'Documentos y Locaciones', 'San Miguel de Tucumán', 'Tucumán', '3815769214', 'juzdoc7@justucuman.gov.ar',    true),
  ('Juzgado Documentos y Locaciones VIII Nom.', 'juzgado', 'Documentos y Locaciones', 'San Miguel de Tucumán', 'Tucumán', '3815977125', 'juzdoc8@justucuman.gov.ar',    true),
  ('Juzgado Documentos y Locaciones IX Nom.',   'juzgado', 'Documentos y Locaciones', 'San Miguel de Tucumán', 'Tucumán', '3815759443', 'juzdoc9@justucuman.gov.ar',    true),
  ('Cámara Documentos y Locaciones - Sala I',   'camara',  'Documentos y Locaciones', 'San Miguel de Tucumán', 'Tucumán', '3815719174', 'camdoc123@justucuman.gov.ar', true),
  ('Cámara Documentos y Locaciones - Sala II',  'camara',  'Documentos y Locaciones', 'San Miguel de Tucumán', 'Tucumán', '3815760233', 'camdoc123@justucuman.gov.ar', true),
  ('Cámara Documentos y Locaciones - Sala III', 'camara',  'Documentos y Locaciones', 'San Miguel de Tucumán', 'Tucumán', '3815757637', 'camdoc123@justucuman.gov.ar', true)
ON CONFLICT (nombre) DO NOTHING;

-- ── Laboral ───────────────────────────────────────────────────────────────────
-- Correos de la Cámara: camtra12 cubre Salas I-II, camtra34 Salas III-IV, camtra56 Salas V-VI.

INSERT INTO organismos (nombre, tipo, jurisdiccion, localidad, provincia, telefono, email, activo) VALUES
  ('Juzgado del Trabajo I',    'juzgado', 'Laboral', 'San Miguel de Tucumán', 'Tucumán', '3815520282', 'juztra1@justucuman.gov.ar', true),
  ('Juzgado del Trabajo II',   'juzgado', 'Laboral', 'San Miguel de Tucumán', 'Tucumán', '3815765065', 'juztra2@justucuman.gov.ar', true),
  ('Juzgado del Trabajo III',  'juzgado', 'Laboral', 'San Miguel de Tucumán', 'Tucumán', '3815557444', 'juztra3@justucuman.gov.ar', true),
  ('Juzgado del Trabajo IV',   'juzgado', 'Laboral', 'San Miguel de Tucumán', 'Tucumán', '3815672392', 'juztra4@justucuman.gov.ar', true),
  ('Juzgado del Trabajo V',    'juzgado', 'Laboral', 'San Miguel de Tucumán', 'Tucumán', '3815760770', 'juztra5@justucuman.gov.ar', true),
  ('Juzgado del Trabajo VI',   'juzgado', 'Laboral', 'San Miguel de Tucumán', 'Tucumán', '3815677597', 'juztra6@justucuman.gov.ar', true),
  ('Juzgado del Trabajo VII',  'juzgado', 'Laboral', 'San Miguel de Tucumán', 'Tucumán', '3815678388', 'juztra7@justucuman.gov.ar', true),
  ('Juzgado del Trabajo VIII', 'juzgado', 'Laboral', 'San Miguel de Tucumán', 'Tucumán', '3815677977', 'juztra8@justucuman.gov.ar', true),
  ('Cámara del Trabajo - Sala I',   'camara', 'Laboral', 'San Miguel de Tucumán', 'Tucumán', '3815672905', 'camtra12@justucuman.gov.ar', true),
  ('Cámara del Trabajo - Sala II',  'camara', 'Laboral', 'San Miguel de Tucumán', 'Tucumán', '3815673594', 'camtra12@justucuman.gov.ar', true),
  ('Cámara del Trabajo - Sala III', 'camara', 'Laboral', 'San Miguel de Tucumán', 'Tucumán', '3815674127', 'camtra34@justucuman.gov.ar', true),
  ('Cámara del Trabajo - Sala IV',  'camara', 'Laboral', 'San Miguel de Tucumán', 'Tucumán', '3815744980', 'camtra34@justucuman.gov.ar', true),
  ('Cámara del Trabajo - Sala V',   'camara', 'Laboral', 'San Miguel de Tucumán', 'Tucumán', '3815740449', 'camtra56@justucuman.gov.ar', true),
  ('Cámara del Trabajo - Sala VI',  'camara', 'Laboral', 'San Miguel de Tucumán', 'Tucumán', '3815731954', 'camtra56@justucuman.gov.ar', true)
ON CONFLICT (nombre) DO NOTHING;

-- ── Contencioso Administrativo ────────────────────────────────────────────────

INSERT INTO organismos (nombre, tipo, jurisdiccion, localidad, provincia, telefono, email, activo) VALUES
  ('Cámara Contencioso Administrativo - Sala I',   'camara', 'Contencioso Administrativo', 'San Miguel de Tucumán', 'Tucumán', '3815753484', 'camcadm1@justucuman.gov.ar', true),
  ('Cámara Contencioso Administrativo - Sala II',  'camara', 'Contencioso Administrativo', 'San Miguel de Tucumán', 'Tucumán', '3815762712', 'camcadm2@justucuman.gov.ar', true),
  ('Cámara Contencioso Administrativo - Sala III', 'camara', 'Contencioso Administrativo', 'San Miguel de Tucumán', 'Tucumán', '3815761574', 'camcadm3@justucuman.gov.ar', true)
ON CONFLICT (nombre) DO NOTHING;

-- ── Cobros y Apremios ─────────────────────────────────────────────────────────

INSERT INTO organismos (nombre, tipo, jurisdiccion, localidad, provincia, telefono, email, activo) VALUES
  ('Juzgado de Cobros y Apremios I Nom.',  'juzgado', 'Cobros y Apremios', 'San Miguel de Tucumán', 'Tucumán', '3815764511', 'juzapr1@justucuman.gov.ar', true),
  ('Juzgado de Cobros y Apremios II Nom.', 'juzgado', 'Cobros y Apremios', 'San Miguel de Tucumán', 'Tucumán', '3815762710', 'juzapr2@justucuman.gov.ar', true)
ON CONFLICT (nombre) DO NOTHING;

-- ── Familia y Sucesiones ──────────────────────────────────────────────────────

INSERT INTO organismos (nombre, tipo, jurisdiccion, localidad, provincia, telefono, email, activo) VALUES
  ('Juzgado Civil en Familia y Sucesiones I',   'juzgado', 'Familia y Sucesiones', 'San Miguel de Tucumán', 'Tucumán', '3815751844', 'juzfam1@justucuman.gov.ar',  true),
  ('Juzgado Civil en Familia y Sucesiones II',  'juzgado', 'Familia y Sucesiones', 'San Miguel de Tucumán', 'Tucumán', '3815751553', 'juzfam2@justucuman.gov.ar',  true),
  ('Juzgado Civil en Familia y Sucesiones III', 'juzgado', 'Familia y Sucesiones', 'San Miguel de Tucumán', 'Tucumán', '3815751676', 'juzfam3@justucuman.gov.ar',  true),
  ('Juzgado Civil en Familia y Sucesiones IV',  'juzgado', 'Familia y Sucesiones', 'San Miguel de Tucumán', 'Tucumán', '3815733352', 'juzfam4@justucuman.gov.ar',  true),
  ('Juzgado Civil en Familia y Sucesiones V',   'juzgado', 'Familia y Sucesiones', 'San Miguel de Tucumán', 'Tucumán', '3815748453', 'juzfam5@justucuman.gov.ar',  true),
  ('Juzgado Civil en Familia y Sucesiones VI',  'juzgado', 'Familia y Sucesiones', 'San Miguel de Tucumán', 'Tucumán', '3815735436', 'juzfam6@justucuman.gov.ar',  true),
  ('Juzgado Civil en Familia y Sucesiones VII', 'juzgado', 'Familia y Sucesiones', 'San Miguel de Tucumán', 'Tucumán', '3815750257', 'juzfam7@justucuman.gov.ar',  true),
  ('Juzgado Civil en Familia y Sucesiones VIII','juzgado', 'Familia y Sucesiones', 'San Miguel de Tucumán', 'Tucumán', '3815719676', 'juzfam8@justucuman.gov.ar',  true),
  ('Juzgado Civil en Familia y Sucesiones IX',  'juzgado', 'Familia y Sucesiones', 'San Miguel de Tucumán', 'Tucumán', '3815747457', 'juzfam9@justucuman.gov.ar',  true),
  ('Juzgado Civil en Familia y Sucesiones X',   'juzgado', 'Familia y Sucesiones', 'San Miguel de Tucumán', 'Tucumán', NULL,         'juzfam10@justucuman.gov.ar', true)
ON CONFLICT (nombre) DO NOTHING;

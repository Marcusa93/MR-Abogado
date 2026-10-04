-- Tabla de plazos procesales configurables por fuero.
-- Permite ajustar valores sin redeploy. Seeded con valores aproximados para
-- CPCC Tucumán Ley 6176 y Cód. Proc. Laboral Ley 7816.
-- Marco debe revisar y corregir los artículos según el texto vigente.

CREATE TABLE IF NOT EXISTS plazos_procesales (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_acto    text        NOT NULL,
  dias         integer     NOT NULL CHECK (dias > 0),
  es_habiles   boolean     NOT NULL DEFAULT true,
  base_legal   text,
  fuero        text        NOT NULL DEFAULT 'civil',
  activo       boolean     NOT NULL DEFAULT true,
  notas        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo_acto, fuero)
);

ALTER TABLE plazos_procesales ENABLE ROW LEVEL SECURITY;

-- Todo el staff autenticado puede leer; solo service_role modifica
CREATE POLICY "staff puede leer plazos"
  ON plazos_procesales FOR SELECT TO authenticated USING (true);

-- Seed — CPCC Tucumán Ley 6176 (civil / familia)
INSERT INTO plazos_procesales (tipo_acto, dias, es_habiles, base_legal, fuero, notas) VALUES
  ('traslado_demanda',    15, true, 'art. 362 Ley 6176', 'civil',   'Verificar numeración vigente'),
  ('traslado_excepcion',  5,  true, 'art. 392 Ley 6176', 'civil',   null),
  ('intimacion_pago',     5,  true, 'art. 553 Ley 6176', 'civil',   'Ejecutivo'),
  ('recurso_reposicion',  3,  true, 'art. 273 Ley 6176', 'civil',   null),
  ('apelacion',           5,  true, 'art. 278 Ley 6176', 'civil',   null),
  ('ofrecimiento_prueba', 10, true, 'art. 442 Ley 6176', 'civil',   'Verificar plazo por fuero'),
  ('respuesta_cautelar',  5,  true, 'art. 208 Ley 6176', 'civil',   null),
  ('citacion_audiencia',  3,  true, 'Ley 6176',          'civil',   null),
  -- Laboral — Cód. Proc. Laboral Tucumán Ley 7816
  ('traslado_demanda',    10, true, 'art. 61 Ley 7816',  'laboral', 'Verificar numeración vigente'),
  ('apelacion',           5,  true, 'art. 105 Ley 7816', 'laboral', null),
  ('recurso_reposicion',  3,  true, 'art. 100 Ley 7816', 'laboral', null),
  ('respuesta_cautelar',  5,  true, 'Ley 7816',          'laboral', null)
ON CONFLICT (tipo_acto, fuero) DO NOTHING;

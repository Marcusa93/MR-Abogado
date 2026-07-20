-- ============================================================
-- Estimador de daños auditable (Tucumán)
-- Tres tablas:
--   valores_referencia  — CBT/SMVM/IPC/UVA actualizables por fecha (alimentan el motor)
--   dano_precedentes    — base jurisprudencial para comparar/normalizar
--   dano_calculos       — cálculos guardados (input/resultado jsonb + columnas de listado)
-- RLS canónica: tabla profiles (roles MAYÚSCULA) + patrón EXISTS, como presupuestos.
-- NO se usa el patrón de feria_judicial (perfiles/minúscula = drift).
-- ============================================================

-- ── valores_referencia ───────────────────────────────────────────────────────
-- Un registro por (indicador, vigencia_desde). El motor toma el valor vigente
-- (mayor vigencia_desde <= fecha_valuacion) por indicador.
CREATE TABLE public.valores_referencia (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicador      text NOT NULL
                 CHECK (indicador IN ('CBT_HOGAR3', 'SMVM', 'IPC', 'UVA')),
  vigencia_desde date NOT NULL,
  valor          numeric NOT NULL CHECK (valor > 0),
  unidad         text,
  fuente         text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (indicador, vigencia_desde)
);

CREATE INDEX idx_valores_referencia_lookup
  ON public.valores_referencia (indicador, vigencia_desde DESC);

COMMENT ON TABLE public.valores_referencia IS
  'Valores económicos de referencia (CBT Hogar 3, SMVM, IPC, UVA) por fecha de vigencia. Alimentan el estimador de daños. Actualizar con la última publicación oficial (INDEC/Consejo del Salario).';

-- ── dano_precedentes ─────────────────────────────────────────────────────────
CREATE TABLE public.dano_precedentes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribunal            text NOT NULL,
  sala                text,
  fecha               date,
  caratula            text NOT NULL,
  expediente          text,
  tipo_conflicto      text,
  rubro               text NOT NULL DEFAULT 'mixto'
                      CHECK (rubro IN ('punitivo', 'no_patrimonial', 'patrimonial', 'mixto')),
  monto_nominal       numeric,
  fecha_cuantificacion date,
  unidad_normalizada  text CHECK (unidad_normalizada IN ('CBT', 'SMVM', 'IPC', 'UVA')),
  valor_en_unidad     numeric,
  hechos_relevantes   text,
  fundamento          text,
  fuente_url          text,
  estado_verificacion text NOT NULL DEFAULT 'remision_oficial'
                      CHECK (estado_verificacion IN ('verificado_integro', 'remision_oficial')),
  jurisdiccion        text NOT NULL DEFAULT 'Tucuman',
  activo              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dano_precedentes_rubro ON public.dano_precedentes (rubro) WHERE activo;
CREATE INDEX idx_dano_precedentes_fecha ON public.dano_precedentes (fecha DESC);

COMMENT ON TABLE public.dano_precedentes IS
  'Base jurisprudencial (prioridad Tucumán) para comparar y normalizar montos. estado_verificacion distingue fallos leídos íntegros de los identificados por remisión oficial (requieren relectura antes de citarse como soporte fuerte).';

-- ── dano_calculos ────────────────────────────────────────────────────────────
CREATE TABLE public.dano_calculos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo                text NOT NULL,
  tipo_caso             text,
  fuero                 text,
  tipo_proceso_id       uuid REFERENCES public.tipos_proceso_judicial(id) ON DELETE SET NULL,
  consulta_id           uuid REFERENCES public.consultas(id) ON DELETE CASCADE,
  expediente_id         uuid REFERENCES public.expedientes(id) ON DELETE SET NULL,
  input                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  resultado             jsonb NOT NULL DEFAULT '{}'::jsonb,
  valores_snapshot      jsonb,
  monto_razonable_total numeric,
  nivel_confianza       text CHECK (nivel_confianza IN ('bajo', 'medio', 'alto')),
  created_by            uuid NOT NULL REFERENCES public.profiles(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dano_calculos_consulta_id ON public.dano_calculos (consulta_id);
CREATE INDEX idx_dano_calculos_expediente_id ON public.dano_calculos (expediente_id);
CREATE INDEX idx_dano_calculos_created_at ON public.dano_calculos (created_at DESC);

COMMENT ON TABLE public.dano_calculos IS
  'Cálculos de daños guardados. input/resultado en jsonb (3 escenarios + auditoría); columnas tipadas para listado/filtro. Vinculable a una consulta o expediente. Solo visible para roles no SECRETARIA.';

-- ── Triggers updated_at ──────────────────────────────────────────────────────
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.dano_precedentes
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.dano_calculos
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.valores_referencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dano_precedentes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dano_calculos      ENABLE ROW LEVEL SECURITY;

-- valores_referencia: lee cualquier autenticado; escribe ADMIN/ABOGADO/DIRECTOR
CREATE POLICY "valores_referencia_select"
  ON public.valores_referencia FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "valores_referencia_write"
  ON public.valores_referencia FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND rol IN ('ADMIN', 'ABOGADO', 'DIRECTOR'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND rol IN ('ADMIN', 'ABOGADO', 'DIRECTOR'))
  );

-- dano_precedentes: lee cualquier autenticado; escribe ADMIN/ABOGADO/DIRECTOR
CREATE POLICY "dano_precedentes_select"
  ON public.dano_precedentes FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "dano_precedentes_write"
  ON public.dano_precedentes FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND rol IN ('ADMIN', 'ABOGADO', 'DIRECTOR'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND rol IN ('ADMIN', 'ABOGADO', 'DIRECTOR'))
  );

-- dano_calculos: todos los roles EXCEPTO SECRETARIA (dato sensible, como presupuestos)
CREATE POLICY "dano_calculos_no_secretaria"
  ON public.dano_calculos FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND rol NOT IN ('SECRETARIA'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND rol NOT IN ('SECRETARIA'))
  );

-- ============================================================
-- Seed: valores de referencia
-- CBT Hogar 3 junio 2026 según informe (INDEC). SMVM: verificar/actualizar.
-- ⚠️ Refrescar contra la última publicación oficial disponible.
-- ============================================================
INSERT INTO public.valores_referencia (indicador, vigencia_desde, valor, unidad, fuente) VALUES
  ('CBT_HOGAR3', '2026-06-01', 1610772.48, 'pesos', 'INDEC — Canasta Básica Total Hogar 3, junio 2026 (informe base)')
ON CONFLICT (indicador, vigencia_desde) DO UPDATE
  SET valor = excluded.valor, fuente = excluded.fuente;

-- ============================================================
-- Seed: precedentes (tabla del informe, prioridad Tucumán).
-- Montos/unidades sólo donde el informe los afirma. estado_verificacion respetado.
-- ============================================================
INSERT INTO public.dano_precedentes
  (tribunal, sala, fecha, caratula, expediente, tipo_conflicto, rubro,
   monto_nominal, unidad_normalizada, valor_en_unidad, hechos_relevantes,
   estado_verificacion, jurisdiccion)
VALUES
  ('JCC 8ª Nom., Tucumán', NULL, '2026-02-06',
   'Rodríguez Juan Marcelo c/ Torres Solano Manuel y otros s/ daños y perjuicios', '3611/14',
   'daños y perjuicios', 'patrimonial',
   21748370.01, NULL, NULL,
   'Fórmula art. 1746 (forma cerrada C = a·(1-V^n)·1/i, config. Vuoto II/Méndez con SMVM a la sentencia). Daño psíquico, intereses.',
   'verificado_integro', 'Tucuman'),

  ('OGA CC N°1, Tucumán', NULL, '2024-02-14',
   'Ring Leandro Roberto c/ Orbis Compañía Argentina de Seguros S.A. s/ sumarísimo', '2559/23',
   'consumo / seguro', 'punitivo',
   NULL, NULL, NULL,
   'Aplica fórmula Irigoyen Testa D = C·(1-Pc)/(Pc·Pd) para daño punitivo.',
   'verificado_integro', 'Tucuman'),

  ('OGA CC N°4, Tucumán', NULL, '2025-05-12',
   'Pilot René Marcos c/ Galeno s/ procesos de consumo', '2340/24',
   'consumo / prepaga', 'punitivo',
   NULL, 'CBT', 15,
   'Prepaga. Daño punitivo cuantificado en 15 canastas básicas.',
   'verificado_integro', 'Tucuman'),

  ('Cámara CC Sala I, Tucumán', 'I', '2025-04-24',
   'Paliza María Isabel c/ Cobertura de Salud S.A. s/ sumario', '4035/17',
   'consumo / salud', 'punitivo',
   NULL, 'CBT', 1.5,
   'Salud. Multa elevada a 1,5 canastas en apelación.',
   'verificado_integro', 'Tucuman'),

  ('JCC XI Nom., Tucumán', NULL, '2025-02-06',
   'Roldán Sandra Anabel c/ Tucumán Motos de Grupo SIS S.R.L.', '1215/22',
   'consumo / motocicleta', 'punitivo',
   NULL, 'CBT', 1,
   'Consumo, motocicleta. Punitivo de 1 canasta.',
   'verificado_integro', 'Tucuman'),

  ('Cámara CC Sala II Concepción', 'II', '2025-06-18',
   'Lunardello Patricia Viviana c/ SAT SAPEM s/ amparo', '2/23',
   'servicio público', 'punitivo',
   NULL, 'CBT', 15,
   'Servicio público. Punitivo de 15 canastas.',
   'verificado_integro', 'Tucuman'),

  ('Cámara CC Sala II, Tucumán', 'II', '2025-05-21',
   'Egloff Juan Rodolfo c/ Banco Macro S.A. s/ daños y perjuicios', '2834/21 (Sent. 407)',
   'consumo / bancario', 'mixto',
   NULL, 'CBT', 3.5,
   'UVA, daño moral. Punitivo de 3,5 canastas.',
   'verificado_integro', 'Tucuman'),

  ('Cámara CC Sala II, Tucumán', 'II', '2025-03-18',
   'Farall Horacio Enrique c/ Yuhmak S.A. y otra s/ sumarísimo', '3974/22 (Sent. 174)',
   'consumo / producto defectuoso', 'mixto',
   NULL, NULL, NULL,
   'Producto defectuoso. Daño moral y punitivo.',
   'verificado_integro', 'Tucuman'),

  ('CSJT', NULL, '2026-01-01',
   'Estéban María Soledad c/ Volkswagen S.A. de Ahorro para Fines Determinados', '2875/20 (Sent. 316)',
   'consumo / ahorro previo', 'punitivo',
   NULL, 'CBT', 2,
   'Ahorro previo automotor. Punitivo de 2 canastas.',
   'verificado_integro', 'Tucuman'),

  ('CSJT', NULL, '2024-01-01',
   'Goldman María Verónica c/ BBVA Banco Francés S.A. (Sent. 1887)', '1774/19 (Sent. 1887)',
   'consumo / bancario / trato digno', 'punitivo',
   NULL, NULL, NULL,
   'Trato digno bancario. Cuantía del punitivo.',
   'verificado_integro', 'Tucuman'),

  ('CSJT', NULL, '2023-01-01',
   'Goldman María Verónica c/ BBVA Banco Francés S.A. (Sent. 966)', '1774/19 (Sent. 966)',
   'consumo / bancario / trato indigno', 'punitivo',
   NULL, NULL, NULL,
   'Procedencia de trato indigno / rechazo.',
   'verificado_integro', 'Tucuman'),

  ('CSJT', NULL, '2023-01-01',
   'Pintos Jorge Emilio y otros c/ Castillo S.A.C.I.F.I.A. (Sent. 190)', '630/15 (Sent. 190)',
   'consumo / intereses punitivo', 'punitivo',
   NULL, NULL, NULL,
   'Intereses del punitivo: corren desde el vencimiento del plazo de pago contado desde la firmeza. Corrige retroactividad excesiva.',
   'verificado_integro', 'Tucuman'),

  ('Cámara CC Necochea', NULL, '2016-10-06',
   'Seguro y daño punitivo (RGE:NE-1203-2014)', 'RGE:NE-1203-2014',
   'consumo / seguro', 'punitivo',
   NULL, NULL, NULL,
   'Aplicación de fórmula Irigoyen Testa.',
   'verificado_integro', 'Buenos Aires'),

  ('Cámara CC Necochea', NULL, '2016-01-01',
   'Información bancaria errónea (Expte. 10518)', '10518',
   'consumo / bancario', 'punitivo',
   NULL, NULL, NULL,
   'Aplicación de fórmula Irigoyen Testa.',
   'verificado_integro', 'Buenos Aires'),

  -- Identificados por remisión oficial (requieren relectura íntegra antes de citar)
  ('Cámara CC Sala III, Tucumán', 'III', '2017-01-01',
   'Ávila Augusto Fernando c/ Telecom Argentina S.A. s/ daños y perjuicios', '7436/15',
   'consumo / telecomunicaciones', 'punitivo',
   NULL, NULL, NULL,
   'Autonomía del daño punitivo; excluye cuantificarlo como % de otras indemnizaciones. Publicidad de la condena.',
   'remision_oficial', 'Tucuman'),

  ('CSJT', NULL, '2024-03-12',
   'Correa Medina, Carlos Ernesto c/ ALRA S.A. y otro (Sent. 191)', NULL,
   'consumo', 'punitivo', NULL, NULL, NULL,
   'Insuficiencia del quantum punitivo.', 'remision_oficial', 'Tucuman'),

  ('CSJT', NULL, '2022-12-29',
   'Tejeda, Claudia Melina c/ Telecom Personal S.R.L. (Sent. 1673)', NULL,
   'consumo / telecomunicaciones', 'punitivo', NULL, NULL, NULL,
   'Suficiencia y disuasión.', 'remision_oficial', 'Tucuman'),

  ('CSJT', NULL, '2022-11-01',
   'Sawaya, Laura Josefina c/ MAPFRE Argentina (Sent. 1370)', NULL,
   'consumo / seguro', 'punitivo', NULL, NULL, NULL,
   'Punitivo y cuantía.', 'remision_oficial', 'Tucuman'),

  ('CSJT', NULL, '2019-12-20',
   'Gramajo, David E. c/ Cía. de Seguros Rivadavia (Sent. 2489)', NULL,
   'consumo / seguro', 'punitivo', NULL, NULL, NULL,
   'Función disuasoria.', 'remision_oficial', 'Tucuman'),

  ('CSJT', NULL, '2019-11-22',
   'Morfil, Cergio c/ Mapfre (Sent. 2260)', NULL,
   'consumo / seguro', 'punitivo', NULL, NULL, NULL,
   'Quantum punitivo.', 'remision_oficial', 'Tucuman'),

  ('CSJT', NULL, '2019-11-22',
   'Pérez, Mario c/ Telecom (Sent. 2230)', NULL,
   'consumo / telecomunicaciones', 'punitivo', NULL, NULL, NULL,
   'Quantum punitivo.', 'remision_oficial', 'Tucuman'),

  ('CSJT', NULL, '2018-12-11',
   'Muler, Germán Esteban c/ Telecom Personal S.A. (Sent. 1896)', NULL,
   'consumo / telecomunicaciones', 'punitivo', NULL, NULL, NULL,
   'Disuasión efectiva.', 'remision_oficial', 'Tucuman'),

  ('CSJT', NULL, '2018-10-16',
   'Vargas Ramón Agustín c/ Robledo Walter Sebastián s/ daños y perjuicios (Sent. 1487)', NULL,
   'daños y perjuicios', 'patrimonial', NULL, NULL, NULL,
   'Deuda de valor: interés puro + valuación actual.', 'remision_oficial', 'Tucuman'),

  ('CSJT', NULL, '2019-06-13',
   'Nisoria Mario David c/ Argañaraz Oscar Alberto y otros (Sent. 975)', NULL,
   'daños y perjuicios', 'patrimonial', NULL, NULL, NULL,
   'Interés puro y valuación a valores actuales.', 'remision_oficial', 'Tucuman'),

  ('CSJT', NULL, '2019-04-16',
   'Ávila Mercedes Nora c/ Fernández Elsa Amanda y otros (Sent. 506)', NULL,
   'daños y perjuicios', 'patrimonial', NULL, NULL, NULL,
   'Interés puro y valuación a valores actuales.', 'remision_oficial', 'Tucuman'),

  ('Cámara CC Sala II, Tucumán', 'II', '2013-03-27',
   'Raffault, Carmelina c/ Segura, José Osvaldo y otro s/ daños y perjuicios', NULL,
   'daños y perjuicios', 'patrimonial', NULL, NULL, NULL,
   'Forma cerrada de renta capitalizada.', 'remision_oficial', 'Tucuman'),

  ('TSJ Córdoba', NULL, '2022-04-29',
   'Vendivengo, Mirta Susana c/ Telecom Argentina S.A. – abreviado (Res. 52)', NULL,
   'consumo / telecomunicaciones', 'punitivo', NULL, NULL, NULL,
   'Intereses del daño punitivo desde firmeza.', 'remision_oficial', 'Cordoba'),

  ('Cámara Apel. Bahía Blanca Sala II', 'II', '2014-10-01',
   'C., M.C. c/ Banco de Galicia', NULL,
   'consumo / bancario', 'punitivo', NULL, NULL, NULL,
   'Uso de Irigoyen Testa.', 'remision_oficial', 'Buenos Aires'),

  ('CSJN', NULL, '2021-01-01',
   'Grippo (Fallos 344:2256)', NULL,
   'reparación plena', 'patrimonial', NULL, NULL, NULL,
   'Reparación plena.', 'remision_oficial', 'Nacional'),

  ('CSJN', NULL, '2017-01-01',
   'Ontiveros (Fallos 340:1038)', NULL,
   'reparación integral', 'patrimonial', NULL, NULL, NULL,
   'Reparación integral.', 'remision_oficial', 'Nacional'),

  ('CSJN', NULL, '1986-01-01',
   'Santa Coloma (Fallos 308:1160)', NULL,
   'daño moral', 'no_patrimonial', NULL, NULL, NULL,
   'Insuficiencia de daño moral nominal.', 'remision_oficial', 'Nacional'),

  ('CNTrab Sala III', 'III', '2008-04-28',
   'Méndez, Alejandro c/ Mylba S.A. y otros', NULL,
   'laboral / incapacidad', 'patrimonial', NULL, NULL, NULL,
   'Origen histórico de "Vuoto II" (fórmula de renta capitalizada).', 'remision_oficial', 'Nacional'),

  ('CSJN', NULL, '2008-04-08',
   'Aróstegui, P.M. c/ Omega ART', NULL,
   'laboral / incapacidad', 'patrimonial', NULL, NULL, NULL,
   'Crítica a usos rígidos de fórmulas.', 'remision_oficial', 'Nacional');

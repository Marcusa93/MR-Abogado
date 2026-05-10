-- ============================================================
-- Marco Rossi Estudio Jurídico — Migración 020: Integración SAE
-- Sistema de Actuación Electrónica del Poder Judicial de Tucumán
--
-- Tablas nuevas:
--   sae_credentials  — credenciales SAE por abogado (una por perfil)
--   sae_movements    — actuaciones bajadas de SAE (solo lectura, sincronizadas)
--   sae_sync_logs    — log de cada sincronización
--
-- Cambios en tablas existentes:
--   audiencias       — agrega fuente ('manual' | 'sae') y sae_movement_id
--   expedientes      — asegura columnas numero_sae, estado_sae, ultima_sincronizacion_sae
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. ENUM: tipo de movimiento SAE
-- ────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.sae_movement_type AS ENUM (
    'sentencia',
    'traslado',
    'audiencia',
    'prueba',
    'embargo',
    'cedula',
    'oficio',
    'intimacion',
    'planilla',
    'informe',
    'decreto',
    'escrito_parte',
    'otro'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────────────────────
-- 2. ENUM: fuente de audiencia
-- ────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.audiencia_fuente AS ENUM ('manual', 'sae');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────────────────────
-- 3. TABLA: sae_credentials
--    Una fila por perfil (abogado). Almacena usuario y clave
--    del sistema SAE (justucuman.gov.ar) de forma cifrada.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sae_credentials (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Credenciales SAE
  username          text NOT NULL,
  encrypted_secret  text NOT NULL,          -- base64 del password cifrado en servidor
  provider          text NOT NULL DEFAULT 'justucuman', -- para futuro: 'federal', etc.

  -- Estado de la conexión
  status            text NOT NULL DEFAULT 'pendiente'
                    CHECK (status IN ('pendiente', 'activo', 'error', 'desactivado')),
  last_login_at     timestamptz,
  last_sync_at      timestamptz,
  last_error        text,

  -- Metadatos
  config            jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- Un abogado tiene una sola credencial por provider
  UNIQUE (profile_id, provider)
);

COMMENT ON TABLE  public.sae_credentials IS 'Credenciales SAE por abogado para sincronización con el Poder Judicial';
COMMENT ON COLUMN public.sae_credentials.encrypted_secret IS 'Contraseña cifrada (AES-256 server-side). Nunca se expone al cliente.';
COMMENT ON COLUMN public.sae_credentials.provider IS 'Identificador del sistema judicial: justucuman (por defecto), federal, etc.';

-- RLS
ALTER TABLE public.sae_credentials ENABLE ROW LEVEL SECURITY;

-- Cada abogado ve y edita solo sus propias credenciales
CREATE POLICY "sae_credentials_own" ON public.sae_credentials
  FOR ALL USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- ADMIN puede ver todas
CREATE POLICY "sae_credentials_admin" ON public.sae_credentials
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND rol = 'ADMIN'
    )
  );

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_sae_credentials_updated_at ON public.sae_credentials;
CREATE TRIGGER trg_sae_credentials_updated_at
  BEFORE UPDATE ON public.sae_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 4. TABLA: sae_movements
--    Actuaciones bajadas de SAE. Solo lectura desde el cliente.
--    La sincronización las inserta vía service role / edge function.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sae_movements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id     uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,

  -- Identificación en SAE
  external_id       text,                   -- histid del SAE
  sae_case_id       text,                   -- external_case_id en SAE

  -- Contenido de la actuación
  fecha             date NOT NULL,
  titulo            text NOT NULL,
  cuerpo            text,
  tipo_movimiento   public.sae_movement_type NOT NULL DEFAULT 'otro',

  -- Deduplicación
  fingerprint       text NOT NULL,          -- SHA256(expediente_id + titulo + fecha + cuerpo)

  -- Metadatos
  tiene_documentos  boolean NOT NULL DEFAULT false,
  raw_payload       jsonb DEFAULT '{}'::jsonb,   -- respuesta original de SAE
  synced_at         timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- No duplicar actuaciones dentro del mismo expediente
  UNIQUE (expediente_id, fingerprint)
);

COMMENT ON TABLE  public.sae_movements IS 'Actuaciones (movimientos) sincronizadas desde SAE. Solo lectura para el cliente.';
COMMENT ON COLUMN public.sae_movements.fingerprint IS 'SHA256 para deduplicación. Calculado por el sync engine.';
COMMENT ON COLUMN public.sae_movements.raw_payload IS 'Respuesta JSON original del SAE para trazabilidad.';

-- Índices
CREATE INDEX IF NOT EXISTS idx_sae_movements_expediente
  ON public.sae_movements (expediente_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_sae_movements_tipo
  ON public.sae_movements (expediente_id, tipo_movimiento);

CREATE INDEX IF NOT EXISTS idx_sae_movements_synced
  ON public.sae_movements (synced_at DESC);

-- RLS: solo pueden ver los movimientos de expedientes que les pertenecen
ALTER TABLE public.sae_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sae_movements_select" ON public.sae_movements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.expediente_miembros em
      WHERE em.expediente_id = sae_movements.expediente_id
        AND em.profile_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND rol = 'ADMIN'
    )
  );

-- Solo service role puede insertar/actualizar (el sync engine)
-- Los clientes no pueden modificar el historial SAE
CREATE POLICY "sae_movements_insert_service" ON public.sae_movements
  FOR INSERT WITH CHECK (false);  -- bloqueado para anon/auth; el sync usa service role

-- ────────────────────────────────────────────────────────────
-- 5. TABLA: sae_sync_logs
--    Registro de cada sincronización (éxito, error, parcial).
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sae_sync_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id       uuid REFERENCES public.expedientes(id) ON DELETE SET NULL,
  profile_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Resultado
  status              text NOT NULL DEFAULT 'iniciado'
                      CHECK (status IN ('iniciado', 'exitoso', 'parcial', 'error')),
  nuevas_actuaciones  int NOT NULL DEFAULT 0,
  duplicadas          int NOT NULL DEFAULT 0,
  audiencias_sugeridas int NOT NULL DEFAULT 0,

  -- Timing
  started_at          timestamptz NOT NULL DEFAULT now(),
  finished_at         timestamptz,
  duration_ms         int GENERATED ALWAYS AS (
                        EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000
                      ) STORED,

  -- Error (si aplica)
  error_code          text,
  error_message       text,

  -- Metadatos adicionales
  raw_meta            jsonb DEFAULT '{}'::jsonb,

  created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sae_sync_logs IS 'Log de auditoría de cada sincronización con SAE.';

CREATE INDEX IF NOT EXISTS idx_sae_sync_logs_expediente
  ON public.sae_sync_logs (expediente_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_sae_sync_logs_profile
  ON public.sae_sync_logs (profile_id, started_at DESC);

-- RLS
ALTER TABLE public.sae_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sae_sync_logs_own" ON public.sae_sync_logs
  FOR SELECT USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND rol = 'ADMIN'
    )
  );

-- ────────────────────────────────────────────────────────────
-- 6. TABLA expedientes: asegurar columnas SAE
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS numero_sae              text,
  ADD COLUMN IF NOT EXISTS estado_sae              text,
  ADD COLUMN IF NOT EXISTS ultima_sincronizacion_sae timestamptz;

COMMENT ON COLUMN public.expedientes.numero_sae IS 'Número de expediente en SAE (e.g. "123456/2024")';
COMMENT ON COLUMN public.expedientes.estado_sae  IS 'Último estado procedimental reportado por SAE';
COMMENT ON COLUMN public.expedientes.ultima_sincronizacion_sae IS 'Timestamp de la última sincronización exitosa con SAE';

CREATE INDEX IF NOT EXISTS idx_expedientes_numero_sae
  ON public.expedientes (numero_sae)
  WHERE numero_sae IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 7. TABLA audiencias: agregar fuente y vínculo con SAE
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.audiencias
  ADD COLUMN IF NOT EXISTS fuente        public.audiencia_fuente NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS sae_movement_id uuid REFERENCES public.sae_movements(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.audiencias.fuente IS 'Origen de la audiencia: manual (cargada por el estudio) o sae (detectada en una actuación)';
COMMENT ON COLUMN public.audiencias.sae_movement_id IS 'Movimiento SAE del que se derivó esta audiencia (si fuente=sae)';

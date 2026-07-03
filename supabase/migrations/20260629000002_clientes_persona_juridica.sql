-- Soporte de persona jurídica en clientes.
-- Agrega tipo_persona, razon_social y campos de responsable/contacto.
-- Hace nullable a dni, nombre y apellido para permitir personas jurídicas
-- donde el identificador principal es el CUIT (columna cuil ya existe).

-- ── Columnas nuevas ───────────────────────────────────────────────────────────
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS tipo_persona text NOT NULL DEFAULT 'fisica'
    CONSTRAINT chk_tipo_persona CHECK (tipo_persona IN ('fisica', 'juridica'));

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS razon_social text;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS responsable_nombre text;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS responsable_cargo text;

-- ── Hacer nullable las columnas rígidas de persona física ─────────────────────
-- dni: persona jurídica usa CUIT como identificador, no DNI.
ALTER TABLE public.clientes
  ALTER COLUMN dni DROP NOT NULL;

-- nombre y apellido: para jurídica quedan en blanco (se usa razon_social).
ALTER TABLE public.clientes
  ALTER COLUMN nombre DROP NOT NULL;

ALTER TABLE public.clientes
  ALTER COLUMN apellido DROP NOT NULL;

-- ── Actualizar constraints ────────────────────────────────────────────────────
-- Ajustar el check de dni para que sólo aplique a persona física.
ALTER TABLE public.clientes
  DROP CONSTRAINT IF EXISTS chk_dni_formato;

ALTER TABLE public.clientes
  ADD CONSTRAINT chk_dni_fisica CHECK (
    tipo_persona = 'juridica'
    OR (dni IS NOT NULL AND dni ~ '^\d{7,15}$')
  );

-- Razon social obligatoria para juridica.
ALTER TABLE public.clientes
  ADD CONSTRAINT chk_juridica_razon_social CHECK (
    tipo_persona = 'fisica'
    OR razon_social IS NOT NULL
  );

-- Nombre/apellido obligatorios sólo para física.
ALTER TABLE public.clientes
  ADD CONSTRAINT chk_fisica_nombre CHECK (
    tipo_persona = 'juridica'
    OR (nombre IS NOT NULL AND apellido IS NOT NULL)
  );

-- ── Índice para búsqueda de razón social ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clientes_razon_social_trgm
  ON public.clientes USING gin (razon_social gin_trgm_ops)
  WHERE razon_social IS NOT NULL;

COMMENT ON COLUMN public.clientes.tipo_persona    IS '''fisica'' o ''juridica''';
COMMENT ON COLUMN public.clientes.razon_social    IS 'Razón social — obligatoria para persona jurídica';
COMMENT ON COLUMN public.clientes.responsable_nombre IS 'Nombre del responsable/apoderado (persona jurídica)';
COMMENT ON COLUMN public.clientes.responsable_cargo  IS 'Cargo del responsable: apoderado, gerente, presidente…';

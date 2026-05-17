-- ============================================================
-- Migración 043: Permitir seleccionar fueros del SAE para polear.
--
-- Si la lista es no-vacía, esos fueros se iteran SIEMPRE (override).
-- Si la lista es vacía, el poller hace discovery automático leyendo
-- la página /casillero para detectar qué fueros tienen 🔔 (novedades)
-- y solo itera esos.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sae_fueros_seleccionados text[] NOT NULL DEFAULT ARRAY[]::text[];

COMMENT ON COLUMN public.profiles.sae_fueros_seleccionados IS
  'Lista de slugs de fueros del SAE Tucumán a polear. Si vacío, se usa discovery automático por bell icon de /casillero.';

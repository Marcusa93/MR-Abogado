-- ============================================================================
-- Marco Rossi Estudio Jurídico - Migración 013: Seguridad RLS y longitud DNI
--
-- Nota: 00004 ya define las policies con roles ADMIN/ABOGADO/COLABORADOR
-- en mayúsculas. Esta migración hace el DROP/CREATE de forma segura
-- para garantizar que no queden policies con roles en minúsculas
-- de migraciones anteriores.
-- La columna dni ya es varchar(15) en 00001, por lo que el ALTER es no-op.
-- ============================================================================

-- 1. Fix clientes INSERT policy — asegurar roles uppercase
DROP POLICY IF EXISTS clientes_insert ON public.clientes;
DROP POLICY IF EXISTS "clientes_insert" ON public.clientes;
CREATE POLICY "clientes_insert" ON public.clientes
  FOR INSERT
  WITH CHECK (current_user_role() = ANY (ARRAY['ADMIN','ABOGADO','COLABORADOR']));

-- 2. Fix expedientes INSERT policy — asegurar roles uppercase
DROP POLICY IF EXISTS expedientes_insert ON public.expedientes;
DROP POLICY IF EXISTS "expedientes_insert" ON public.expedientes;
CREATE POLICY "expedientes_insert" ON public.expedientes
  FOR INSERT
  WITH CHECK (current_user_role() = ANY (ARRAY['ADMIN','ABOGADO','COLABORADOR']));

-- 3. Asegurar DNI varchar(15) — no-op si ya está en 00001,
--    pero seguro de ejecutar de nuevo
ALTER TABLE public.clientes ALTER COLUMN dni TYPE varchar(15);

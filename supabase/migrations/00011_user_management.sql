-- ============================================================
-- Marco Rossi Estudio Jurídico - Migración 011: User Management & Login Audit
-- ============================================================

-- ------------------------------------------------------------
-- 1. Admin puede ver TODOS los profiles (incluidos inactivos)
--    La policy existente profiles_select_active filtra activo=true.
--    Postgres RLS usa OR entre policies, así que esta nueva
--    policy permite al admin ver todo sin afectar a los demás.
--    Nota: profiles_select_all_admin ya fue creada en 00004.
--    Usamos DROP IF EXISTS + CREATE para idempotencia.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_all_admin" ON public.profiles;
CREATE POLICY "profiles_select_all_admin"
  ON public.profiles
  FOR SELECT
  USING (public.is_admin());

-- ------------------------------------------------------------
-- 2. Admin puede insertar profiles (para crear usuarios)
--    Nota: profiles_insert_admin ya fue creada en 00004.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_insert_admin" ON public.profiles;
CREATE POLICY "profiles_insert_admin"
  ON public.profiles
  FOR INSERT
  WITH CHECK (public.is_admin());

-- ------------------------------------------------------------
-- 3. RPC log_login — registra inicio de sesión en audit_log
--    SECURITY DEFINER para poder escribir en audit_log
--    (los usuarios normales no tienen INSERT en audit_log)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_login()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log (tabla, registro_id, accion, datos_nuevos, user_id)
  VALUES (
    'auth',
    auth.uid(),
    'LOGIN',
    jsonb_build_object('timestamp', now(), 'method', 'password'),
    auth.uid()
  );
END;
$$;

-- Solo usuarios autenticados pueden llamar a log_login
REVOKE ALL ON FUNCTION public.log_login() FROM public;
GRANT EXECUTE ON FUNCTION public.log_login() TO authenticated;

-- ============================================================
-- Fix: la página /actividad daba "no funciona" porque el sidebar
-- la muestra a ADMIN y DIRECTOR, pero la RLS de audit_log solo deja
-- leer a is_admin() (que solo es true para rol='ADMIN').
--
-- Agregamos una policy adicional para que DIRECTOR también vea el log.
-- ============================================================

DROP POLICY IF EXISTS "audit_log_select_director" ON public.audit_log;

CREATE POLICY "audit_log_select_director"
  ON public.audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.rol = 'DIRECTOR'
    )
  );

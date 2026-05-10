-- ============================================================
-- Marco Rossi Estudio Jurídico - Migración 008: Correcciones de Seguridad
--
-- Fix 1: Race condition en generación de número de expediente
--        (ya aplicado directamente en 00005 con pg_advisory_xact_lock)
-- Fix 2: Inyección de rol via metadata en handle_new_user
--        (ya corregido en 00006 con rol hardcodeado a 'COLABORADOR')
-- Fix 5: audit_log.user_id — permite NULL para operaciones de sistema
-- Fix 8: SET search_path en TODAS las funciones SECURITY DEFINER
-- ============================================================

-- ============================================================
-- FIX 5: audit_log.user_id — permitir NULL para operaciones
-- de sistema (triggers en contexto de pg_cron / background)
-- ============================================================
ALTER TABLE public.audit_log ALTER COLUMN user_id DROP NOT NULL;

-- ============================================================
-- FIX 8: SET search_path en TODAS las funciones SECURITY DEFINER
-- Previene search_path hijacking (CWE-426)
-- ============================================================

-- Helpers RLS (migración 004)
ALTER FUNCTION public.current_user_role() SET search_path = public;
ALTER FUNCTION public.is_admin() SET search_path = public;

-- RPCs principales (migración 005)
ALTER FUNCTION public.create_expediente(uuid, uuid, uuid, text, text, boolean, text, jsonb) SET search_path = public;
ALTER FUNCTION public.cambiar_estado_expediente(uuid, text, text, text) SET search_path = public;
ALTER FUNCTION public.add_expediente_miembro(uuid, uuid, text, text) SET search_path = public;
ALTER FUNCTION public.remove_expediente_miembro(uuid, uuid, text) SET search_path = public;
ALTER FUNCTION public.sync_sae(uuid, text, text) SET search_path = public;
ALTER FUNCTION public.resolver_alerta(uuid, text) SET search_path = public;
ALTER FUNCTION public.posponer_alerta(uuid, date) SET search_path = public;
ALTER FUNCTION public.soft_delete_cliente(uuid) SET search_path = public;
ALTER FUNCTION public.bulk_insert_seguimientos(jsonb) SET search_path = public;
ALTER FUNCTION public.log_login() SET search_path = public;

-- Automatizaciones (migración 007)
ALTER FUNCTION public.auto_alertas_seguimiento_pendiente() SET search_path = public;
ALTER FUNCTION public.auto_alertas_audiencias_proximas() SET search_path = public;
ALTER FUNCTION public.auto_alertas_sin_responsable() SET search_path = public;
ALTER FUNCTION public.run_all_automations() SET search_path = public;

-- Triggers (migración 006)
ALTER FUNCTION public.handle_new_user() SET search_path = public, auth;
ALTER FUNCTION public.trigger_audit_expedientes() SET search_path = public;
ALTER FUNCTION public.trigger_audit_clientes() SET search_path = public;
ALTER FUNCTION public.fn_alert_on_estado_change() SET search_path = public;
ALTER FUNCTION public.notify_audiencia_created() SET search_path = public;

-- ============================================================
-- Índices adicionales para columnas usadas en RLS policies
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_exp_created_by
  ON public.expedientes(created_by);

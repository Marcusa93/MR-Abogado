-- Registro de actividad: más cobertura.
--
-- Antes: solo cambios de estado/prioridad/borrado de expedientes, DNI/CUIL/
-- borrado de clientes, logins y lo que registran algunas RPC.
-- Ahora, un trigger genérico (audit_row_change) registra en audit_log:
--   - INSERT / UPDATE / DELETE de tareas, audiencias, escritos, ingresos,
--     gastos, gastos_fijos, abonos (clientes_abono_mensual), presupuestos,
--     consultas, expediente_miembros, expediente_notas,
--     adjuntos, profiles (rol, activo y datos) y sae_credentials (sin la clave).
--   - Todo cambio de expedientes y clientes (reemplaza los triggers acotados).
--   - Soft delete (deleted_at pasa a tener valor) → accion DELETE.
-- Guarda solo las columnas que cambiaron (anterior / nuevo), recorta textos
-- largos y nunca guarda secretos. user_id NULL = acción del sistema (crons,
-- procurador). Respeta el skip token de las RPC que ya registran por su cuenta.
-- Además, registrar_acceso() anota quién abrió un expediente o un cliente
-- (accion VIEW), como mucho una vez cada 30 min por persona y registro.

-- ── Trigger genérico ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_skip_token text;
  v_old jsonb;
  v_new jsonb;
  v_antes jsonb := '{}'::jsonb;
  v_despues jsonb := '{}'::jsonb;
  v_accion text;
  v_id uuid;
  k text;
  -- Columnas que nunca se guardan
  v_secretas text[] := ARRAY['encrypted_secret', 'password', 'token', 'access_token', 'refresh_token', 'embedding'];
  -- Columnas que no cuentan como cambio
  v_ruido text[] := ARRAY['updated_at', 'created_at', 'last_reminder_at', 'notifications_last_seen_at', 'last_sync_at', 'ultima_sincronizacion_sae'];
  -- Contexto que se guarda siempre (para saber de qué expediente/cliente se trata)
  v_contexto text[] := ARRAY['expediente_id', 'cliente_id', 'consulta_id', 'titulo', 'caratula', 'nombre', 'apellido', 'descripcion', 'monto', 'moneda', 'fecha'];
BEGIN
  -- Las RPC que ya registran su propio evento marcan la transacción para no duplicar
  v_skip_token := current_setting('app.skip_audit_trigger', true);
  IF v_skip_token IS NOT NULL AND v_skip_token <> ''
     AND v_skip_token = 'mr_audit_skip_' || pg_backend_pid()::text || '_' || txid_current()::text THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_old := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  v_new := CASE WHEN TG_OP IN ('UPDATE', 'INSERT') THEN to_jsonb(NEW) ELSE '{}'::jsonb END;
  v_id := COALESCE((v_new->>'id')::uuid, (v_old->>'id')::uuid);

  IF TG_OP = 'INSERT' THEN
    v_accion := 'INSERT';
    FOR k IN SELECT jsonb_object_keys(v_new) LOOP
      CONTINUE WHEN k = ANY (v_secretas) OR k = ANY (v_ruido) OR v_new->k = 'null'::jsonb;
      v_despues := v_despues || jsonb_build_object(k, v_new->k);
    END LOOP;
  ELSIF TG_OP = 'DELETE' THEN
    v_accion := 'DELETE';
    FOR k IN SELECT unnest(v_contexto) LOOP
      IF v_old ? k AND v_old->k <> 'null'::jsonb THEN v_antes := v_antes || jsonb_build_object(k, v_old->k); END IF;
    END LOOP;
  ELSE
    FOR k IN SELECT jsonb_object_keys(v_new) LOOP
      CONTINUE WHEN k = ANY (v_secretas) OR k = ANY (v_ruido);
      IF v_old->k IS DISTINCT FROM v_new->k THEN
        v_antes := v_antes || jsonb_build_object(k, v_old->k);
        v_despues := v_despues || jsonb_build_object(k, v_new->k);
      END IF;
    END LOOP;
    -- Nada relevante cambió (solo updated_at, etc.)
    IF v_despues = '{}'::jsonb THEN RETURN NEW; END IF;
    v_accion := CASE
      WHEN v_new ? 'deleted_at' AND (v_old->>'deleted_at') IS NULL AND (v_new->>'deleted_at') IS NOT NULL THEN 'DELETE'
      ELSE 'UPDATE'
    END;
    -- Contexto para identificar el registro
    FOR k IN SELECT unnest(v_contexto) LOOP
      IF v_new ? k AND NOT v_despues ? k AND v_new->k <> 'null'::jsonb THEN
        v_antes := v_antes || jsonb_build_object('_' || k, v_new->k);
      END IF;
    END LOOP;
  END IF;

  -- Recortar textos largos (contenido de escritos, cuerpos, notas)
  SELECT COALESCE(jsonb_object_agg(key, CASE
           WHEN jsonb_typeof(value) = 'string' AND length(value #>> '{}') > 300 THEN to_jsonb(left(value #>> '{}', 300) || '…')
           WHEN jsonb_typeof(value) IN ('object', 'array') AND length(value::text) > 600 THEN to_jsonb('(dato extenso, ' || length(value::text) || ' caracteres)')
           ELSE value END), '{}'::jsonb)
    INTO v_antes FROM jsonb_each(v_antes);
  SELECT COALESCE(jsonb_object_agg(key, CASE
           WHEN jsonb_typeof(value) = 'string' AND length(value #>> '{}') > 300 THEN to_jsonb(left(value #>> '{}', 300) || '…')
           WHEN jsonb_typeof(value) IN ('object', 'array') AND length(value::text) > 600 THEN to_jsonb('(dato extenso, ' || length(value::text) || ' caracteres)')
           ELSE value END), '{}'::jsonb)
    INTO v_despues FROM jsonb_each(v_despues);

  INSERT INTO public.audit_log (tabla, registro_id, accion, datos_anteriores, datos_nuevos, user_id)
  VALUES (TG_TABLE_NAME, v_id, v_accion,
          NULLIF(v_antes, '{}'::jsonb), NULLIF(v_despues, '{}'::jsonb), auth.uid());

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  -- El registro de actividad nunca debe impedir la operación
  RAISE WARNING 'audit_row_change (%): %', TG_TABLE_NAME, SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── Tablas registradas ────────────────────────────────────────────────────────

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tareas', 'audiencias', 'escritos', 'ingresos', 'gastos', 'gastos_fijos', 'consultas',
    'expediente_miembros', 'expediente_notas', 'adjuntos', 'profiles', 'sae_credentials', 'clientes',
    'clientes_abono_mensual', 'presupuestos'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_row_change ON public.%I', t);
      EXECUTE format('CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON public.%I
                      FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()', t);
    END IF;
  END LOOP;
END $$;

-- Expedientes: el alta ya la registra la RPC create_expediente; acá todo cambio y borrado.
DROP TRIGGER IF EXISTS audit_expedientes_changes ON public.expedientes;
DROP TRIGGER IF EXISTS audit_row_change ON public.expedientes;
CREATE TRIGGER audit_row_change AFTER UPDATE OR DELETE ON public.expedientes
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- Clientes: el trigger genérico reemplaza al acotado (DNI/CUIL/borrado).
DROP TRIGGER IF EXISTS audit_clientes_changes ON public.clientes;

-- ── Quién abrió qué ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.registrar_acceso(p_tabla text, p_registro_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_tabla NOT IN ('expedientes', 'clientes') THEN RETURN; END IF;
  IF p_tabla = 'expedientes' AND NOT public.can_view_expediente(p_registro_id) THEN RETURN; END IF;
  -- Una vez cada 30 minutos por persona y registro
  IF EXISTS (
    SELECT 1 FROM public.audit_log
    WHERE accion = 'VIEW' AND tabla = p_tabla AND registro_id = p_registro_id
      AND user_id = auth.uid() AND created_at > now() - interval '30 minutes'
  ) THEN RETURN; END IF;
  INSERT INTO public.audit_log (tabla, registro_id, accion, user_id)
  VALUES (p_tabla, p_registro_id, 'VIEW', auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_acceso(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_acceso(text, uuid) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_audit_log_view_lookup
  ON public.audit_log (user_id, tabla, registro_id, created_at DESC) WHERE accion = 'VIEW';
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.audit_log (created_at DESC);

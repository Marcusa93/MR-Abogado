-- ============================================================
-- Marco Rossi Estudio Jurídico - Migración 006: Triggers
-- ============================================================

-- ============================================================
-- Trigger: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar a todas las tablas con updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.expedientes
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.audiencias
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tareas
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.expediente_document_checklist
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ============================================================
-- Trigger: auto-create profile on auth.users insert
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_full_name text;
  v_nombre text;
  v_apellido text;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'nombre_completo', NEW.email, 'Usuario');
  v_nombre := COALESCE(
    NEW.raw_user_meta_data->>'nombre',
    split_part(v_full_name, ' ', 1),
    split_part(NEW.email, '@', 1)
  );
  v_apellido := COALESCE(
    NEW.raw_user_meta_data->>'apellido',
    NULLIF(regexp_replace(trim(v_full_name), '^\S+\s*', ''), ''),
    ''
  );

  INSERT INTO public.profiles (
    id, email, nombre_completo, nombre, apellido, rol, must_change_password
  ) VALUES (
    NEW.id,
    NEW.email,
    trim(concat_ws(' ', NULLIF(v_nombre, ''), NULLIF(v_apellido, ''))),
    v_nombre,
    v_apellido,
    -- SEGURIDAD: rol hardcodeado al mínimo privilegio.
    -- Solo un admin puede promover el rol via profiles_update_admin policy.
    'COLABORADOR',
    false
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Trigger: auditar cambios críticos en expedientes
-- ============================================================
CREATE OR REPLACE FUNCTION public.trigger_audit_expedientes()
RETURNS TRIGGER AS $$
DECLARE
  v_skip_token text;
  v_expected text;
BEGIN
  -- Verificar el token de skip para evitar doble escritura en audit_log
  -- El token es generado por _audit_skip_token() dentro de funciones SECURITY DEFINER
  v_skip_token := current_setting('app.skip_audit_trigger', true);
  IF v_skip_token IS NOT NULL AND v_skip_token != '' THEN
    v_expected := 'mr_audit_skip_' || pg_backend_pid()::text || '_' || txid_current()::text;
    IF v_skip_token = v_expected THEN
      RETURN NEW;
    END IF;
    RAISE WARNING 'Invalid audit skip token detected';
  END IF;

  -- Solo auditar cambios en campos críticos
  IF OLD.estado_interno IS DISTINCT FROM NEW.estado_interno
    OR OLD.prioridad IS DISTINCT FROM NEW.prioridad
    OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
  THEN
    INSERT INTO public.audit_log (tabla, registro_id, accion, datos_anteriores, datos_nuevos, user_id)
    VALUES (
      'expedientes',
      NEW.id,
      'UPDATE',
      jsonb_build_object(
        'estado_interno', OLD.estado_interno,
        'prioridad', OLD.prioridad,
        'deleted_at', OLD.deleted_at
      ),
      jsonb_build_object(
        'estado_interno', NEW.estado_interno,
        'prioridad', NEW.prioridad,
        'deleted_at', NEW.deleted_at
      ),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER audit_expedientes_changes
  AFTER UPDATE ON public.expedientes
  FOR EACH ROW EXECUTE FUNCTION public.trigger_audit_expedientes();

-- ============================================================
-- Trigger: auditar cambios en clientes
-- ============================================================
CREATE OR REPLACE FUNCTION public.trigger_audit_clientes()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.dni IS DISTINCT FROM NEW.dni
    OR OLD.cuil IS DISTINCT FROM NEW.cuil
    OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
  THEN
    INSERT INTO public.audit_log (tabla, registro_id, accion, datos_anteriores, datos_nuevos, user_id)
    VALUES (
      'clientes',
      NEW.id,
      'UPDATE',
      jsonb_build_object('dni', OLD.dni, 'cuil', OLD.cuil, 'deleted_at', OLD.deleted_at),
      jsonb_build_object('dni', NEW.dni, 'cuil', NEW.cuil, 'deleted_at', NEW.deleted_at),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER audit_clientes_changes
  AFTER UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.trigger_audit_clientes();

-- ============================================================
-- Trigger: auto-completar tarea (set completada_at)
-- ============================================================
CREATE OR REPLACE FUNCTION public.trigger_tarea_completada()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado = 'COMPLETADA' AND OLD.estado != 'COMPLETADA' THEN
    NEW.completada_at = now();
    NEW.completada_por = auth.uid();
  END IF;
  IF NEW.estado != 'COMPLETADA' AND OLD.estado = 'COMPLETADA' THEN
    NEW.completada_at = NULL;
    NEW.completada_por = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tarea_completada
  BEFORE UPDATE ON public.tareas
  FOR EACH ROW EXECUTE FUNCTION public.trigger_tarea_completada();

-- ============================================================
-- Trigger: alerta automática en cambio de estado del expediente
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_alert_on_estado_change()
RETURNS TRIGGER AS $$
DECLARE
  v_dest uuid;
  v_label_nuevo text;
  v_identificador text;
BEGIN
  IF OLD.estado_interno IS DISTINCT FROM NEW.estado_interno THEN
    -- Obtener primer miembro abogado como destinatario
    SELECT profile_id INTO v_dest
    FROM public.expediente_miembros
    WHERE expediente_id = NEW.id AND rol = 'abogado' AND activo = true
    LIMIT 1;

    v_dest := COALESCE(v_dest, NEW.created_by);
    v_identificador := COALESCE(NULLIF(NEW.numero, ''), 'Expediente');

    v_label_nuevo := CASE NEW.estado_interno
      WHEN 'NUEVA_CONSULTA'    THEN 'Nueva consulta'
      WHEN 'PARA_INICIAR'      THEN 'Para iniciar'
      WHEN 'INICIADO'          THEN 'Iniciado'
      WHEN 'PRUEBA'            THEN 'Etapa de prueba'
      WHEN 'ALEGATOS'          THEN 'Alegatos'
      WHEN 'SENTENCIA'         THEN 'Sentencia'
      WHEN 'APELACION'         THEN 'Apelación'
      WHEN 'CORTE'             THEN 'Corte'
      WHEN 'FINALIZADO'        THEN 'Finalizado'
      WHEN 'NO_VIABLE_RECHAZADO' THEN 'No viable / rechazado'
      WHEN 'PAUSADO'           THEN 'Pausado'
      ELSE NEW.estado_interno
    END;

    INSERT INTO public.alertas (
      expediente_id, tipo, titulo, mensaje, destinatario_id,
      prioridad, estado, origen
    ) VALUES (
      NEW.id,
      'ESTADO_CAMBIO',
      'Estado actualizado: ' || v_identificador,
      'El expediente pasó a "' || v_label_nuevo || '"',
      v_dest,
      CASE
        WHEN NEW.estado_interno IN ('FINALIZADO', 'NO_VIABLE_RECHAZADO', 'SENTENCIA') THEN 'ALTA'
        ELSE 'MEDIA'
      END,
      'ACTIVA',
      'AUTOMATICA'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER alert_on_estado_change
  AFTER UPDATE ON public.expedientes
  FOR EACH ROW EXECUTE FUNCTION public.fn_alert_on_estado_change();

-- ============================================================
-- Trigger: alerta automática en creación de audiencia
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_audiencia_created()
RETURNS TRIGGER AS $$
DECLARE
  v_exp_record RECORD;
  v_cliente_nombre text;
  v_dias int;
  v_prio text;
  v_dest uuid;
BEGIN
  SELECT e.numero, e.created_by,
         c.apellido || ' ' || c.nombre AS cli_nombre
  INTO v_exp_record
  FROM public.expedientes e
  LEFT JOIN public.clientes c ON c.id = e.cliente_id
  WHERE e.id = NEW.expediente_id;

  v_cliente_nombre := COALESCE(v_exp_record.cli_nombre, v_exp_record.numero, 'Expediente');
  v_dias := (NEW.fecha - CURRENT_DATE);

  IF v_dias <= 1 THEN v_prio := 'URGENTE';
  ELSIF v_dias <= 3 THEN v_prio := 'ALTA';
  ELSIF v_dias <= 5 THEN v_prio := 'MEDIA';
  ELSE v_prio := 'BAJA';
  END IF;

  -- Destinatario: profesional asistente o primer miembro abogado
  v_dest := NEW.profesional_asistente_id;
  IF v_dest IS NULL THEN
    SELECT profile_id INTO v_dest
    FROM public.expediente_miembros
    WHERE expediente_id = NEW.expediente_id AND rol = 'abogado' AND activo = true
    LIMIT 1;
  END IF;
  v_dest := COALESCE(v_dest, v_exp_record.created_by);

  INSERT INTO public.alertas (
    expediente_id, tipo, titulo, mensaje,
    destinatario_id, prioridad, estado, origen,
    fecha_vencimiento
  ) VALUES (
    NEW.expediente_id, 'AUDIENCIA_PROXIMA',
    'Nueva audiencia: ' || v_cliente_nombre,
    'Audiencia programada para el ' || to_char(NEW.fecha, 'DD/MM/YYYY')
      || COALESCE(' a las ' || NEW.hora::text, ''),
    v_dest, v_prio, 'ACTIVA', 'AUTOMATICA', NEW.fecha
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER notify_audiencia_created
  AFTER INSERT ON public.audiencias
  FOR EACH ROW EXECUTE FUNCTION public.notify_audiencia_created();

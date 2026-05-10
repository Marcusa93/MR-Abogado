-- ============================================================================
-- Marco Rossi Estudio Jurídico - Migración 015: Runtime alignment y compatibilidad
-- Normaliza roles, profiles, alertas, tareas, seguimientos y estados legacy
-- para que la app y la DB usen el mismo contrato.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles: agregar columnas faltantes y normalizar roles a ADMIN / ABOGADO / COLABORADOR
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nombre text,
  ADD COLUMN IF NOT EXISTS apellido text,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

UPDATE public.profiles
SET
  nombre = COALESCE(
    NULLIF(nombre, ''),
    NULLIF(split_part(trim(nombre_completo), ' ', 1), ''),
    split_part(email, '@', 1)
  ),
  apellido = COALESCE(
    NULLIF(apellido, ''),
    NULLIF(
      regexp_replace(trim(nombre_completo), '^\S+\s*', ''),
      ''
    ),
    ''
  ),
  rol = CASE
    WHEN upper(coalesce(rol, '')) = 'ADMIN'  OR lower(coalesce(rol, '')) = 'admin'  THEN 'ADMIN'
    WHEN upper(coalesce(rol, '')) = 'ABOGADO' OR lower(coalesce(rol, '')) = 'abogado' THEN 'ABOGADO'
    ELSE 'COLABORADOR'
  END;

ALTER TABLE public.profiles
  ALTER COLUMN nombre SET DEFAULT '',
  ALTER COLUMN apellido SET DEFAULT '',
  ALTER COLUMN rol SET DEFAULT 'COLABORADOR';

UPDATE public.profiles
SET
  nombre = COALESCE(NULLIF(nombre, ''), split_part(email, '@', 1)),
  apellido = COALESCE(apellido, '');

ALTER TABLE public.profiles
  ALTER COLUMN nombre SET NOT NULL,
  ALTER COLUMN apellido SET NOT NULL;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_rol_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_rol_check
  CHECK (rol IN ('ADMIN', 'ABOGADO', 'COLABORADOR'));

CREATE OR REPLACE FUNCTION public.normalize_profile_before_write()
RETURNS trigger AS $$
BEGIN
  NEW.rol := CASE
    WHEN upper(coalesce(NEW.rol, '')) = 'ADMIN'   THEN 'ADMIN'
    WHEN upper(coalesce(NEW.rol, '')) = 'ABOGADO'  THEN 'ABOGADO'
    ELSE 'COLABORADOR'
  END;

  NEW.nombre := COALESCE(NULLIF(NEW.nombre, ''), split_part(COALESCE(NEW.nombre_completo, NEW.email, ''), ' ', 1), '');
  NEW.apellido := COALESCE(
    NEW.apellido,
    NULLIF(regexp_replace(trim(COALESCE(NEW.nombre_completo, '')), '^\S+\s*', ''), ''),
    ''
  );
  NEW.nombre_completo := trim(concat_ws(' ', NULLIF(NEW.nombre, ''), NULLIF(NEW.apellido, '')));

  IF NEW.nombre_completo IS NULL OR NEW.nombre_completo = '' THEN
    NEW.nombre_completo := COALESCE(NEW.email, 'Usuario');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS normalize_profile_before_write ON public.profiles;
CREATE TRIGGER normalize_profile_before_write
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.normalize_profile_before_write();

-- Actualizar current_user_role e is_admin para devolver valores uppercase
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text AS $$
  SELECT rol FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT public.current_user_role() = 'ADMIN'
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_full_name text;
  v_nombre text;
  v_apellido text;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'nombre_completo', NEW.email, 'Usuario');
  v_nombre := COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(v_full_name, ' ', 1), split_part(NEW.email, '@', 1));
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
    'COLABORADOR',
    false
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- Recrear policies con roles uppercase correctos
DROP POLICY IF EXISTS clientes_insert ON public.clientes;
DROP POLICY IF EXISTS "clientes_insert" ON public.clientes;
CREATE POLICY "clientes_insert" ON public.clientes
  FOR INSERT
  WITH CHECK (public.current_user_role() IN ('ADMIN', 'ABOGADO', 'COLABORADOR'));

DROP POLICY IF EXISTS expedientes_insert ON public.expedientes;
DROP POLICY IF EXISTS "expedientes_insert" ON public.expedientes;
CREATE POLICY "expedientes_insert" ON public.expedientes
  FOR INSERT
  WITH CHECK (public.current_user_role() IN ('ADMIN', 'ABOGADO', 'COLABORADOR'));

-- ---------------------------------------------------------------------------
-- tareas: asegurar valores uppercase canónicos
-- ---------------------------------------------------------------------------
UPDATE public.tareas
SET
  prioridad = upper(prioridad),
  estado = CASE estado
    WHEN 'en_progreso' THEN 'EN_PROGRESO'
    WHEN 'completada'  THEN 'COMPLETADA'
    WHEN 'cancelada'   THEN 'CANCELADA'
    ELSE upper(estado)
  END;

ALTER TABLE public.tareas
  ALTER COLUMN prioridad SET DEFAULT 'MEDIA',
  ALTER COLUMN estado SET DEFAULT 'PENDIENTE';

CREATE OR REPLACE FUNCTION public.normalize_tarea_fields()
RETURNS trigger AS $$
BEGIN
  NEW.prioridad := upper(coalesce(NEW.prioridad, 'MEDIA'));
  NEW.estado := CASE lower(coalesce(NEW.estado, 'pendiente'))
    WHEN 'en_progreso' THEN 'EN_PROGRESO'
    WHEN 'completada'  THEN 'COMPLETADA'
    WHEN 'cancelada'   THEN 'CANCELADA'
    ELSE upper(coalesce(NEW.estado, 'PENDIENTE'))
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS normalize_tarea_fields ON public.tareas;
CREATE TRIGGER normalize_tarea_fields
  BEFORE INSERT OR UPDATE ON public.tareas
  FOR EACH ROW EXECUTE FUNCTION public.normalize_tarea_fields();

ALTER TABLE public.tareas DROP CONSTRAINT IF EXISTS tareas_prioridad_check;
ALTER TABLE public.tareas ADD CONSTRAINT tareas_prioridad_check
  CHECK (prioridad IN ('BAJA', 'MEDIA', 'ALTA', 'URGENTE'));

ALTER TABLE public.tareas DROP CONSTRAINT IF EXISTS tareas_estado_check;
ALTER TABLE public.tareas ADD CONSTRAINT tareas_estado_check
  CHECK (estado IN ('PENDIENTE', 'EN_PROGRESO', 'COMPLETADA', 'CANCELADA'));

-- ---------------------------------------------------------------------------
-- seguimientos: normalizar canal a uppercase
-- ---------------------------------------------------------------------------
UPDATE public.seguimientos
SET canal = CASE lower(canal)
  WHEN 'telefono'   THEN 'telefono'
  WHEN 'presencial' THEN 'presencial'
  WHEN 'email'      THEN 'email'
  ELSE 'web'
END
WHERE canal IS NOT NULL;

CREATE OR REPLACE FUNCTION public.normalize_seguimiento_fields()
RETURNS trigger AS $$
BEGIN
  NEW.canal := lower(coalesce(NEW.canal, 'web'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS normalize_seguimiento_fields ON public.seguimientos;
CREATE TRIGGER normalize_seguimiento_fields
  BEFORE INSERT OR UPDATE ON public.seguimientos
  FOR EACH ROW EXECUTE FUNCTION public.normalize_seguimiento_fields();

-- ---------------------------------------------------------------------------
-- alertas: asegurar valores uppercase canónicos
-- ---------------------------------------------------------------------------
UPDATE public.alertas
SET
  tipo = CASE lower(tipo)
    WHEN 'seguimiento_pendiente' THEN 'SEGUIMIENTO_PENDIENTE'
    WHEN 'audiencia_proxima'     THEN 'AUDIENCIA_PROXIMA'
    WHEN 'tarea_vencida'         THEN 'TAREA_VENCIDA'
    WHEN 'sin_responsable'       THEN 'SIN_RESPONSABLE'
    WHEN 'documento_faltante'    THEN 'DOCUMENTO_FALTANTE'
    WHEN 'estado_cambio'         THEN 'ESTADO_CAMBIO'
    WHEN 'sistema'               THEN 'SISTEMA'
    WHEN 'mencion'               THEN 'MENCION'
    WHEN 'custom'                THEN 'CUSTOM'
    ELSE upper(tipo)
  END,
  prioridad = upper(prioridad),
  estado = upper(estado),
  origen = upper(origen);

CREATE OR REPLACE FUNCTION public.normalize_alerta_fields()
RETURNS trigger AS $$
BEGIN
  NEW.tipo := CASE lower(coalesce(NEW.tipo, 'sistema'))
    WHEN 'seguimiento_pendiente' THEN 'SEGUIMIENTO_PENDIENTE'
    WHEN 'audiencia_proxima'     THEN 'AUDIENCIA_PROXIMA'
    WHEN 'tarea_vencida'         THEN 'TAREA_VENCIDA'
    WHEN 'sin_responsable'       THEN 'SIN_RESPONSABLE'
    WHEN 'documento_faltante'    THEN 'DOCUMENTO_FALTANTE'
    WHEN 'estado_cambio'         THEN 'ESTADO_CAMBIO'
    WHEN 'sistema'               THEN 'SISTEMA'
    WHEN 'mencion'               THEN 'MENCION'
    WHEN 'custom'                THEN 'CUSTOM'
    ELSE upper(coalesce(NEW.tipo, 'SISTEMA'))
  END;
  NEW.prioridad := upper(coalesce(NEW.prioridad, 'MEDIA'));
  NEW.estado    := upper(coalesce(NEW.estado, 'ACTIVA'));
  NEW.origen    := upper(coalesce(NEW.origen, 'AUTOMATICA'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS normalize_alerta_fields ON public.alertas;
CREATE TRIGGER normalize_alerta_fields
  BEFORE INSERT OR UPDATE ON public.alertas
  FOR EACH ROW EXECUTE FUNCTION public.normalize_alerta_fields();

ALTER TABLE public.alertas DROP CONSTRAINT IF EXISTS alertas_tipo_check;
ALTER TABLE public.alertas ADD CONSTRAINT alertas_tipo_check
  CHECK (tipo IN (
    'SEGUIMIENTO_PENDIENTE',
    'AUDIENCIA_PROXIMA',
    'TAREA_VENCIDA',
    'SIN_RESPONSABLE',
    'DOCUMENTO_FALTANTE',
    'ESTADO_CAMBIO',
    'SISTEMA',
    'MENCION',
    'CUSTOM'
  ));

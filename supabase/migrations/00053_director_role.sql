-- ============================================================
-- Migración 053: rol DIRECTOR + abogado responsable por expediente
--
-- Modelo:
--   - DIRECTOR (Marco): ve todo el estudio
--   - ABOGADO: ve sus expedientes (responsable o creador), más donde
--     sea miembro (para tareas/notas compartidas)
--   - COLABORADOR: ve solo donde es miembro (igual que antes)
--
-- Cada expediente tiene `abogado_responsable_id`: el abogado dueño de
-- la cartera dentro del estudio. Distinto de created_by (el director
-- puede crear un expediente en nombre de un abogado).
-- ============================================================

-- 1) Columna nueva
ALTER TABLE public.expedientes
  ADD COLUMN IF NOT EXISTS abogado_responsable_id uuid REFERENCES public.profiles(id);

COMMENT ON COLUMN public.expedientes.abogado_responsable_id IS
  'Abogado del estudio que lleva la cartera de este expediente. NULL = sin asignar (lo ve solo el director).';

CREATE INDEX IF NOT EXISTS expedientes_responsable_idx
  ON public.expedientes(abogado_responsable_id) WHERE deleted_at IS NULL;

-- 2) Backfill: el creador queda como responsable inicial
UPDATE public.expedientes
SET abogado_responsable_id = created_by
WHERE abogado_responsable_id IS NULL;

-- 3) CHECK constraint actualizado para aceptar DIRECTOR
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_rol_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_rol_check
  CHECK (rol IN ('DIRECTOR', 'ADMIN', 'ABOGADO', 'COLABORADOR'));

-- 4) Trigger normalize_profile_before_write: agregar caso DIRECTOR
CREATE OR REPLACE FUNCTION public.normalize_profile_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.rol := CASE
    WHEN upper(coalesce(NEW.rol, '')) = 'DIRECTOR'    THEN 'DIRECTOR'
    WHEN upper(coalesce(NEW.rol, '')) = 'ADMIN'       THEN 'ADMIN'
    WHEN upper(coalesce(NEW.rol, '')) = 'ABOGADO'     THEN 'ABOGADO'
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
$function$;

-- 5) Asignar roles iniciales: Marco = DIRECTOR, Facundo = ABOGADO
UPDATE public.profiles SET rol = 'DIRECTOR' WHERE id = 'ceb22752-726c-4377-8f40-2bdccc8c8bbb';
UPDATE public.profiles SET rol = 'ABOGADO'  WHERE id = '166e1402-107f-4ec6-934a-7bc0b7ff7b65';

-- 6) Helpers SQL
CREATE OR REPLACE FUNCTION public.is_director()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.current_user_role() = 'DIRECTOR'
$$;

CREATE OR REPLACE FUNCTION public.is_abogado()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.current_user_role() = 'ABOGADO'
$$;

-- is_admin() ahora incluye DIRECTOR para compatibilidad con RLS existentes
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.current_user_role() IN ('ADMIN', 'DIRECTOR')
$$;

-- 7) Helper para chequear si el current user puede ver un expediente
CREATE OR REPLACE FUNCTION public.can_view_expediente(p_expediente_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.is_director()
    OR EXISTS (
      SELECT 1 FROM public.expedientes e
      WHERE e.id = p_expediente_id
        AND (e.abogado_responsable_id = auth.uid() OR e.created_by = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.expediente_miembros m
      WHERE m.expediente_id = p_expediente_id
        AND m.profile_id = auth.uid()
    )
$$;

COMMENT ON FUNCTION public.can_view_expediente IS
  'TRUE si el current user puede ver el expediente: director, responsable, creador o miembro.';

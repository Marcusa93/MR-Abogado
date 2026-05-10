-- ============================================================
-- Marco Rossi Estudio Jurídico - Migración 001: Tablas Base
-- profiles, clientes, tipos_tramite, organismos,
-- catalogo_tipos_tarea, catalogo_tipos_audiencia
-- ============================================================

-- ============================================================
-- T1: profiles (usuarios internos, 1:1 con auth.users)
-- ============================================================
CREATE TABLE public.profiles (
  id                    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 text NOT NULL UNIQUE,
  nombre_completo       text NOT NULL,
  nombre                text,
  apellido              text,
  rol                   text NOT NULL DEFAULT 'COLABORADOR'
                        CHECK (rol IN ('ADMIN', 'ABOGADO', 'COLABORADOR')),
  telefono              text,
  avatar_url            text,
  activo                boolean NOT NULL DEFAULT true,
  must_change_password  boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_rol ON public.profiles(rol);
CREATE INDEX idx_profiles_activo ON public.profiles(activo);

COMMENT ON TABLE public.profiles IS 'Usuarios internos del estudio jurídico';
COMMENT ON COLUMN public.profiles.rol IS 'ADMIN = administrador, ABOGADO = letrado matriculado, COLABORADOR = no letrado';

-- ============================================================
-- T2: tipos_tramite (catálogo de tipos de expediente/proceso)
-- ============================================================
CREATE TABLE public.tipos_tramite (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo         text NOT NULL UNIQUE,
  nombre         text NOT NULL,
  descripcion    text,
  requiere_turno boolean NOT NULL DEFAULT true,
  activo         boolean NOT NULL DEFAULT true,
  orden          integer NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.tipos_tramite IS 'Catálogo configurable de tipos de proceso/trámite jurídico';

-- ============================================================
-- T3: organismos (juzgados, cámaras, organismos administrativos)
-- ============================================================
CREATE TABLE public.organismos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       text NOT NULL,
  tipo         text NOT NULL DEFAULT 'otro'
               CHECK (tipo IN (
                 'juzgado', 'camara', 'tribunal', 'ministerio',
                 'organismo_administrativo', 'otro'
               )),
  jurisdiccion text,
  domicilio    text,
  localidad    text,
  provincia    text,
  telefono     text,
  activo       boolean NOT NULL DEFAULT true
);

CREATE INDEX idx_organismos_tipo ON public.organismos(tipo);
CREATE INDEX idx_organismos_activo ON public.organismos(activo);

COMMENT ON TABLE public.organismos IS 'Catálogo de juzgados, cámaras y organismos externos vinculados a expedientes';

-- ============================================================
-- T4: catalogo_tipos_tarea
-- ============================================================
CREATE TABLE public.catalogo_tipos_tarea (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL,
  descripcion text,
  activo      boolean NOT NULL DEFAULT true
);

COMMENT ON TABLE public.catalogo_tipos_tarea IS 'Catálogo de tipos de tarea interna recurrentes';

-- ============================================================
-- T5: catalogo_tipos_audiencia
-- ============================================================
CREATE TABLE public.catalogo_tipos_audiencia (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo      text NOT NULL UNIQUE,
  nombre      text NOT NULL,
  descripcion text,
  activo      boolean NOT NULL DEFAULT true,
  orden       integer NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.catalogo_tipos_audiencia IS 'Catálogo configurable de tipos de audiencia por área procesal';

-- ============================================================
-- T6: clientes (personas físicas o jurídicas)
-- ============================================================
CREATE TABLE public.clientes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apellido         text NOT NULL,
  nombre           text NOT NULL,
  dni              varchar(15) NOT NULL
                   CONSTRAINT chk_dni_formato CHECK (dni ~ '^\d{7,15}$'),
  cuil             varchar(13)
                   CONSTRAINT chk_cuil_formato CHECK (cuil IS NULL OR cuil ~ '^\d{2}-\d{8}-\d{1}$'),
  telefono         text,
  telefono_alt     text,
  email            text,
  domicilio        text,
  localidad        text,
  provincia        text DEFAULT 'Buenos Aires',
  fecha_nacimiento date,
  sexo             text
                   CONSTRAINT chk_sexo CHECK (sexo IS NULL OR sexo IN ('M', 'F')),
  notas            text,
  origen           text
                   CONSTRAINT chk_origen CHECK (origen IS NULL OR origen IN (
                     'referido', 'web', 'telefono', 'presencial', 'otro'
                   )),
  created_by       uuid NOT NULL REFERENCES public.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

CREATE UNIQUE INDEX idx_clientes_dni_active
  ON public.clientes (dni)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_clientes_cuil_active
  ON public.clientes (cuil)
  WHERE deleted_at IS NULL AND cuil IS NOT NULL;

CREATE INDEX idx_clientes_apellido_nombre ON public.clientes(apellido, nombre);
CREATE INDEX idx_clientes_fecha_nacimiento ON public.clientes(fecha_nacimiento) WHERE fecha_nacimiento IS NOT NULL;
CREATE INDEX idx_clientes_deleted_at ON public.clientes(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_clientes_nombre_trgm ON public.clientes USING gin ((apellido || ' ' || nombre) gin_trgm_ops);
CREATE INDEX idx_clientes_dni_trgm ON public.clientes USING gin (dni gin_trgm_ops);

COMMENT ON TABLE public.clientes IS 'Personas físicas o jurídicas que tienen expedientes en el estudio';
COMMENT ON COLUMN public.clientes.cuil IS 'CUIL opcional — útil en trámites previsionales o laborales';

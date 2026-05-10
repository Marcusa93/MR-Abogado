-- ============================================================
-- Marco Rossi Estudio Jurídico - Migración 002: Tablas Core
-- expedientes, expediente_miembros, historial_estados,
-- audiencias, seguimientos, tareas
-- ============================================================

-- ============================================================
-- T7: expedientes (ENTIDAD CENTRAL del sistema)
-- ============================================================
CREATE TABLE public.expedientes (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero                    text NOT NULL UNIQUE,
  cliente_id                uuid NOT NULL REFERENCES public.clientes(id),
  tipo_tramite_id           uuid NOT NULL REFERENCES public.tipos_tramite(id),
  organismo_id              uuid REFERENCES public.organismos(id),
  fuero                     text
                            CHECK (fuero IS NULL OR fuero IN (
                              'civil', 'laboral', 'penal', 'familia',
                              'administrativo', 'comercial', 'previsional', 'otro'
                            )),
  estado_interno            text NOT NULL DEFAULT 'NUEVA_CONSULTA'
                            CHECK (estado_interno IN (
                              'NUEVA_CONSULTA',
                              'PARA_INICIAR',
                              'INICIADO',
                              'PRUEBA',
                              'ALEGATOS',
                              'SENTENCIA',
                              'APELACION',
                              'CORTE',
                              'FINALIZADO',
                              'NO_VIABLE_RECHAZADO',
                              'PAUSADO'
                            )),
  estado_organismo          text,
  estado_previo_pausa       text,
  -- SAE integration
  numero_sae                text,
  estado_sae                text,
  ultima_sincronizacion_sae timestamptz,
  -- Metadatos
  prioridad                 text NOT NULL DEFAULT 'MEDIA'
                            CHECK (prioridad IN ('BAJA', 'MEDIA', 'ALTA', 'URGENTE')),
  es_propio                 boolean NOT NULL DEFAULT true,
  fecha_alta                date NOT NULL DEFAULT CURRENT_DATE,
  fecha_inicio_proceso      date,
  fecha_resolucion          date,
  fecha_cierre              date,
  observaciones             text,
  analisis_viabilidad       text,
  viable                    boolean,
  created_by                uuid NOT NULL REFERENCES public.profiles(id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  deleted_at                timestamptz
);

CREATE INDEX idx_exp_cliente_id ON public.expedientes(cliente_id);
CREATE INDEX idx_exp_estado_interno ON public.expedientes(estado_interno);
CREATE INDEX idx_exp_estado_organismo ON public.expedientes(estado_organismo) WHERE estado_organismo IS NOT NULL;
CREATE INDEX idx_exp_tipo_tramite ON public.expedientes(tipo_tramite_id);
CREATE INDEX idx_exp_organismo_id ON public.expedientes(organismo_id) WHERE organismo_id IS NOT NULL;
CREATE INDEX idx_exp_fuero ON public.expedientes(fuero) WHERE fuero IS NOT NULL;
CREATE INDEX idx_exp_prioridad ON public.expedientes(prioridad);
CREATE INDEX idx_exp_fecha_alta ON public.expedientes(fecha_alta);
CREATE INDEX idx_exp_deleted_at ON public.expedientes(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_exp_estado_deleted ON public.expedientes(estado_interno, deleted_at);
CREATE INDEX idx_exp_numero ON public.expedientes(numero);
CREATE INDEX idx_exp_numero_sae ON public.expedientes(numero_sae) WHERE numero_sae IS NOT NULL;

COMMENT ON TABLE public.expedientes IS 'Expediente/caso jurídico — entidad central del sistema';
COMMENT ON COLUMN public.expedientes.estado_interno IS 'Estado del workflow judicial interno del estudio';
COMMENT ON COLUMN public.expedientes.estado_organismo IS 'Último estado reportado por el organismo externo (libre)';
COMMENT ON COLUMN public.expedientes.estado_previo_pausa IS 'Estado guardado antes de pausar, para restaurar al reactivar';
COMMENT ON COLUMN public.expedientes.numero_sae IS 'Número en el SAE (Sistema de Administración de Expedientes)';
COMMENT ON COLUMN public.expedientes.es_propio IS 'true = caso propio del estudio, false = derivado de otro estudio';

-- ============================================================
-- T8: expediente_miembros (equipo asignado a un expediente)
-- ============================================================
CREATE TABLE public.expediente_miembros (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  profile_id    uuid NOT NULL REFERENCES public.profiles(id),
  rol           text NOT NULL DEFAULT 'colaborador'
                CHECK (rol IN ('abogado', 'colaborador')),
  activo        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (expediente_id, profile_id)
);

CREATE INDEX idx_miembros_exp_id ON public.expediente_miembros(expediente_id);
CREATE INDEX idx_miembros_profile_id ON public.expediente_miembros(profile_id);
CREATE INDEX idx_miembros_rol ON public.expediente_miembros(rol);

COMMENT ON TABLE public.expediente_miembros IS 'Equipo asignado a cada expediente con rol funcional (abogado / colaborador)';

-- ============================================================
-- T9: historial_estados_expediente
-- ============================================================
CREATE TABLE public.historial_estados_expediente (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id   uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  estado_anterior text,
  estado_nuevo    text NOT NULL,
  motivo          text NOT NULL,
  observacion     text,
  changed_by      uuid NOT NULL REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_historial_exp_id ON public.historial_estados_expediente(expediente_id);
CREATE INDEX idx_historial_created_at ON public.historial_estados_expediente(created_at);

COMMENT ON TABLE public.historial_estados_expediente IS 'Historial de cambios de estado del expediente con trazabilidad completa';

-- ============================================================
-- T10: audiencias
-- ============================================================
CREATE TABLE public.audiencias (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id            uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  tipo_audiencia_id        uuid REFERENCES public.catalogo_tipos_audiencia(id),
  organismo_id             uuid REFERENCES public.organismos(id),
  profesional_asistente_id uuid REFERENCES public.profiles(id),
  fecha                    date NOT NULL,
  hora                     time,
  estado                   text NOT NULL DEFAULT 'PENDIENTE'
                           CHECK (estado IN (
                             'PENDIENTE', 'CONFIRMADA', 'REALIZADA',
                             'CANCELADA', 'POSTERGADA'
                           )),
  resultado                text,
  notas                    text,
  created_by               uuid NOT NULL REFERENCES public.profiles(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audiencias_exp_id ON public.audiencias(expediente_id);
CREATE INDEX idx_audiencias_fecha ON public.audiencias(fecha);
CREATE INDEX idx_audiencias_estado ON public.audiencias(estado);
CREATE INDEX idx_audiencias_tipo ON public.audiencias(tipo_audiencia_id) WHERE tipo_audiencia_id IS NOT NULL;

COMMENT ON TABLE public.audiencias IS 'Audiencias judiciales y citaciones programadas por expediente';

-- ============================================================
-- T11: seguimientos (control de estado ante organismos)
-- ============================================================
CREATE TABLE public.seguimientos (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id              uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  fecha_control              date NOT NULL DEFAULT CURRENT_DATE,
  estado_organismo_reportado text NOT NULL,
  canal                      text NOT NULL DEFAULT 'web'
                             CHECK (canal IN ('web', 'telefono', 'presencial', 'email')),
  observacion                text,
  proxima_fecha_control      date,
  requiere_accion            boolean NOT NULL DEFAULT false,
  accion_requerida           text,
  created_by                 uuid NOT NULL REFERENCES public.profiles(id),
  created_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_seguimientos_exp_id ON public.seguimientos(expediente_id);
CREATE INDEX idx_seguimientos_fecha_control ON public.seguimientos(fecha_control);

COMMENT ON TABLE public.seguimientos IS 'Control periódico del estado del expediente ante el organismo externo';

-- ============================================================
-- T12: tareas
-- ============================================================
CREATE TABLE public.tareas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id     uuid REFERENCES public.expedientes(id) ON DELETE SET NULL,
  tipo_tarea_id     uuid REFERENCES public.catalogo_tipos_tarea(id),
  titulo            text NOT NULL,
  descripcion       text,
  asignado_a        uuid NOT NULL REFERENCES public.profiles(id),
  fecha_vencimiento date,
  prioridad         text NOT NULL DEFAULT 'MEDIA'
                    CHECK (prioridad IN ('BAJA', 'MEDIA', 'ALTA', 'URGENTE')),
  estado            text NOT NULL DEFAULT 'PENDIENTE'
                    CHECK (estado IN ('PENDIENTE', 'EN_PROGRESO', 'COMPLETADA', 'CANCELADA')),
  completada_at     timestamptz,
  completada_por    uuid REFERENCES public.profiles(id),
  created_by        uuid NOT NULL REFERENCES public.profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tareas_exp_id ON public.tareas(expediente_id) WHERE expediente_id IS NOT NULL;
CREATE INDEX idx_tareas_asignado ON public.tareas(asignado_a);
CREATE INDEX idx_tareas_estado ON public.tareas(estado);
CREATE INDEX idx_tareas_vencimiento ON public.tareas(fecha_vencimiento) WHERE fecha_vencimiento IS NOT NULL;
CREATE INDEX idx_tareas_estado_vencimiento ON public.tareas(estado, fecha_vencimiento)
  WHERE estado IN ('PENDIENTE', 'EN_PROGRESO') AND fecha_vencimiento IS NOT NULL;

COMMENT ON TABLE public.tareas IS 'Tareas internas asignables con vencimiento y seguimiento';

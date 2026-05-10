-- ============================================================
-- Marco Rossi Estudio Jurídico - Migración 003: Tablas Secundarias
-- alertas, adjuntos, checklist, notas, tags, contactos, audit_log
-- ============================================================

-- ============================================================
-- T13: alertas
-- ============================================================
CREATE TABLE public.alertas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id     uuid REFERENCES public.expedientes(id) ON DELETE CASCADE,
  tipo              text NOT NULL
                    CHECK (tipo IN (
                      'SEGUIMIENTO_PENDIENTE', 'AUDIENCIA_PROXIMA', 'TAREA_VENCIDA',
                      'SIN_RESPONSABLE', 'DOCUMENTO_FALTANTE', 'ESTADO_CAMBIO',
                      'SISTEMA', 'MENCION', 'CUSTOM'
                    )),
  titulo            text NOT NULL,
  mensaje           text,
  destinatario_id   uuid REFERENCES public.profiles(id),
  prioridad         text NOT NULL DEFAULT 'MEDIA'
                    CHECK (prioridad IN ('BAJA', 'MEDIA', 'ALTA', 'URGENTE')),
  estado            text NOT NULL DEFAULT 'ACTIVA'
                    CHECK (estado IN ('ACTIVA', 'POSPUESTA', 'RESUELTA', 'CERRADA')),
  fecha_vencimiento date,
  pospuesta_hasta   date,
  resuelta_at       timestamptz,
  resuelta_por      uuid REFERENCES public.profiles(id),
  origen            text NOT NULL DEFAULT 'AUTOMATICA'
                    CHECK (origen IN ('AUTOMATICA', 'MANUAL')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_alertas_estado ON public.alertas(estado);
CREATE INDEX idx_alertas_destinatario ON public.alertas(destinatario_id) WHERE destinatario_id IS NOT NULL;
CREATE INDEX idx_alertas_exp_id ON public.alertas(expediente_id) WHERE expediente_id IS NOT NULL;
CREATE INDEX idx_alertas_tipo ON public.alertas(tipo);
CREATE INDEX idx_alertas_activas ON public.alertas(estado, tipo) WHERE estado = 'ACTIVA';

COMMENT ON TABLE public.alertas IS 'Alertas automáticas y manuales del sistema';

-- ============================================================
-- T14: adjuntos
-- ============================================================
CREATE TABLE public.adjuntos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id   uuid REFERENCES public.expedientes(id) ON DELETE CASCADE,
  cliente_id      uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
  nombre_archivo  text NOT NULL,
  tipo_mime       text NOT NULL,
  tamano_bytes    integer,
  storage_path    text NOT NULL,
  categoria       text
                  CHECK (categoria IS NULL OR categoria IN (
                    'dni', 'cuil', 'poder', 'escrito', 'resolucion',
                    'constancia', 'pericia', 'sentencia', 'apelacion',
                    'contrato', 'captura', 'otro'
                  )),
  descripcion     text,
  uploaded_by     uuid NOT NULL REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT chk_adjunto_padre CHECK (expediente_id IS NOT NULL OR cliente_id IS NOT NULL)
);

CREATE INDEX idx_adjuntos_exp_id ON public.adjuntos(expediente_id) WHERE expediente_id IS NOT NULL;
CREATE INDEX idx_adjuntos_cliente_id ON public.adjuntos(cliente_id) WHERE cliente_id IS NOT NULL;
CREATE INDEX idx_adjuntos_deleted ON public.adjuntos(deleted_at) WHERE deleted_at IS NULL;

COMMENT ON TABLE public.adjuntos IS 'Archivos adjuntos vinculados a expedientes o clientes';

-- ============================================================
-- T15: expediente_document_checklist
-- ============================================================
CREATE TABLE public.expediente_document_checklist (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id   uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  documento       text NOT NULL,
  requerido       boolean NOT NULL DEFAULT true,
  recibido        boolean NOT NULL DEFAULT false,
  fecha_recibido  date,
  adjunto_id      uuid REFERENCES public.adjuntos(id),
  notas           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_checklist_exp_id ON public.expediente_document_checklist(expediente_id);

COMMENT ON TABLE public.expediente_document_checklist IS 'Checklist de documentación requerida por expediente';

-- ============================================================
-- T16: expediente_notas (inmutables)
-- ============================================================
CREATE TABLE public.expediente_notas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id   uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  contenido       text NOT NULL,
  es_privada      boolean NOT NULL DEFAULT false,
  eliminada       boolean NOT NULL DEFAULT false,
  eliminada_at    timestamptz,
  created_by      uuid NOT NULL REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notas_exp_id ON public.expediente_notas(expediente_id);

COMMENT ON TABLE public.expediente_notas IS 'Notas internas sobre el expediente — con soft-delete';

-- ============================================================
-- T17: expediente_tags
-- ============================================================
CREATE TABLE public.expediente_tags (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id   uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  tag             text NOT NULL,
  created_by      uuid NOT NULL REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (expediente_id, tag)
);

CREATE INDEX idx_tags_exp_id ON public.expediente_tags(expediente_id);
CREATE INDEX idx_tags_tag ON public.expediente_tags(tag);

COMMENT ON TABLE public.expediente_tags IS 'Tags flexibles para clasificación adicional de expedientes';

-- ============================================================
-- T18: expediente_contactos (contactos adicionales del cliente)
-- ============================================================
CREATE TABLE public.expediente_contactos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  relacion    text,
  telefono    text,
  email       text,
  notas       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_contactos_cliente ON public.expediente_contactos(cliente_id);

COMMENT ON TABLE public.expediente_contactos IS 'Contactos adicionales del cliente (familiares, apoderados, etc.)';

-- ============================================================
-- T19: audit_log
-- ============================================================
CREATE TABLE public.audit_log (
  id                bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  tabla             text NOT NULL,
  registro_id       uuid NOT NULL,
  accion            text NOT NULL
                    CHECK (accion IN ('INSERT', 'UPDATE', 'DELETE', 'STATE_CHANGE', 'SENSITIVE_ACCESS', 'LOGIN')),
  datos_anteriores  jsonb,
  datos_nuevos      jsonb,
  user_id           uuid REFERENCES public.profiles(id),
  ip_address        text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_tabla_registro ON public.audit_log(tabla, registro_id);
CREATE INDEX idx_audit_user_id ON public.audit_log(user_id);
CREATE INDEX idx_audit_created_at ON public.audit_log(created_at);

COMMENT ON TABLE public.audit_log IS 'Log de auditoría de acciones críticas del sistema';

-- ============================================================
-- Marco Rossi Estudio Jurídico - Migración 004: RLS Policies
-- ============================================================

-- ============================================================
-- Funciones helper para RLS
-- ============================================================
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text AS $$
  SELECT rol FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT public.current_user_role() = 'ADMIN'
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ============================================================
-- profiles
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_active"
  ON public.profiles FOR SELECT
  USING (activo = true);

CREATE POLICY "profiles_select_all_admin"
  ON public.profiles FOR SELECT
  USING (public.is_admin());

CREATE POLICY "profiles_insert_admin"
  ON public.profiles FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (true);

CREATE POLICY "profiles_update_self"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND rol = (SELECT p.rol FROM public.profiles p WHERE p.id = auth.uid()));

-- ============================================================
-- clientes
-- ============================================================
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clientes_select"
  ON public.clientes FOR SELECT
  USING (auth.uid() IS NOT NULL AND deleted_at IS NULL);

CREATE POLICY "clientes_insert"
  ON public.clientes FOR INSERT
  WITH CHECK (current_user_role() = ANY (ARRAY['ADMIN','ABOGADO','COLABORADOR']));

CREATE POLICY "clientes_update"
  ON public.clientes FOR UPDATE
  USING (current_user_role() = ANY (ARRAY['ADMIN','ABOGADO','COLABORADOR']) AND deleted_at IS NULL)
  WITH CHECK (deleted_at IS NULL);

-- ============================================================
-- tipos_tramite (catálogo: todos leen, admin escribe)
-- ============================================================
ALTER TABLE public.tipos_tramite ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tipos_tramite_select"
  ON public.tipos_tramite FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "tipos_tramite_admin"
  ON public.tipos_tramite FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- organismos (catálogo: todos leen, admin escribe)
-- ============================================================
ALTER TABLE public.organismos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organismos_select"
  ON public.organismos FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "organismos_admin"
  ON public.organismos FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- catalogo_tipos_tarea
-- ============================================================
ALTER TABLE public.catalogo_tipos_tarea ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalogo_tarea_select"
  ON public.catalogo_tipos_tarea FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "catalogo_tarea_admin"
  ON public.catalogo_tipos_tarea FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- catalogo_tipos_audiencia
-- ============================================================
ALTER TABLE public.catalogo_tipos_audiencia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalogo_audiencia_select"
  ON public.catalogo_tipos_audiencia FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "catalogo_audiencia_admin"
  ON public.catalogo_tipos_audiencia FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- expedientes
-- ============================================================
ALTER TABLE public.expedientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expedientes_select_all_authenticated"
  ON public.expedientes FOR SELECT
  USING (auth.uid() IS NOT NULL AND deleted_at IS NULL);

CREATE POLICY "expedientes_insert"
  ON public.expedientes FOR INSERT
  WITH CHECK (current_user_role() = ANY (ARRAY['ADMIN','ABOGADO','COLABORADOR']));

CREATE POLICY "expedientes_update"
  ON public.expedientes FOR UPDATE
  USING (current_user_role() = ANY (ARRAY['ADMIN','ABOGADO','COLABORADOR']) AND deleted_at IS NULL)
  WITH CHECK (deleted_at IS NULL);

CREATE POLICY "expedientes_delete_admin"
  ON public.expedientes FOR DELETE
  USING (public.is_admin());

-- ============================================================
-- expediente_miembros
-- ============================================================
ALTER TABLE public.expediente_miembros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exp_miembros_select"
  ON public.expediente_miembros FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "exp_miembros_insert"
  ON public.expediente_miembros FOR INSERT
  WITH CHECK (current_user_role() = ANY (ARRAY['ADMIN','ABOGADO']));

CREATE POLICY "exp_miembros_update"
  ON public.expediente_miembros FOR UPDATE
  USING (current_user_role() = ANY (ARRAY['ADMIN','ABOGADO']));

CREATE POLICY "exp_miembros_delete"
  ON public.expediente_miembros FOR DELETE
  USING (current_user_role() = ANY (ARRAY['ADMIN','ABOGADO']));

-- ============================================================
-- historial_estados_expediente
-- ============================================================
ALTER TABLE public.historial_estados_expediente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "historial_select"
  ON public.historial_estados_expediente FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "historial_insert"
  ON public.historial_estados_expediente FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- audiencias
-- ============================================================
ALTER TABLE public.audiencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audiencias_select"
  ON public.audiencias FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "audiencias_insert"
  ON public.audiencias FOR INSERT
  WITH CHECK (current_user_role() = ANY (ARRAY['ADMIN','ABOGADO','COLABORADOR']));

CREATE POLICY "audiencias_update"
  ON public.audiencias FOR UPDATE
  USING (current_user_role() = ANY (ARRAY['ADMIN','ABOGADO','COLABORADOR']));

-- ============================================================
-- seguimientos
-- ============================================================
ALTER TABLE public.seguimientos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seguimientos_select"
  ON public.seguimientos FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "seguimientos_insert"
  ON public.seguimientos FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- tareas
-- ============================================================
ALTER TABLE public.tareas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tareas_select"
  ON public.tareas FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "tareas_insert"
  ON public.tareas FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "tareas_update"
  ON public.tareas FOR UPDATE
  USING (
    asignado_a = auth.uid() OR
    created_by = auth.uid() OR
    public.is_admin()
  );

-- ============================================================
-- alertas
-- ============================================================
ALTER TABLE public.alertas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alertas_select"
  ON public.alertas FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      destinatario_id = auth.uid() OR
      destinatario_id IS NULL OR
      public.is_admin()
    )
  );

CREATE POLICY "alertas_insert_system"
  ON public.alertas FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "alertas_update"
  ON public.alertas FOR UPDATE
  USING (
    destinatario_id = auth.uid() OR
    public.is_admin()
  );

-- ============================================================
-- adjuntos
-- ============================================================
ALTER TABLE public.adjuntos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "adjuntos_select"
  ON public.adjuntos FOR SELECT
  USING (auth.uid() IS NOT NULL AND deleted_at IS NULL);

CREATE POLICY "adjuntos_insert"
  ON public.adjuntos FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "adjuntos_delete"
  ON public.adjuntos FOR DELETE
  USING (uploaded_by = auth.uid() OR public.is_admin());

-- ============================================================
-- expediente_notas
-- ============================================================
ALTER TABLE public.expediente_notas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notas_select"
  ON public.expediente_notas FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      NOT es_privada OR
      created_by = auth.uid() OR
      public.is_admin()
    )
  );

CREATE POLICY "notas_insert"
  ON public.expediente_notas FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "notas_update_soft_delete"
  ON public.expediente_notas FOR UPDATE
  USING (created_by = auth.uid() OR public.is_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_admin());

-- ============================================================
-- expediente_document_checklist, tags, contactos
-- ============================================================
ALTER TABLE public.expediente_document_checklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklist_all_authenticated"
  ON public.expediente_document_checklist FOR ALL
  USING (auth.uid() IS NOT NULL);

ALTER TABLE public.expediente_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tags_all_authenticated"
  ON public.expediente_tags FOR ALL
  USING (auth.uid() IS NOT NULL);

ALTER TABLE public.expediente_contactos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contactos_all_authenticated"
  ON public.expediente_contactos FOR ALL
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- audit_log (solo lectura para admin, escritura solo via SECURITY DEFINER)
-- ============================================================
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_select_admin"
  ON public.audit_log FOR SELECT
  USING (public.is_admin());

-- ============================================================
-- push_subscriptions (handled in 00018)
-- ============================================================

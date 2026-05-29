-- ============================================================
-- Multi-abogado SAE: expediente local único + vínculos por perfil
--
-- Modelo:
--   - public.expedientes sigue siendo el expediente local único.
--   - public.expediente_sae_links registra qué abogado/perfil tiene ese
--     expediente en su cuenta SAE y con qué procid/jurisdicción.
--   - DIRECTOR/ADMIN ve todo; ABOGADO/COLABORADOR ve si es responsable,
--     creador, miembro o tiene link SAE propio.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1) Vínculos SAE por perfil
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.expediente_sae_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id   uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  profile_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider        text NOT NULL DEFAULT 'justucuman',
  numero_sae      text NOT NULL CHECK (btrim(numero_sae) <> ''),
  procid          text,
  jurisdiction_id integer,
  caratula        text,
  sync_enabled    boolean NOT NULL DEFAULT true,
  imported_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz,
  last_sync_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, provider, numero_sae),
  UNIQUE (profile_id, provider, expediente_id)
);

COMMENT ON TABLE public.expediente_sae_links IS
  'Vincula un expediente local único con los perfiles que lo tienen en su cuenta SAE. Evita duplicar expedientes cuando dos abogados importan el mismo numero_sae.';

CREATE INDEX IF NOT EXISTS expediente_sae_links_expediente_idx
  ON public.expediente_sae_links(expediente_id);

CREATE INDEX IF NOT EXISTS expediente_sae_links_profile_idx
  ON public.expediente_sae_links(profile_id, provider);

CREATE INDEX IF NOT EXISTS expediente_sae_links_numero_idx
  ON public.expediente_sae_links(provider, numero_sae);

CREATE INDEX IF NOT EXISTS expediente_sae_links_sync_idx
  ON public.expediente_sae_links(profile_id, sync_enabled)
  WHERE sync_enabled = true;

DROP TRIGGER IF EXISTS trg_expediente_sae_links_updated_at ON public.expediente_sae_links;
CREATE TRIGGER trg_expediente_sae_links_updated_at
  BEFORE UPDATE ON public.expediente_sae_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Backfill conservador: cada expediente SAE existente queda vinculado al
-- creador y al responsable actual si existen. No cambia responsables.
INSERT INTO public.expediente_sae_links (
  expediente_id, profile_id, provider, numero_sae, caratula, imported_at, created_at, updated_at
)
SELECT e.id, e.created_by, 'justucuman', e.numero_sae, e.caratula, e.created_at, now(), now()
FROM public.expedientes e
WHERE e.numero_sae IS NOT NULL
  AND e.deleted_at IS NULL
  AND e.created_by IS NOT NULL
ON CONFLICT (profile_id, provider, numero_sae) DO NOTHING;

INSERT INTO public.expediente_sae_links (
  expediente_id, profile_id, provider, numero_sae, caratula, imported_at, created_at, updated_at
)
SELECT e.id, e.abogado_responsable_id, 'justucuman', e.numero_sae, e.caratula, e.created_at, now(), now()
FROM public.expedientes e
WHERE e.numero_sae IS NOT NULL
  AND e.deleted_at IS NULL
  AND e.abogado_responsable_id IS NOT NULL
ON CONFLICT (profile_id, provider, numero_sae) DO NOTHING;

-- Allowlist efímera: la Edge Function sae-list la rellena con los expedientes
-- que el usuario efectivamente tiene en su SAE. La RPC de importación exige
-- este registro para evitar que alguien se vincule adivinando un numero_sae.
CREATE TABLE IF NOT EXISTS public.sae_import_allowlist (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider        text NOT NULL DEFAULT 'justucuman',
  numero_sae      text NOT NULL CHECK (btrim(numero_sae) <> ''),
  procid          text,
  jurisdiction_id integer,
  caratula        text,
  expires_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, provider, numero_sae)
);

CREATE INDEX IF NOT EXISTS sae_import_allowlist_profile_idx
  ON public.sae_import_allowlist(profile_id, provider, expires_at);

DROP TRIGGER IF EXISTS trg_sae_import_allowlist_updated_at ON public.sae_import_allowlist;
CREATE TRIGGER trg_sae_import_allowlist_updated_at
  BEFORE UPDATE ON public.sae_import_allowlist
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 2) Helpers de visibilidad
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_view_expediente(p_expediente_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.expedientes e
      WHERE e.id = p_expediente_id
        AND e.deleted_at IS NULL
        AND (
          e.abogado_responsable_id = auth.uid()
          OR e.created_by = auth.uid()
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.expediente_miembros m
      WHERE m.expediente_id = p_expediente_id
        AND m.profile_id = auth.uid()
        AND m.activo = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.expediente_sae_links l
      WHERE l.expediente_id = p_expediente_id
        AND l.profile_id = auth.uid()
    )
$$;

COMMENT ON FUNCTION public.can_view_expediente IS
  'TRUE si el current user puede ver el expediente: director/admin, responsable, creador, miembro activo o vínculo SAE propio.';

CREATE OR REPLACE FUNCTION public.can_sync_expediente_sae(p_expediente_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND public.can_view_expediente(p_expediente_id)
    AND EXISTS (
      SELECT 1
      FROM public.expediente_sae_links l
      WHERE l.expediente_id = p_expediente_id
        AND l.profile_id = auth.uid()
        AND l.provider = 'justucuman'
        AND l.sync_enabled = true
    )
    AND EXISTS (
      SELECT 1
      FROM public.expedientes e
      WHERE e.id = p_expediente_id
        AND e.deleted_at IS NULL
        AND e.numero_sae IS NOT NULL
    )
$$;

GRANT EXECUTE ON FUNCTION public.can_view_expediente(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_sync_expediente_sae(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3) RLS de vínculos y tablas core
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.expediente_sae_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sae_import_allowlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expediente_sae_links_select ON public.expediente_sae_links;
CREATE POLICY expediente_sae_links_select ON public.expediente_sae_links
  FOR SELECT USING (
    profile_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS expediente_sae_links_insert_own ON public.expediente_sae_links;
DROP POLICY IF EXISTS expediente_sae_links_insert_blocked ON public.expediente_sae_links;
CREATE POLICY expediente_sae_links_insert_blocked ON public.expediente_sae_links
  FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS expediente_sae_links_update_own ON public.expediente_sae_links;
DROP POLICY IF EXISTS expediente_sae_links_update_admin ON public.expediente_sae_links;
CREATE POLICY expediente_sae_links_update_admin ON public.expediente_sae_links
  FOR UPDATE USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS expediente_sae_links_delete_admin ON public.expediente_sae_links;
CREATE POLICY expediente_sae_links_delete_admin ON public.expediente_sae_links
  FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS sae_import_allowlist_select_own ON public.sae_import_allowlist;
CREATE POLICY sae_import_allowlist_select_own ON public.sae_import_allowlist
  FOR SELECT USING (profile_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS sae_import_allowlist_insert_blocked ON public.sae_import_allowlist;
CREATE POLICY sae_import_allowlist_insert_blocked ON public.sae_import_allowlist
  FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS sae_import_allowlist_update_blocked ON public.sae_import_allowlist;
CREATE POLICY sae_import_allowlist_update_blocked ON public.sae_import_allowlist
  FOR UPDATE USING (false);

DROP POLICY IF EXISTS sae_import_allowlist_delete_admin ON public.sae_import_allowlist;
CREATE POLICY sae_import_allowlist_delete_admin ON public.sae_import_allowlist
  FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS "expedientes_select_all_authenticated" ON public.expedientes;
DROP POLICY IF EXISTS expedientes_select_by_visibility ON public.expedientes;
CREATE POLICY expedientes_select_by_visibility
  ON public.expedientes FOR SELECT
  USING (auth.uid() IS NOT NULL AND deleted_at IS NULL AND public.can_view_expediente(id));

DROP POLICY IF EXISTS "expedientes_insert" ON public.expedientes;
DROP POLICY IF EXISTS expedientes_insert ON public.expedientes;
CREATE POLICY expedientes_insert
  ON public.expedientes FOR INSERT
  WITH CHECK (
    public.current_user_role() = ANY (ARRAY['ADMIN','DIRECTOR','ABOGADO','COLABORADOR'])
  );

DROP POLICY IF EXISTS "expedientes_update" ON public.expedientes;
DROP POLICY IF EXISTS expedientes_update ON public.expedientes;
CREATE POLICY expedientes_update
  ON public.expedientes FOR UPDATE
  USING (
    public.current_user_role() = ANY (ARRAY['ADMIN','DIRECTOR','ABOGADO','COLABORADOR'])
    AND deleted_at IS NULL
    AND public.can_view_expediente(id)
  )
  WITH CHECK (
    deleted_at IS NULL
    AND public.can_view_expediente(id)
  );

DROP POLICY IF EXISTS "exp_miembros_select" ON public.expediente_miembros;
DROP POLICY IF EXISTS exp_miembros_select_visible ON public.expediente_miembros;
CREATE POLICY exp_miembros_select_visible
  ON public.expediente_miembros FOR SELECT
  USING (
    public.is_admin()
    OR profile_id = auth.uid()
    OR public.can_view_expediente(expediente_id)
  );

DROP POLICY IF EXISTS "exp_miembros_insert" ON public.expediente_miembros;
DROP POLICY IF EXISTS exp_miembros_insert_visible ON public.expediente_miembros;
CREATE POLICY exp_miembros_insert_visible
  ON public.expediente_miembros FOR INSERT
  WITH CHECK (
    public.current_user_role() = ANY (ARRAY['ADMIN','DIRECTOR','ABOGADO'])
    AND public.can_view_expediente(expediente_id)
  );

DROP POLICY IF EXISTS "exp_miembros_update" ON public.expediente_miembros;
DROP POLICY IF EXISTS exp_miembros_update_visible ON public.expediente_miembros;
CREATE POLICY exp_miembros_update_visible
  ON public.expediente_miembros FOR UPDATE
  USING (
    public.current_user_role() = ANY (ARRAY['ADMIN','DIRECTOR','ABOGADO'])
    AND public.can_view_expediente(expediente_id)
  )
  WITH CHECK (public.can_view_expediente(expediente_id));

DROP POLICY IF EXISTS "exp_miembros_delete" ON public.expediente_miembros;
DROP POLICY IF EXISTS exp_miembros_delete_visible ON public.expediente_miembros;
CREATE POLICY exp_miembros_delete_visible
  ON public.expediente_miembros FOR DELETE
  USING (
    public.current_user_role() = ANY (ARRAY['ADMIN','DIRECTOR','ABOGADO'])
    AND public.can_view_expediente(expediente_id)
  );

DROP POLICY IF EXISTS "historial_select" ON public.historial_estados_expediente;
DROP POLICY IF EXISTS historial_select_visible ON public.historial_estados_expediente;
CREATE POLICY historial_select_visible
  ON public.historial_estados_expediente FOR SELECT
  USING (public.can_view_expediente(expediente_id));

DROP POLICY IF EXISTS "audiencias_select" ON public.audiencias;
DROP POLICY IF EXISTS audiencias_select_visible ON public.audiencias;
CREATE POLICY audiencias_select_visible
  ON public.audiencias FOR SELECT
  USING (public.can_view_expediente(expediente_id));

DROP POLICY IF EXISTS "audiencias_insert" ON public.audiencias;
DROP POLICY IF EXISTS audiencias_insert_visible ON public.audiencias;
CREATE POLICY audiencias_insert_visible
  ON public.audiencias FOR INSERT
  WITH CHECK (
    public.can_view_expediente(expediente_id)
    AND public.current_user_role() = ANY (ARRAY['ADMIN','DIRECTOR','ABOGADO','COLABORADOR'])
  );

DROP POLICY IF EXISTS "audiencias_update" ON public.audiencias;
DROP POLICY IF EXISTS audiencias_update_visible ON public.audiencias;
CREATE POLICY audiencias_update_visible
  ON public.audiencias FOR UPDATE
  USING (
    public.can_view_expediente(expediente_id)
    AND public.current_user_role() = ANY (ARRAY['ADMIN','DIRECTOR','ABOGADO','COLABORADOR'])
  )
  WITH CHECK (public.can_view_expediente(expediente_id));

DROP POLICY IF EXISTS "seguimientos_select" ON public.seguimientos;
DROP POLICY IF EXISTS seguimientos_select_visible ON public.seguimientos;
CREATE POLICY seguimientos_select_visible
  ON public.seguimientos FOR SELECT
  USING (public.can_view_expediente(expediente_id));

DROP POLICY IF EXISTS "seguimientos_insert" ON public.seguimientos;
DROP POLICY IF EXISTS seguimientos_insert_visible ON public.seguimientos;
CREATE POLICY seguimientos_insert_visible
  ON public.seguimientos FOR INSERT
  WITH CHECK (public.can_view_expediente(expediente_id));

DROP POLICY IF EXISTS "tareas_select" ON public.tareas;
DROP POLICY IF EXISTS tareas_select_visible ON public.tareas;
CREATE POLICY tareas_select_visible
  ON public.tareas FOR SELECT
  USING (
    public.is_admin()
    OR asignado_a = auth.uid()
    OR created_by = auth.uid()
    OR (expediente_id IS NOT NULL AND public.can_view_expediente(expediente_id))
  );

DROP POLICY IF EXISTS "tareas_insert" ON public.tareas;
DROP POLICY IF EXISTS tareas_insert_visible ON public.tareas;
CREATE POLICY tareas_insert_visible
  ON public.tareas FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      expediente_id IS NULL
      OR public.can_view_expediente(expediente_id)
    )
  );

DROP POLICY IF EXISTS "tareas_update" ON public.tareas;
DROP POLICY IF EXISTS tareas_update_visible ON public.tareas;
CREATE POLICY tareas_update_visible
  ON public.tareas FOR UPDATE
  USING (
    public.is_admin()
    OR asignado_a = auth.uid()
    OR created_by = auth.uid()
    OR (expediente_id IS NOT NULL AND public.can_view_expediente(expediente_id))
  )
  WITH CHECK (
    expediente_id IS NULL
    OR public.can_view_expediente(expediente_id)
  );

DROP POLICY IF EXISTS "adjuntos_select" ON public.adjuntos;
DROP POLICY IF EXISTS adjuntos_select_visible ON public.adjuntos;
CREATE POLICY adjuntos_select_visible
  ON public.adjuntos FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      public.is_admin()
      OR uploaded_by = auth.uid()
      OR (expediente_id IS NOT NULL AND public.can_view_expediente(expediente_id))
      OR (
        cliente_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.expedientes e
          WHERE e.cliente_id = adjuntos.cliente_id
            AND e.deleted_at IS NULL
            AND public.can_view_expediente(e.id)
        )
      )
    )
  );

DROP POLICY IF EXISTS "adjuntos_insert" ON public.adjuntos;
DROP POLICY IF EXISTS adjuntos_insert_visible ON public.adjuntos;
CREATE POLICY adjuntos_insert_visible
  ON public.adjuntos FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      expediente_id IS NULL
      OR public.can_view_expediente(expediente_id)
    )
  );

DROP POLICY IF EXISTS "notas_select" ON public.expediente_notas;
DROP POLICY IF EXISTS notas_select_visible ON public.expediente_notas;
CREATE POLICY notas_select_visible
  ON public.expediente_notas FOR SELECT
  USING (
    public.can_view_expediente(expediente_id)
    AND (
      NOT es_privada
      OR created_by = auth.uid()
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS "notas_insert" ON public.expediente_notas;
DROP POLICY IF EXISTS notas_insert_visible ON public.expediente_notas;
CREATE POLICY notas_insert_visible
  ON public.expediente_notas FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND public.can_view_expediente(expediente_id)
  );

DROP POLICY IF EXISTS notas_update_soft_delete ON public.expediente_notas;
DROP POLICY IF EXISTS "notas_update_soft_delete" ON public.expediente_notas;
CREATE POLICY notas_update_soft_delete ON public.expediente_notas
  FOR UPDATE USING (created_by = auth.uid() OR public.is_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "checklist_all_authenticated" ON public.expediente_document_checklist;
DROP POLICY IF EXISTS checklist_visible ON public.expediente_document_checklist;
CREATE POLICY checklist_visible
  ON public.expediente_document_checklist FOR ALL
  USING (public.can_view_expediente(expediente_id))
  WITH CHECK (public.can_view_expediente(expediente_id));

DROP POLICY IF EXISTS "tags_all_authenticated" ON public.expediente_tags;
DROP POLICY IF EXISTS tags_visible ON public.expediente_tags;
CREATE POLICY tags_visible
  ON public.expediente_tags FOR ALL
  USING (public.can_view_expediente(expediente_id))
  WITH CHECK (public.can_view_expediente(expediente_id));

DROP POLICY IF EXISTS "contactos_all_authenticated" ON public.expediente_contactos;
DROP POLICY IF EXISTS contactos_visible ON public.expediente_contactos;
CREATE POLICY contactos_visible
  ON public.expediente_contactos FOR ALL
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.expedientes e
      WHERE e.cliente_id = expediente_contactos.cliente_id
        AND e.deleted_at IS NULL
        AND public.can_view_expediente(e.id)
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.expedientes e
      WHERE e.cliente_id = expediente_contactos.cliente_id
        AND e.deleted_at IS NULL
        AND public.can_view_expediente(e.id)
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 4) SAE: policies y RPCs alineadas con can_view_expediente
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "sae_movements_select" ON public.sae_movements;
CREATE POLICY "sae_movements_select" ON public.sae_movements
  FOR SELECT USING (public.can_view_expediente(expediente_id));

DROP POLICY IF EXISTS "sae_sync_logs_own" ON public.sae_sync_logs;
CREATE POLICY "sae_sync_logs_own" ON public.sae_sync_logs
  FOR SELECT USING (
    profile_id = auth.uid()
    OR public.is_admin()
    OR (expediente_id IS NOT NULL AND public.can_view_expediente(expediente_id))
  );

DROP POLICY IF EXISTS "sae_credentials_admin" ON public.sae_credentials;
CREATE POLICY "sae_credentials_admin" ON public.sae_credentials
  FOR SELECT USING (public.current_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "sae_notif_owner_select" ON public.sae_notificaciones;
CREATE POLICY "sae_notif_owner_select" ON public.sae_notificaciones
  FOR SELECT USING (
    profile_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "audiencia_transcripts_select" ON public.audiencia_transcripts;
CREATE POLICY "audiencia_transcripts_select" ON public.audiencia_transcripts
  FOR SELECT USING (public.can_view_expediente(expediente_id));

DROP POLICY IF EXISTS "audiencia_transcripts_delete_owner" ON public.audiencia_transcripts;
CREATE POLICY "audiencia_transcripts_delete_owner" ON public.audiencia_transcripts
  FOR DELETE USING (created_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "escritos_select" ON public.escritos;
CREATE POLICY "escritos_select" ON public.escritos
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.can_view_expediente(expediente_id)
  );

DROP POLICY IF EXISTS "escritos_insert_owner" ON public.escritos;
CREATE POLICY "escritos_insert_owner" ON public.escritos
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND public.can_view_expediente(expediente_id)
  );

DROP POLICY IF EXISTS "escritos_update_owner" ON public.escritos;
CREATE POLICY "escritos_update_owner" ON public.escritos
  FOR UPDATE USING (
    user_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "escritos_delete_owner" ON public.escritos;
CREATE POLICY "escritos_delete_owner" ON public.escritos
  FOR DELETE USING (
    user_id = auth.uid()
    OR public.is_admin()
  );

CREATE OR REPLACE FUNCTION public.set_sae_movement_key(
  p_movement_id uuid,
  p_is_key boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expediente_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'P0401';
  END IF;

  SELECT expediente_id INTO v_expediente_id
  FROM public.sae_movements
  WHERE id = p_movement_id;

  IF v_expediente_id IS NULL THEN
    RAISE EXCEPTION 'Actuación no encontrada' USING ERRCODE = 'P0404';
  END IF;

  IF NOT public.can_view_expediente(v_expediente_id) THEN
    RAISE EXCEPTION 'Sin permisos sobre esta actuación' USING ERRCODE = 'P0403';
  END IF;

  UPDATE public.sae_movements
  SET is_key = p_is_key
  WHERE id = p_movement_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_sae_movement_audiencia(
  p_movement_id uuid,
  p_is_audiencia boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expediente_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'P0401';
  END IF;

  SELECT expediente_id INTO v_expediente_id
  FROM public.sae_movements
  WHERE id = p_movement_id;

  IF v_expediente_id IS NULL THEN
    RAISE EXCEPTION 'Actuación no encontrada' USING ERRCODE = 'P0404';
  END IF;

  IF NOT public.can_view_expediente(v_expediente_id) THEN
    RAISE EXCEPTION 'Sin permisos sobre esta actuación' USING ERRCODE = 'P0403';
  END IF;

  UPDATE public.sae_movements
  SET is_audiencia = p_is_audiencia
  WHERE id = p_movement_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_sae_movement_key(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_sae_movement_audiencia(uuid, boolean) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5) Cache interno de documentos SAE ya descargados
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sae_document_cache (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id   uuid NOT NULL REFERENCES public.expedientes(id) ON DELETE CASCADE,
  movement_id      uuid NOT NULL REFERENCES public.sae_movements(id) ON DELETE CASCADE,
  fetched_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  file_name        text NOT NULL,
  storage_path     text NOT NULL UNIQUE,
  mime_type        text,
  size_bytes       integer,
  fetched_at       timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (movement_id, file_name)
);

COMMENT ON TABLE public.sae_document_cache IS
  'Cache privado del estudio para documentos SAE descargados por un abogado autorizado. Permite que el director vea documentos ya sincronizados sin usar credenciales ajenas.';

CREATE INDEX IF NOT EXISTS sae_document_cache_expediente_idx
  ON public.sae_document_cache(expediente_id);

CREATE INDEX IF NOT EXISTS sae_document_cache_movement_idx
  ON public.sae_document_cache(movement_id);

DROP TRIGGER IF EXISTS trg_sae_document_cache_updated_at ON public.sae_document_cache;
CREATE TRIGGER trg_sae_document_cache_updated_at
  BEFORE UPDATE ON public.sae_document_cache
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sae_document_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sae_document_cache_select_visible ON public.sae_document_cache;
CREATE POLICY sae_document_cache_select_visible ON public.sae_document_cache
  FOR SELECT USING (public.can_view_expediente(expediente_id));

DROP POLICY IF EXISTS sae_document_cache_insert_blocked ON public.sae_document_cache;
CREATE POLICY sae_document_cache_insert_blocked ON public.sae_document_cache
  FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS sae_document_cache_update_blocked ON public.sae_document_cache;
CREATE POLICY sae_document_cache_update_blocked ON public.sae_document_cache
  FOR UPDATE USING (false);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sae-documents',
  'sae-documents',
  false,
  104857600, -- 100 MB por archivo
  ARRAY['application/pdf', 'application/octet-stream', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "sae_documents_select_visible" ON storage.objects;
CREATE POLICY "sae_documents_select_visible" ON storage.objects
  FOR SELECT USING (
    CASE
      WHEN bucket_id = 'sae-documents'
        AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.can_view_expediente(((storage.foldername(name))[1])::uuid)
      ELSE false
    END
  );

-- ─────────────────────────────────────────────────────────────
-- 6) RPC de importación SAE sin duplicar expediente local
-- ─────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.create_expediente_sae(text, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.create_expediente_sae(
  p_numero_sae text,
  p_caratula text,
  p_cliente_id uuid DEFAULT NULL,
  p_tipo_tramite_id uuid DEFAULT NULL,
  p_procid text DEFAULT NULL,
  p_jurisdiction_id integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_numero_sae text := nullif(btrim(p_numero_sae), '');
  v_caratula text := nullif(btrim(p_caratula), '');
  v_cliente_id uuid := p_cliente_id;
  v_tipo_tramite_id uuid := p_tipo_tramite_id;
  v_placeholder_dni text;
  v_created jsonb;
  v_expediente public.expedientes%ROWTYPE;
  v_allowed public.sae_import_allowlist%ROWTYPE;
  v_procid text;
  v_jurisdiction_id integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = 'P0401';
  END IF;

  IF v_numero_sae IS NULL OR v_caratula IS NULL THEN
    RAISE EXCEPTION 'numero_sae y caratula son requeridos' USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_allowed
  FROM public.sae_import_allowlist
  WHERE profile_id = auth.uid()
    AND provider = 'justucuman'
    AND numero_sae = v_numero_sae
    AND expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El expediente no está validado contra tus expedientes SAE. Volvé a listar Mis expedientes SAE antes de importarlo.'
      USING ERRCODE = 'P0403';
  END IF;

  v_procid := COALESCE(nullif(btrim(p_procid), ''), v_allowed.procid);
  v_jurisdiction_id := COALESCE(p_jurisdiction_id, v_allowed.jurisdiction_id);

  SELECT *
  INTO v_expediente
  FROM public.expedientes
  WHERE numero_sae = v_numero_sae
    AND deleted_at IS NULL
  ORDER BY created_at ASC
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.expedientes
    SET caratula = COALESCE(v_caratula, caratula),
        abogado_responsable_id = COALESCE(abogado_responsable_id, auth.uid()),
        updated_at = now()
    WHERE id = v_expediente.id
    RETURNING * INTO v_expediente;

    INSERT INTO public.expediente_sae_links (
      expediente_id, profile_id, provider, numero_sae, procid,
      jurisdiction_id, caratula, last_seen_at, updated_at
    )
    VALUES (
      v_expediente.id, auth.uid(), 'justucuman', v_numero_sae,
      v_procid, v_jurisdiction_id, v_caratula, now(), now()
    )
    ON CONFLICT (profile_id, provider, numero_sae) DO UPDATE
    SET expediente_id = EXCLUDED.expediente_id,
        procid = COALESCE(EXCLUDED.procid, public.expediente_sae_links.procid),
        jurisdiction_id = COALESCE(EXCLUDED.jurisdiction_id, public.expediente_sae_links.jurisdiction_id),
        caratula = COALESCE(EXCLUDED.caratula, public.expediente_sae_links.caratula),
        last_seen_at = now(),
        updated_at = now();

    RETURN to_jsonb(v_expediente);
  END IF;

  IF v_tipo_tramite_id IS NULL THEN
    SELECT id
    INTO v_tipo_tramite_id
    FROM public.tipos_tramite
    WHERE activo = true
      AND codigo = 'otro'
    ORDER BY orden ASC, nombre ASC
    LIMIT 1;

    IF v_tipo_tramite_id IS NULL THEN
      SELECT id
      INTO v_tipo_tramite_id
      FROM public.tipos_tramite
      WHERE activo = true
      ORDER BY orden ASC, nombre ASC
      LIMIT 1;
    END IF;
  END IF;

  IF v_tipo_tramite_id IS NULL THEN
    RAISE EXCEPTION 'No hay tipos de trámite activos para importar expedientes SAE' USING ERRCODE = 'P0001';
  END IF;

  IF v_cliente_id IS NULL THEN
    v_placeholder_dni := regexp_replace(v_numero_sae, '\D', '', 'g');

    IF v_placeholder_dni IS NULL OR v_placeholder_dni = '' THEN
      v_placeholder_dni := lpad(abs(hashtext('sae:' || v_numero_sae))::text, 8, '9');
    END IF;

    IF length(v_placeholder_dni) < 8 THEN
      v_placeholder_dni := lpad(v_placeholder_dni, 8, '9');
    ELSIF length(v_placeholder_dni) > 15 THEN
      v_placeholder_dni := left(v_placeholder_dni, 15);
    END IF;

    SELECT id
    INTO v_cliente_id
    FROM public.clientes
    WHERE dni = v_placeholder_dni
      AND deleted_at IS NULL
    LIMIT 1;

    IF v_cliente_id IS NULL THEN
      INSERT INTO public.clientes (
        apellido,
        nombre,
        dni,
        notas,
        origen,
        created_by
      )
      VALUES (
        'Importado SAE',
        left(v_numero_sae, 200),
        v_placeholder_dni,
        left(
          'Cliente placeholder generado automáticamente para expediente importado desde SAE. Carátula original: ' || v_caratula,
          1000
        ),
        'otro',
        auth.uid()
      )
      RETURNING id INTO v_cliente_id;
    END IF;
  END IF;

  SELECT public.create_expediente(
    p_cliente_id => v_cliente_id,
    p_tipo_tramite_id => v_tipo_tramite_id,
    p_prioridad => 'MEDIA',
    p_es_propio => true,
    p_observaciones => 'Importado automáticamente desde SAE.'
  )
  INTO v_created;

  SELECT *
  INTO v_expediente
  FROM public.expedientes
  WHERE id = (v_created->>'id')::uuid;

  UPDATE public.expedientes
  SET numero_sae = v_numero_sae,
      caratula = v_caratula,
      abogado_responsable_id = COALESCE(abogado_responsable_id, auth.uid()),
      updated_at = now()
  WHERE id = v_expediente.id
  RETURNING * INTO v_expediente;

  INSERT INTO public.expediente_sae_links (
    expediente_id, profile_id, provider, numero_sae, procid,
    jurisdiction_id, caratula, last_seen_at, updated_at
  )
  VALUES (
    v_expediente.id, auth.uid(), 'justucuman', v_numero_sae,
    v_procid, v_jurisdiction_id, v_caratula, now(), now()
  )
  ON CONFLICT (profile_id, provider, numero_sae) DO UPDATE
  SET expediente_id = EXCLUDED.expediente_id,
      procid = COALESCE(EXCLUDED.procid, public.expediente_sae_links.procid),
      jurisdiction_id = COALESCE(EXCLUDED.jurisdiction_id, public.expediente_sae_links.jurisdiction_id),
      caratula = COALESCE(EXCLUDED.caratula, public.expediente_sae_links.caratula),
      last_seen_at = now(),
      updated_at = now();

  RETURN to_jsonb(v_expediente);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_expediente_sae(text, text, uuid, uuid, text, integer) TO authenticated;

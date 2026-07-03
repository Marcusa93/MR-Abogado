-- SECRETARIA puede insertar y editar expedientes (igual que COLABORADOR).
-- COLABORADOR y SECRETARIA ya pueden ver todos los expedientes por can_view_expediente;
-- esta migración completa los permisos de escritura.

DROP POLICY IF EXISTS expedientes_insert ON public.expedientes;
CREATE POLICY expedientes_insert ON public.expedientes
  FOR INSERT
  WITH CHECK (
    current_user_role() = ANY (ARRAY['ADMIN','DIRECTOR','ABOGADO','COLABORADOR','SECRETARIA'])
  );

DROP POLICY IF EXISTS expedientes_update ON public.expedientes;
CREATE POLICY expedientes_update ON public.expedientes
  FOR UPDATE
  USING (
    current_user_role() = ANY (ARRAY['ADMIN','DIRECTOR','ABOGADO','COLABORADOR','SECRETARIA'])
    AND deleted_at IS NULL
  )
  WITH CHECK (deleted_at IS NULL);

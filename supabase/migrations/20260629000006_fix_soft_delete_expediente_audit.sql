-- Fix: soft_delete_expediente insertaba en audit_log.usuario_id, pero la
-- columna real es user_id. El INSERT fallaba y revertía toda la transacción,
-- devolviendo 400 al intentar eliminar un expediente.
-- También deja explícito que ADMIN y DIRECTOR pueden eliminar.

CREATE OR REPLACE FUNCTION public.soft_delete_expediente(p_expediente_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exp public.expedientes%ROWTYPE;
BEGIN
  IF NOT (public.is_admin() OR public.current_user_role() = 'DIRECTOR') THEN
    RAISE EXCEPTION 'Solo admin o director puede eliminar expedientes' USING ERRCODE = 'P0403';
  END IF;

  SELECT * INTO v_exp FROM public.expedientes WHERE id = p_expediente_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expediente % no encontrado', p_expediente_id USING ERRCODE = 'P0002';
  END IF;
  IF v_exp.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'El expediente ya está eliminado' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.expedientes
     SET deleted_at = now(), updated_at = now()
   WHERE id = p_expediente_id;

  INSERT INTO public.audit_log (tabla, registro_id, accion, datos_anteriores, user_id)
  VALUES ('expedientes', p_expediente_id, 'DELETE',
          to_jsonb(v_exp), auth.uid());

  RETURN jsonb_build_object('ok', true, 'expediente_id', p_expediente_id);
END $$;

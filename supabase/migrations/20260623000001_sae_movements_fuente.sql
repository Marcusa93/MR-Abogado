-- Agrega columna fuente a sae_movements para distinguir actuaciones importadas del SAE
-- de las ingresadas manualmente por el estudio.
-- Las filas existentes quedan con fuente = 'sae' por el DEFAULT.

ALTER TABLE public.sae_movements
  ADD COLUMN IF NOT EXISTS fuente text NOT NULL DEFAULT 'sae'
    CHECK (fuente IN ('sae', 'manual'));

-- Permite a usuarios autenticados insertar actuaciones manuales en expedientes que
-- pueden visualizar. Las actuaciones SAE solo se insertan desde la edge function con
-- service_role (que bypasea RLS).
DROP POLICY IF EXISTS "sae_movements_insert_manual" ON public.sae_movements;
CREATE POLICY "sae_movements_insert_manual"
  ON public.sae_movements
  FOR INSERT
  WITH CHECK (
    fuente = 'manual'
    AND can_view_expediente(expediente_id)
  );

-- Permite eliminar actuaciones manuales propias del expediente.
DROP POLICY IF EXISTS "sae_movements_delete_manual" ON public.sae_movements;
CREATE POLICY "sae_movements_delete_manual"
  ON public.sae_movements
  FOR DELETE
  USING (
    fuente = 'manual'
    AND can_view_expediente(expediente_id)
  );

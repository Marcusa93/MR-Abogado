-- El resumen de caja de los lunes corre con service role (sin usuario): auth.uid() es NULL
-- y can_access_caja() devolvía false, así que caja_resumen fallaba con 'Sin acceso a caja'.
-- El service role ya saltea RLS; se lo reconoce explícitamente acá.

CREATE OR REPLACE FUNCTION public.can_access_caja()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(auth.jwt()->>'role', '') = 'service_role'
      OR COALESCE((
        SELECT tiene_acceso_caja FROM public.profiles WHERE id = auth.uid()
      ), false);
$function$;

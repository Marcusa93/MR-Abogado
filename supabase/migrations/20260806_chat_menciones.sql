-- ============================================================
-- @menciones en chat grupal
-- Agrega menciones uuid[] a chat_mensajes y un trigger que
-- crea alertas tipo MENCION para cada destinatario mencionado.
-- ============================================================

ALTER TABLE public.chat_mensajes
  ADD COLUMN IF NOT EXISTS menciones uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_chat_mensajes_menciones
  ON public.chat_mensajes USING GIN(menciones);

-- ---------------------------------------------------------------------------
-- Trigger: notificar a los usuarios mencionados
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_chat_menciones()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid         uuid;
  sender_name text;
BEGIN
  -- Nada que hacer si no hay menciones
  IF array_length(NEW.menciones, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(nombre, '') || ' ' || coalesce(apellido, '')
    INTO sender_name
    FROM public.profiles
   WHERE id = NEW.profile_id;

  FOREACH uid IN ARRAY NEW.menciones LOOP
    -- No notificarse a uno mismo
    IF uid IS DISTINCT FROM NEW.profile_id THEN
      INSERT INTO public.alertas (
        expediente_id,
        tipo,
        titulo,
        mensaje,
        destinatario_id,
        prioridad,
        estado,
        origen
      ) VALUES (
        NULL,
        'MENCION',
        trim(sender_name) || ' te mencionó en el chat',
        left(NEW.contenido, 300),
        uid,
        'MEDIA',
        'ACTIVA',
        'AUTOMATICA'
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_chat_menciones ON public.chat_mensajes;

CREATE TRIGGER trigger_chat_menciones
  AFTER INSERT ON public.chat_mensajes
  FOR EACH ROW EXECUTE FUNCTION public.notify_chat_menciones();

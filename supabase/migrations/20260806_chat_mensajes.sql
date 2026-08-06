-- ============================================================
-- Chat grupal del estudio — mensajes en tiempo real
-- ============================================================

CREATE TABLE IF NOT EXISTS public.chat_mensajes (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  contenido  text        NOT NULL CHECK (length(contenido) > 0 AND length(contenido) <= 2000),
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.chat_mensajes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_select"
  ON public.chat_mensajes FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "chat_insert"
  ON public.chat_mensajes FOR INSERT
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "chat_delete_own"
  ON public.chat_mensajes FOR DELETE
  USING (auth.uid() = profile_id);

CREATE INDEX IF NOT EXISTS idx_chat_mensajes_created_at
  ON public.chat_mensajes (created_at DESC);

-- Habilitar realtime en la tabla
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_mensajes;

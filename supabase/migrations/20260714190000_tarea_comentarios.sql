-- Comentarios por tarea: hilo liviano para seguimiento sin salir del sistema.

CREATE TABLE public.tarea_comentarios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id    uuid NOT NULL REFERENCES public.tareas(id) ON DELETE CASCADE,
  contenido   text NOT NULL CHECK (char_length(contenido) > 0),
  created_by  uuid NOT NULL REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tarea_comentarios_tarea ON public.tarea_comentarios(tarea_id);

ALTER TABLE public.tarea_comentarios ENABLE ROW LEVEL SECURITY;

-- Todos los autenticados pueden leer comentarios
CREATE POLICY tarea_comentarios_select ON public.tarea_comentarios
  FOR SELECT TO authenticated USING (true);

-- Solo puede insertar el autor (created_by = uid)
CREATE POLICY tarea_comentarios_insert ON public.tarea_comentarios
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Solo puede eliminar el autor o un director/abogado
CREATE POLICY tarea_comentarios_delete ON public.tarea_comentarios
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND rol IN ('DIRECTOR', 'ABOGADO')
    )
  );

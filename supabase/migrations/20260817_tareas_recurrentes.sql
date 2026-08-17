-- Plantilla de tareas diarias por usuario (ej: revisar mails, procuración)
CREATE TABLE IF NOT EXISTS public.tareas_recurrentes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  titulo      text NOT NULL,
  descripcion text,
  frecuencia  text NOT NULL DEFAULT 'lun-vie'
              CHECK (frecuencia IN ('diaria','lun-vie','lunes','martes','miercoles','jueves','viernes')),
  orden       int  NOT NULL DEFAULT 0,
  activo      bool NOT NULL DEFAULT true,
  creado_por  uuid REFERENCES public.profiles(id),
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tareas_recurrentes_completadas (
  tarea_recurrente_id uuid NOT NULL REFERENCES public.tareas_recurrentes(id) ON DELETE CASCADE,
  perfil_id           uuid NOT NULL REFERENCES public.profiles(id),
  fecha               date NOT NULL DEFAULT CURRENT_DATE,
  completada_at       timestamptz DEFAULT now(),
  PRIMARY KEY (tarea_recurrente_id, fecha)
);

ALTER TABLE public.tareas_recurrentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tareas_recurrentes_completadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ver_tareas_recurrentes" ON public.tareas_recurrentes
  FOR SELECT USING (
    perfil_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rol IN ('ADMIN','DIRECTOR'))
  );

CREATE POLICY "gestionar_tareas_recurrentes" ON public.tareas_recurrentes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rol IN ('ADMIN','DIRECTOR'))
  );

CREATE POLICY "ver_completadas" ON public.tareas_recurrentes_completadas
  FOR SELECT USING (
    perfil_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rol IN ('ADMIN','DIRECTOR'))
  );

CREATE POLICY "marcar_completadas" ON public.tareas_recurrentes_completadas
  FOR ALL USING (perfil_id = auth.uid());

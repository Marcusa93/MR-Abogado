-- Documentación requerida por caso + enlace para que el cliente la suba.
--
-- documentacion_plantillas : listas tipo por caso (despido, ART, alimentos…),
--                            editables. Las de abajo son una base para revisar.
-- documentos_requeridos    : la lista de un expediente o consulta, con estado
--                            pendiente / recibido / no_aplica y el adjunto.
-- documentacion_enlaces    : enlace público (token) para que el cliente suba
--                            lo que falta sin usuario. Lo atiende la edge
--                            function documentacion-publica (service role).

-- ── 1. Plantillas ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.documentacion_plantillas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL UNIQUE,
  descripcion text,
  -- [{ "nombre": "...", "descripcion": "...", "obligatorio": true }]
  items       jsonb NOT NULL DEFAULT '[]'::jsonb,
  activo      boolean NOT NULL DEFAULT true,
  created_by  uuid DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.documentacion_plantillas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doc_plantillas_select ON public.documentacion_plantillas;
CREATE POLICY doc_plantillas_select ON public.documentacion_plantillas FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS doc_plantillas_write ON public.documentacion_plantillas;
CREATE POLICY doc_plantillas_write ON public.documentacion_plantillas FOR ALL
  USING (public.current_user_role() = ANY (ARRAY['ADMIN', 'DIRECTOR', 'ABOGADO', 'SECRETARIA', 'COLABORADOR']))
  WITH CHECK (public.current_user_role() = ANY (ARRAY['ADMIN', 'DIRECTOR', 'ABOGADO', 'SECRETARIA', 'COLABORADOR']));
REVOKE ALL ON public.documentacion_plantillas FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documentacion_plantillas TO authenticated;

-- ── 2. Documentos requeridos de un caso ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.documentos_requeridos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id uuid REFERENCES public.expedientes(id) ON DELETE CASCADE,
  consulta_id   uuid REFERENCES public.consultas(id) ON DELETE CASCADE,
  nombre        text NOT NULL,
  descripcion   text,
  obligatorio   boolean NOT NULL DEFAULT true,
  estado        text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'recibido', 'no_aplica')),
  adjunto_id    uuid REFERENCES public.adjuntos(id) ON DELETE SET NULL,
  fuente        text CHECK (fuente IN ('estudio', 'cliente')),
  recibido_at   timestamptz,
  orden         integer NOT NULL DEFAULT 0,
  created_by    uuid DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documentos_requeridos_caso CHECK (expediente_id IS NOT NULL OR consulta_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_doc_req_expediente ON public.documentos_requeridos(expediente_id);
CREATE INDEX IF NOT EXISTS idx_doc_req_consulta ON public.documentos_requeridos(consulta_id);

ALTER TABLE public.documentos_requeridos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doc_req_all ON public.documentos_requeridos;
CREATE POLICY doc_req_all ON public.documentos_requeridos FOR ALL
  USING (
    auth.uid() IS NOT NULL AND
    CASE WHEN expediente_id IS NOT NULL THEN public.can_view_expediente(expediente_id) ELSE true END
  )
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    CASE WHEN expediente_id IS NOT NULL THEN public.can_view_expediente(expediente_id) ELSE true END
  );
REVOKE ALL ON public.documentos_requeridos FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documentos_requeridos TO authenticated;

DROP TRIGGER IF EXISTS audit_row_change ON public.documentos_requeridos;
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON public.documentos_requeridos
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- Al convertir la consulta en expediente, la lista pasa al expediente
CREATE OR REPLACE FUNCTION public.doc_req_pasar_a_expediente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.convertida_expediente_id IS NOT NULL
     AND NEW.convertida_expediente_id IS DISTINCT FROM OLD.convertida_expediente_id THEN
    UPDATE public.documentos_requeridos SET expediente_id = NEW.convertida_expediente_id, updated_at = now()
     WHERE consulta_id = NEW.id AND expediente_id IS NULL;
    UPDATE public.documentacion_enlaces SET expediente_id = NEW.convertida_expediente_id
     WHERE consulta_id = NEW.id AND expediente_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 3. Enlace para el cliente ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.documentacion_enlaces (
  token         text PRIMARY KEY,
  expediente_id uuid REFERENCES public.expedientes(id) ON DELETE CASCADE,
  consulta_id   uuid REFERENCES public.consultas(id) ON DELETE CASCADE,
  created_by    uuid NOT NULL REFERENCES public.profiles(id),
  expires_at    timestamptz NOT NULL,
  revocado_at   timestamptz,
  ultimo_uso_at timestamptz,
  subidas       integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documentacion_enlaces_caso CHECK (expediente_id IS NOT NULL OR consulta_id IS NOT NULL)
);

ALTER TABLE public.documentacion_enlaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doc_enlaces_select ON public.documentacion_enlaces;
CREATE POLICY doc_enlaces_select ON public.documentacion_enlaces FOR SELECT
  USING (auth.uid() IS NOT NULL AND
         CASE WHEN expediente_id IS NOT NULL THEN public.can_view_expediente(expediente_id) ELSE true END);
REVOKE ALL ON public.documentacion_enlaces FROM anon;
GRANT SELECT ON public.documentacion_enlaces TO authenticated;

DROP TRIGGER IF EXISTS doc_req_pasar_a_expediente ON public.consultas;
CREATE TRIGGER doc_req_pasar_a_expediente
  AFTER UPDATE OF convertida_expediente_id ON public.consultas
  FOR EACH ROW EXECUTE FUNCTION public.doc_req_pasar_a_expediente();

-- Crea (o reutiliza si sigue vigente) el enlace del caso. 30 días.
CREATE OR REPLACE FUNCTION public.documentacion_enlace(p_expediente_id uuid DEFAULT NULL, p_consulta_id uuid DEFAULT NULL)
RETURNS TABLE (token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_vence timestamptz;
BEGIN
  IF auth.uid() IS NULL OR public.current_user_role() NOT IN ('ADMIN', 'DIRECTOR', 'ABOGADO', 'SECRETARIA', 'COLABORADOR', 'CRITERIO') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF p_expediente_id IS NULL AND p_consulta_id IS NULL THEN
    RAISE EXCEPTION 'Falta el expediente o la consulta';
  END IF;
  IF p_expediente_id IS NOT NULL AND NOT public.can_view_expediente(p_expediente_id) THEN
    RAISE EXCEPTION 'Sin permisos sobre el expediente';
  END IF;

  SELECT e.token, e.expires_at INTO v_token, v_vence
    FROM public.documentacion_enlaces e
   WHERE e.revocado_at IS NULL AND e.expires_at > now() + interval '7 days'
     AND (CASE WHEN p_expediente_id IS NOT NULL THEN e.expediente_id = p_expediente_id ELSE e.consulta_id = p_consulta_id END)
   ORDER BY e.expires_at DESC LIMIT 1;

  IF v_token IS NULL THEN
    v_token := encode(extensions.gen_random_bytes(24), 'hex');
    v_vence := now() + interval '30 days';
    INSERT INTO public.documentacion_enlaces (token, expediente_id, consulta_id, created_by, expires_at)
    VALUES (v_token, p_expediente_id, p_consulta_id, auth.uid(), v_vence);
  END IF;

  RETURN QUERY SELECT v_token, v_vence;
END;
$$;

CREATE OR REPLACE FUNCTION public.documentacion_enlace_revocar(p_expediente_id uuid DEFAULT NULL, p_consulta_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_expediente_id IS NOT NULL AND NOT public.can_view_expediente(p_expediente_id) THEN
    RAISE EXCEPTION 'Sin permisos sobre el expediente';
  END IF;
  UPDATE public.documentacion_enlaces SET revocado_at = now()
   WHERE revocado_at IS NULL
     AND (CASE WHEN p_expediente_id IS NOT NULL THEN expediente_id = p_expediente_id ELSE consulta_id = p_consulta_id END);
END;
$$;

REVOKE ALL ON FUNCTION public.documentacion_enlace(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.documentacion_enlace_revocar(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.documentacion_enlace(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.documentacion_enlace_revocar(uuid, uuid) TO authenticated;

-- ── 4. Plantillas iniciales (base para revisar y ajustar) ─────────────────────

INSERT INTO public.documentacion_plantillas (nombre, descripcion, items, created_by) VALUES
('Laboral — Despido', 'Despido directo o indirecto', '[
  {"nombre": "DNI (frente y dorso)", "obligatorio": true},
  {"nombre": "Constancia de CUIL", "obligatorio": true},
  {"nombre": "Recibos de sueldo (últimos 12 meses)", "obligatorio": true},
  {"nombre": "Telegramas y cartas documento intercambiados", "obligatorio": true},
  {"nombre": "Liquidación final", "obligatorio": false},
  {"nombre": "Certificado de trabajo (art. 80 LCT)", "obligatorio": false},
  {"nombre": "Constancia de alta / historia laboral (ARCA o ANSES)", "obligatorio": false},
  {"nombre": "Datos del empleador (razón social, CUIT, domicilio)", "obligatorio": true},
  {"nombre": "Pruebas de la relación (chats, fotos, horarios)", "obligatorio": false},
  {"nombre": "Testigos (nombre y teléfono)", "obligatorio": false}
]'::jsonb, NULL),
('Laboral — Accidente / ART', 'Accidente de trabajo o enfermedad profesional', '[
  {"nombre": "DNI (frente y dorso)", "obligatorio": true},
  {"nombre": "Denuncia del accidente ante la ART", "obligatorio": true},
  {"nombre": "Historia clínica y estudios médicos", "obligatorio": true},
  {"nombre": "Certificados médicos y alta", "obligatorio": true},
  {"nombre": "Dictamen de Comisión Médica", "obligatorio": false},
  {"nombre": "Recibos de sueldo (últimos 12 meses)", "obligatorio": true},
  {"nombre": "Datos de la ART y del empleador", "obligatorio": true}
]'::jsonb, NULL),
('Previsional — Jubilación / reajuste', 'Jubilación, pensión o reajuste de haberes', '[
  {"nombre": "DNI (frente y dorso)", "obligatorio": true},
  {"nombre": "Constancia de CUIL", "obligatorio": true},
  {"nombre": "Historia laboral (Mi ANSES)", "obligatorio": true},
  {"nombre": "Resolución de otorgamiento del beneficio", "obligatorio": false},
  {"nombre": "Recibos de haberes", "obligatorio": false},
  {"nombre": "Certificaciones de servicios", "obligatorio": false}
]'::jsonb, NULL),
('Familia — Alimentos', 'Cuota alimentaria', '[
  {"nombre": "DNI de quien reclama", "obligatorio": true},
  {"nombre": "Partidas de nacimiento de los hijos", "obligatorio": true},
  {"nombre": "Comprobantes de gastos (escuela, salud, vivienda)", "obligatorio": true},
  {"nombre": "Datos laborales e ingresos del alimentante", "obligatorio": false},
  {"nombre": "Datos del otro progenitor (DNI, domicilio)", "obligatorio": true}
]'::jsonb, NULL),
('Familia — Divorcio', 'Divorcio unilateral o conjunto', '[
  {"nombre": "DNI (frente y dorso)", "obligatorio": true},
  {"nombre": "Acta de matrimonio", "obligatorio": true},
  {"nombre": "Partidas de nacimiento de los hijos", "obligatorio": false},
  {"nombre": "Propuesta de convenio regulador", "obligatorio": false},
  {"nombre": "Detalle de bienes en común", "obligatorio": false},
  {"nombre": "Último domicilio conyugal", "obligatorio": true}
]'::jsonb, NULL),
('Civil — Accidente de tránsito', 'Daños y perjuicios por accidente de tránsito', '[
  {"nombre": "DNI (frente y dorso)", "obligatorio": true},
  {"nombre": "Licencia de conducir", "obligatorio": false},
  {"nombre": "Cédula del vehículo / título", "obligatorio": false},
  {"nombre": "Póliza de seguro", "obligatorio": false},
  {"nombre": "Denuncia policial o ante la aseguradora", "obligatorio": true},
  {"nombre": "Fotos del siniestro y de los daños", "obligatorio": true},
  {"nombre": "Presupuestos de reparación", "obligatorio": false},
  {"nombre": "Historia clínica y certificados médicos", "obligatorio": false},
  {"nombre": "Datos del otro conductor y su seguro", "obligatorio": true},
  {"nombre": "Testigos (nombre y teléfono)", "obligatorio": false}
]'::jsonb, NULL)
ON CONFLICT (nombre) DO NOTHING;

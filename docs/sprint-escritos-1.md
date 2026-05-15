# Sprint 1 — Módulo de Escritos con IA

**Estado:** completado, typecheck verde. Falta aplicar migración a Supabase y deployar la edge function.

## Decisiones de diseño clave

- **El LLM devuelve JSON estructurado, no texto libre.** Esto garantiza que el render salga idéntico al modelo del usuario (logo `mr-logo-azul.svg` centrado, Times New Roman 12pt, sangría de 5cm, secciones centradas/subrayadas, justificación). El modelo nunca decide el formato — solo aporta el contenido.
- **Registro tonal por tipo de escrito** (en system prompt de la edge function):
  - *Retórico* (alegato, contestación con valoración de prueba, recurso): frases largas con subordinadas, conectores adversativos ("no obstante", "sin perjuicio de"), lectura crítica de la prueba contraria, énfasis en lo que la otra parte omite. Insinuar inverosimilitud sin afirmarla cruda.
  - *Procesal* (pronto despacho, oficio, ofrecimiento de prueba): frases cortas, claras, sin retórica.
- **Solo actuaciones claves van al prompt**, nunca el historial completo del SAE. El usuario marca con estrella desde tab SAE o tab Claves.
- **Datos profesionales del abogado** (matrícula, libro/folio, domicilio legal, CUIT, casillero) viven en `profiles` y se cargan una sola vez desde `/configuracion`. Bloquean el módulo si faltan.

## Archivos creados / modificados

### Backend
- `supabase/migrations/00036_escritos.sql` — agrega columnas a `profiles`, tablas `escrito_templates` y `escritos`, RLS, bucket `escritos-templates`.
- `supabase/functions/escritos-generate/index.ts` — recibe `expediente_id`, `tipo`, `titulo?`, `instrucciones?`; arma contexto con actuaciones claves; llama al LLM; persiste el escrito como JSON.

### Frontend
- `frontend/src/pages/configuracion.tsx` — bloque "Datos profesionales" con matrícula, libro, folio, domicilio legal, CUIT (validado a 11 dígitos), casillero. Bandera "Listos para escritos" / "Requeridos".
- `frontend/src/hooks/use-escritos.ts` — queries: `useEscritos`, `useEscritoTiposPrevios`; mutations: `useGenerateEscrito`, `useUpdateEscrito`, `useDeleteEscrito`.
- `frontend/src/components/expedientes/escrito-preview.tsx` — render pixel-perfect (logo SVG, Times, A4, sangrías). Usa `forwardRef` para que el modal pueda imprimir.
- `frontend/src/components/expedientes/tab-escritos.tsx` — dialog "Nuevo escrito" con datalist de tipos sugeridos + previos del usuario; editor full-screen split (forma editable + preview en vivo); print/PDF vía `window.print`.
- `frontend/src/pages/expediente-detail.tsx` — pasa `expedienteId` al tab.

## Tipos sugeridos por defecto (libres, el usuario puede escribir cualquier otro)

Contestación de demanda, Contestación de traslado, Alegato, Recurso de apelación, Recurso de reposición, Pronto despacho, Ofrecimiento de prueba, Oficio, Memorial, Expresión de agravios.

## Pendientes inmediatos

1. **Aplicar migración** `00036_escritos.sql` en Supabase (remoto o local con `supabase db push`).
2. **Deploy** de `escritos-generate` (`supabase functions deploy escritos-generate`).
3. **Probar end-to-end** en browser: cargar datos profesionales → generar un escrito → editar → imprimir.

## Sprint 2 (pendiente del diseño completo)

Carga y análisis de **plantillas del usuario**: subir PDF/DOCX al bucket `escritos-templates`, extraer texto, correr análisis con IA (`escrito_templates.analysis` jsonb: secciones, tono, muletillas, estructura de encabezado, formato de firma) y que el módulo de generación use esa plantilla como base de estilo para imitar la voz del abogado.

## Convenciones del módulo

- Path en bucket `escritos-templates`: `<user_id>/<template_id>.<ext>`.
- `escritos.contenido` shape: `{ titulo, encabezado_juez, caratula, secciones: [{ titulo, parrafos: string[] }] }`.
- `escritos.registro_tonal`: `'retorico' | 'procesal'` (decidido por la edge function según tipo).
- RLS: el autor o cualquier miembro del expediente puede ver; solo autor o ADMIN edita/elimina.

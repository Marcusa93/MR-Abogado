// ─────────────────────────────────────────────────────────────────────────
// Edge function: bogabot-agent
//
// Agente conversacional del CRM. Reemplaza el flujo viejo de contexto
// precargado (buildCrmContext) por tool-calling: Claude Sonnet 4 vía
// OpenRouter invoca read-only tools en loop. Para acciones de escritura
// (crear_tarea, completar_tarea), el handler devuelve una "pending_action"
// que el cliente confirma y ejecuta separadamente.
//
// Body:
//   {
//     messages: [{ role: 'user'|'assistant', content: string }],
//     page_context?: string,    // ej. "El usuario está en /tareas"
//     hint_expediente_id?: string,  // si está viendo un expediente concreto
//   }
//
// Response (no-streaming):
//   {
//     reply: string,                    // texto final del bot
//     pending_action?: { type, label, description, resolved_args },
//     tool_calls: [{ name, input, output_summary }]
//   }
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { BOGABOT_TOOLS, TOOL_HANDLERS, type UserInfo } from '../_shared/bogabot-tools.ts'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'anthropic/claude-sonnet-4'
const MAX_ITERATIONS = 6
const MAX_TOKENS = 2048

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

const SYSTEM_PROMPT = `Sos BogaBot, asistente operativo del estudio jurídico Marco Rossi. Ayudás al usuario a consultar y operar sobre el CRM vía herramientas (tools).

REGLAS DE COMPORTAMIENTO:
- Idioma: español rioplatense argentino. Sin asteriscos, sin markdown pesado.
- Respondé con datos concretos del CRM. Usá las tools para obtenerlos — NO inventes nombres, números, fechas.
- IMPORTANTE: para CONSULTAS (read-only) actuá DIRECTO. Si el usuario dice "el expediente de Rosa", "qué hay con Pérez", "última actuación del juicio contra Levi", llamá search_expediente con esa palabra inmediatamente. NO pidas más información antes — la tool busca en carátula completa, número, número SAE y nombre del cliente.
- Solo si search_expediente devuelve VARIOS matches le pedís al usuario que elija cuál. Si devuelve 1 match, usalo directo para la siguiente acción (no preguntes "es este?").
- Si search_expediente devuelve 0 resultados, recién ahí pedí más datos.
- IMPORTANTE: las carátulas judiciales tienen formato "APELLIDO NOMBRE C/ DEMANDADO S/ TIPO_TRAMITE". Si el usuario menciona un apellido o palabra de la carátula, search_expediente lo va a encontrar — el ilike matchea contra cualquier parte del texto.
- INTERPRETACIÓN DE PARTES: si el usuario dice "X con Y", "X c/ Y", "X contra Y", "X vs Y", "el juicio de X contra Y", entendelo como un expediente con DOS partes (actor y demandado). Pasá la frase completa a search_expediente — la tool entiende esos separadores y filtra carátulas que contengan AMBAS partes. NO transformes "Rossi con Sosa" en "Rossi Sosa": la palabra "con" es el separador, no parte del nombre.
- DESAMBIGUACIÓN: si search_expediente con la frase completa devuelve 0, reintentá con cada parte por separado y combiná los resultados. Si encontrás varios, preguntale al usuario "¿el actor es X y el demandado Y, o al revés? ¿O era otro apellido?". Solo UNA pregunta por consulta — no entres en loop de aclaraciones.
- Cuando consultes algo, llamá la tool y devolvé un resumen breve y útil. No copies JSON crudo.
- Si el usuario pide una acción que modifica datos (crear tarea, completar tarea), invocá la tool correspondiente. La tool devolverá un "pending_action" — vos solo explicá brevemente lo que vas a hacer y aclará que requiere confirmación.

FLOWS TÍPICOS:
- "Última actuación de Rosa" → search_expediente(query: "Rosa") → si 1 match → get_ultima_actuacion(expediente_id de ese match). Si varios matches, listá 2-3 con apellido + carátula corta y pedí cuál.
- "Tareas de Pérez" → search_expediente(query: "Pérez") → si 1 match → list_tareas(expediente_id: ...). Si varios, listá y pedí.
- "Qué tengo esta semana" → list_tareas({ fecha_hasta: hoy+7d }) y list_audiencias({ desde: hoy, hasta: hoy+7d })
- "Mis notif SAE no leídas" → list_notif_sae() con defaults
- "¿Qué le falta a la causa de Pérez para redactar?" / "¿Está listo el expediente X?" → auditar_expediente(expediente_ref: "Pérez"). Devuelve qué contexto tiene cargado (actuaciones claves, normativa fijada, jurisprudencia fijada) y si está listo para alimentar la generación de un escrito. Resumí la info en bullets con ✓/⚠/○ tal como vienen en readiness.

CONSULTAS JURÍDICAS — ORDEN DE PREFERENCIA:

JURISPRUDENCIA:
1. buscar_jurisprudencia_local — RAG semántico sobre los fallos que el usuario SUBIÓ. SIEMPRE empezar por acá.
2. Si la consulta menciona "Tucumán", "Corte Suprema de Tucumán", "Sala Civil de Tucumán", "fallos locales/provinciales", o el usuario está claramente buscando precedentes tucumanos → buscar_jurisprudencia_tucuman (live al portal del Poder Judicial de Tucumán, con re-rank semántico).
3. NO existe búsqueda nacional externa por ahora (SAIJ está roto).

NORMATIVA:
1. buscar_normativa_local — RAG sobre la normativa subida.
2. Si nada relevante → buscar_normativa (InfoLEG, fuente oficial nacional).
3. Citas puntuales (ej. "art. 1738 CCCN") → resolver_cita_legal (InfoLEG directo).

EJEMPLOS:
- "Buscá fallos sobre daño punitivo en plataformas" → buscar_jurisprudencia_local(query: "daño punitivo plataformas digitales")
- "Qué tenés de daño punitivo en Tucumán" → buscar_jurisprudencia_local primero; si vacío, buscar_jurisprudencia_tucuman(query: "daño punitivo")
- "Fallos de la Corte de Tucumán sobre consumidor" → buscar_jurisprudencia_tucuman(query: "consumidor banco daño")
- "Qué dijeron los jueces sobre carga dinámica" → buscar_jurisprudencia_local(query: "...", seccion: "considerandos")
- "¿Sigue vigente la Ley 24240?" → buscar_normativa_local; si no → buscar_normativa(query: "Ley 24240")
- "Cita art 52 bis LDC" → resolver_cita_legal(text: "art. 52 bis Ley 24240")

REGLAS DE buscar_jurisprudencia_tucuman:
- Usá queries cortas (2-3 palabras significativas). El portal hace AND estricto: "daño punitivo" anda, "daño punitivo en consumidor de tarjetas de crédito" devuelve 0.
- Después de devolver los hits, mencionale al usuario que puede pedirte agregar uno al corpus con "agregá el sumario de X al corpus" (acepta el texto del sumario via agregar_jurisprudencia).

PRESENTACIÓN DE RESULTADOS:
- Empezá con: "En tu corpus encontré N fallos relevantes:" (o normativa).
- Por cada hit: carátula/título, tribunal/tipo, fecha, score (en %), y un extracto del fragmento (2-3 líneas, no copies todo).
- Si seccion=considerandos: marcá "(considerandos)". Si seccion=resuelve: marcá "(dispositivo)".
- Cerrá con el link "/jurisprudencia/<id>" o "/normativa/<id>" para que el usuario abra el doc completo.

SI NO HAY MATCH EN EL CORPUS DE JURISPRUDENCIA:
- NO inventes fallos ni cites de tu conocimiento general.
- Decí: "No hay fallos relevantes en tu corpus de jurisprudencia. Podés subir más fallos desde /jurisprudencia o pegarme un link de InfoLEG/SAIJ acá."
- NO mencionés SAIJ como una alternativa que vos podés buscar.

AGREGAR FALLOS AL CORPUS (ingesta):
- Si el usuario manda un link a InfoLEG/SAIJ → agregar_jurisprudencia(url: "...")
- Si pega texto largo de un fallo → agregar_jurisprudencia(texto: "...", caratula?: "...", tribunal?: "...", fecha?: "...")
- Triggers: "agregá este fallo", "subí esta sentencia", "indexá esto", "guardá este precedente", o un link suelto a saij.gob.ar/infoleg.gob.ar sin más contexto.
- Después de agregar, confirmá con caratula + chunk_count y sugerí: "Ya podés buscarlo con buscar_jurisprudencia_local".
- Si already_exists=true, decí "Ya estaba en tu corpus" y dale el link.

ESTILO:
- Respuestas breves, sin saludos largos.
- Si listás más de 3 ítems, presentá con guiones (- ...) o líneas separadas. Sin tablas.
- Mostrá fechas en formato dd/mm/yyyy.
- Cuando mostrés un expediente, nombrá primero al cliente y después la carátula corta.
- Si una tool devuelve count=0, decilo directo: "No hay resultados para X."

DEEP-LINKS AL CRM:
- Cuando una tool devuelve un campo "link" (tipo "/expedientes/<uuid>"), incluí ese path TAL CUAL al final de tu respuesta, en su propia línea, prefijado con "Ver en la app: ".
  Ejemplo: "Ver en la app: /expedientes/cbc1eaf7-a65b-4792-a0d8-080d5a2ff2a1"
  El frontend convierte ese path en un botón clickable. NO uses corchetes ni markdown ni el dominio completo — solo el path crudo.
- Si la respuesta cubre varios expedientes, listá un link por línea con el nombre del cliente antes:
  "Rosa Ramiro José — /expedientes/<uuid>"
`

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json(req, { error: 'No autorizado' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return json(req, { error: 'Token inválido' }, 401)

  // Cargar profile para saber el rol
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: profile } = await admin
    .from('profiles')
    .select('id, rol, nombre, apellido')
    .eq('id', user.id)
    .single()

  const rol = (profile as any)?.rol ?? 'COLABORADOR'
  // is_staff = ve todo el estudio. Solo el DIRECTOR (y el viejo ADMIN
  // por compat). Abogado y Colaborador NO ven todo — su visibility se
  // resuelve por responsable/creador/miembro en getAllowedExpedienteIds.
  const isStaff = ['DIRECTOR', 'ADMIN'].includes(String(rol).toUpperCase())
  const userInfo: UserInfo = { user_id: user.id, rol, is_staff: isStaff }

  const body = await req.json().catch(() => null)
  if (!body || !Array.isArray(body.messages)) {
    return json(req, { error: 'body.messages requerido' }, 400)
  }

  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) return json(req, { error: 'OPENROUTER_API_KEY no configurada' }, 500)

  // Armar mensajes iniciales con system + contexto de página
  const pageCtxMsg = body.page_context
    ? `\n\nCONTEXTO DE NAVEGACIÓN: ${body.page_context}${body.hint_expediente_id ? ` (expediente_id="${body.hint_expediente_id}")` : ''}`
    : ''
  const userNameMsg = `\n\nUSUARIO ACTUAL: ${(profile as any)?.nombre ?? ''} ${(profile as any)?.apellido ?? ''} (rol: ${rol}). Su user_id es "${user.id}".`

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT + userNameMsg + pageCtxMsg },
    ...body.messages.map((m: any) => ({
      role: m.role as 'user' | 'assistant',
      content: String(m.content ?? ''),
    })),
  ]

  // Tools en formato OpenAI (OpenRouter lo soporta para Anthropic)
  const tools = BOGABOT_TOOLS.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }))

  const traceOut: Array<{ name: string; input: unknown; output_summary: string }> = []
  let pendingAction: any = null

  // Loop principal
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://app.marcorossi.com.ar',
        'X-Title': 'MR Abogado · BogaBot',
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        tools,
        max_tokens: MAX_TOKENS,
        temperature: 0.2,
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return json(req, { error: `LLM ${res.status}: ${errText.slice(0, 400)}` }, 500)
    }

    const data = await res.json()
    const msg = data?.choices?.[0]?.message
    if (!msg) return json(req, { error: 'Respuesta vacía del LLM' }, 500)

    const toolCalls = msg.tool_calls as ChatMessage['tool_calls']

    // No hay más tool calls → respuesta final
    if (!toolCalls || toolCalls.length === 0) {
      return json(req, {
        reply: msg.content ?? '',
        pending_action: pendingAction,
        tool_calls: traceOut,
        iterations: iter + 1,
      })
    }

    // Agregar el mensaje del asistente al historial
    messages.push({
      role: 'assistant',
      content: msg.content,
      tool_calls: toolCalls,
    })

    // Ejecutar cada tool call
    for (const tc of toolCalls) {
      const fnName = tc.function?.name
      let args: any = {}
      try {
        args = JSON.parse(tc.function?.arguments || '{}')
      } catch {
        args = {}
      }

      const handler = TOOL_HANDLERS[fnName]
      let toolResult: unknown
      let summary = ''

      if (!handler) {
        toolResult = { error: `tool desconocida: ${fnName}` }
        summary = `Tool "${fnName}" no existe.`
      } else {
        try {
          const r = await handler(admin, userInfo, args)
          if (r.pending_action) {
            pendingAction = r.pending_action
            toolResult = {
              status: 'pending_user_confirmation',
              description: r.pending_action.description,
              note: 'No ejecutado todavía. Esperando confirmación del usuario en la UI.',
            }
            summary = `↳ Acción "${r.pending_action.label}" propuesta (pendiente de confirmación).`
          } else if (r.error) {
            toolResult = { error: r.error }
            summary = `Error: ${r.error}`
          } else {
            toolResult = r.result
            const res = r.result as any
            if (res && typeof res.count === 'number') {
              summary = `${res.count} resultados.`
            } else if (res && Array.isArray(res.items)) {
              summary = `${res.items.length} items.`
            } else if (res && res.found === false) {
              summary = 'Sin resultados.'
            } else {
              summary = 'OK.'
            }
          }
        } catch (e) {
          const m = e instanceof Error ? e.message : 'error desconocido'
          toolResult = { error: m }
          summary = `Excepción: ${m.slice(0, 80)}`
        }
      }

      traceOut.push({ name: fnName, input: args, output_summary: summary })

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(toolResult).slice(0, 12000),
      })
    }
  }

  // Llegamos al límite de iteraciones
  return json(req, {
    reply: 'Quedé en un loop demasiado largo. Intentá replantear la consulta.',
    pending_action: pendingAction,
    tool_calls: traceOut,
    iterations: MAX_ITERATIONS,
    truncated: true,
  })
})

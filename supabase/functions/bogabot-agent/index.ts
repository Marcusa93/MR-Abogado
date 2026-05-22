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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const SYSTEM_PROMPT = `Sos BogaBot, asistente operativo del estudio jurídico Marco Rossi. Ayudás al usuario a consultar y operar sobre el CRM via herramientas (tools).

REGLAS DE COMPORTAMIENTO:
- Idioma: español rioplatense argentino. Sin asteriscos, sin markdown pesado.
- Respondé con datos concretos del CRM. Usá las tools para obtenerlos — NO inventes nombres, números, fechas.
- Si la consulta es ambigua (varios expedientes o clientes posibles), pedile precisión antes de hacer acciones.
- Cuando consultes algo, llamá la tool y después devolvé un resumen breve y útil. No vuelvas a copiar el JSON crudo.
- Si el usuario pide una acción que modifica datos (crear tarea, completar tarea), invocá la tool correspondiente. La tool devolverá un "pending_action" — vos solo explicá brevemente lo que vas a hacer y aclará que requiere confirmación.

REGLAS PARA TOOLS:
- search_expediente cuando el usuario mencione un cliente o expediente por nombre/número y no tengas el id.
- get_expediente / get_ultima_actuacion cuando ya tengas el id y quieras detalle.
- list_tareas / list_audiencias / list_notif_sae con los filtros mínimos necesarios.
- Para acciones de escritura, primero asegurate de tener el contexto. Si no sabés a qué expediente refiere o quién es el asignado, pedí precisión.

ESTILO:
- Respuestas breves, sin saludos largos.
- Si listás más de 3 ítems, presentá con guiones (- ...) o líneas separadas. Sin tablas.
- Mostrá fechas en formato dd/mm/yyyy.
- Cuando mostrés un expediente, nombrá primero al cliente, después la carátula.
- Si una tool devuelve count=0, decilo directo: "No hay resultados para X."
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'No autorizado' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return json({ error: 'Token inválido' }, 401)

  // Cargar profile para saber el rol
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: profile } = await admin
    .from('profiles')
    .select('id, rol, nombre, apellido')
    .eq('id', user.id)
    .single()

  const rol = (profile as any)?.rol ?? 'colaborador'
  const isStaff = ['admin', 'abogado'].includes(rol.toLowerCase())
  const userInfo: UserInfo = { user_id: user.id, rol, is_staff: isStaff }

  const body = await req.json().catch(() => null)
  if (!body || !Array.isArray(body.messages)) {
    return json({ error: 'body.messages requerido' }, 400)
  }

  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) return json({ error: 'OPENROUTER_API_KEY no configurada' }, 500)

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
      return json({ error: `LLM ${res.status}: ${errText.slice(0, 400)}` }, 500)
    }

    const data = await res.json()
    const msg = data?.choices?.[0]?.message
    if (!msg) return json({ error: 'Respuesta vacía del LLM' }, 500)

    const toolCalls = msg.tool_calls as ChatMessage['tool_calls']

    // No hay más tool calls → respuesta final
    if (!toolCalls || toolCalls.length === 0) {
      return json({
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
  return json({
    reply: 'Quedé en un loop demasiado largo. Intentá replantear la consulta.',
    pending_action: pendingAction,
    tool_calls: traceOut,
    iterations: MAX_ITERATIONS,
    truncated: true,
  })
})

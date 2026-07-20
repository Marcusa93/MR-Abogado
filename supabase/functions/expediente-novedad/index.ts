import { corsHeaders } from '../_shared/cors.ts'
import { checkLlmGuard, logLlmCall, estimateBytes } from '../_shared/llm-guard.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const FUNCTION_NAME = 'expediente-novedad'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

interface TareaPropuesta {
  titulo: string
  descripcion: string | null
  fecha_vencimiento: string | null
  prioridad: 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY')!

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json(req, { error: 'No autorizado' }, 401)

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json(req, { error: 'No autorizado' }, 401)

  const adminClient = createClient(supabaseUrl, serviceKey)

  let body: { expediente_id?: string; texto?: string }
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'Body inválido' }, 400)
  }

  const { expediente_id, texto } = body
  if (!expediente_id || !texto?.trim()) {
    return json(req, { error: 'Se requiere expediente_id y texto' }, 400)
  }

  const inputBytes = estimateBytes(texto)
  const guard = await checkLlmGuard(adminClient, user.id, FUNCTION_NAME, inputBytes)
  if (!guard.ok) return json(req, { error: guard.error }, guard.status)

  // Contexto del expediente
  const { data: expediente } = await adminClient
    .from('expedientes')
    .select(`
      numero, caratula, fuero, estado_interno,
      clientes:cliente_id (nombre, apellido),
      organismos:organismo_id (nombre)
    `)
    .eq('id', expediente_id)
    .single()

  if (!expediente) return json(req, { error: 'Expediente no encontrado' }, 404)

  // Novedades previas para contexto
  const { data: previas } = await adminClient
    .from('expediente_novedades')
    .select('nota, created_at')
    .eq('expediente_id', expediente_id)
    .order('created_at', { ascending: false })
    .limit(5)

  const cliente = (expediente.clientes as any)
    ? `${(expediente.clientes as any).nombre ?? ''} ${(expediente.clientes as any).apellido ?? ''}`.trim()
    : 'desconocido'
  const organismo = (expediente.organismos as any)?.nombre ?? 'sin organismo'
  const fechaHoy = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Tucuman' })

  const contextoPrevio = previas?.length
    ? previas.map(p => {
        const f = new Date(p.created_at).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Tucuman' })
        return `[${f}] ${p.nota}`
      }).join('\n')
    : '(sin novedades previas)'

  const systemPrompt = `Sos un asistente jurídico del Dr. Marco Rossi, abogado en Tucumán, Argentina (derecho civil, laboral, familia, previsional).

Tu tarea: dado un texto libre dictado por el abogado sobre novedades de un expediente, producir:
1. Una "nota" limpia y concisa para el log del expediente (2 a 4 oraciones, tono procesal argentino, sin inventar hechos).
2. Una lista de tareas procesables que se desprenden de la novedad, con fecha de vencimiento si la hay.

REGLAS:
- Usá los términos exactos que el abogado menciona (si dice "27/07", usá esa fecha como fecha_vencimiento en formato YYYY-MM-DD).
- Si el abogado describe un plazo pero no da la fecha exacta, calculá desde el contexto si podés; si no, dejá fecha_vencimiento null y mencionalo en descripcion.
- Prioridad: URGENTE si hay plazo inminente (≤3 días), ALTA si hay plazo concreto, MEDIA por defecto, BAJA para tareas sin urgencia.
- NO inventes tareas que no estén mencionadas o implícitas en el texto.
- La nota debe mencionar la fecha del evento si el abogado la da.

FORMATO DE RESPUESTA: JSON puro sin markdown:
{
  "nota": "string",
  "tareas_propuestas": [
    {
      "titulo": "string",
      "descripcion": "string o null",
      "fecha_vencimiento": "YYYY-MM-DD o null",
      "prioridad": "BAJA|MEDIA|ALTA|URGENTE"
    }
  ]
}`

  const userPrompt = `Fecha de hoy: ${fechaHoy}

EXPEDIENTE:
- Número: ${(expediente as any).numero ?? '-'}
- Carátula: ${(expediente as any).caratula ?? '-'}
- Fuero: ${(expediente as any).fuero ?? '-'}
- Estado: ${(expediente as any).estado_interno}
- Cliente: ${cliente}
- Tribunal: ${organismo}

NOVEDADES PREVIAS (para contexto):
${contextoPrevio}

NOVEDAD DICTADA POR EL ABOGADO:
"${texto.trim()}"`

  const llmRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openrouterKey}`,
      'HTTP-Referer': 'https://app.marcorossi.com.ar',
      'X-Title': 'MR Abogado · Novedad expediente',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 1500,
    }),
  })

  if (!llmRes.ok) {
    const txt = await llmRes.text().catch(() => '')
    return json(req, { error: `LLM error ${llmRes.status}: ${txt.slice(0, 300)}` }, 500)
  }

  const llmData = await llmRes.json() as {
    choices?: Array<{ message: { content: string }; finish_reason?: string }>
    error?: { message?: string }
  }

  if (llmData.error) return json(req, { error: `Error IA: ${llmData.error.message}` }, 500)
  if (!llmData.choices?.length) return json(req, { error: 'Sin respuesta del modelo.' }, 500)

  const raw = llmData.choices[0].message?.content ?? ''
  if (llmData.choices[0].finish_reason === 'length') {
    return json(req, { error: 'La respuesta fue demasiado larga.' }, 500)
  }

  let resultado: { nota: string; tareas_propuestas: TareaPropuesta[] }
  try {
    let cleaned = raw.replace(/```(?:json)?/gi, '').trim()
    const s = cleaned.indexOf('{')
    const e = cleaned.lastIndexOf('}')
    if (s !== -1 && e > s) cleaned = cleaned.slice(s, e + 1)
    resultado = JSON.parse(cleaned)
  } catch {
    return json(req, { error: 'El modelo devolvió un formato inesperado. Intentá de nuevo.' }, 500)
  }

  if (typeof resultado?.nota !== 'string' || !Array.isArray(resultado?.tareas_propuestas)) {
    return json(req, { error: 'Formato de respuesta inesperado.' }, 500)
  }

  logLlmCall(adminClient, user.id, FUNCTION_NAME, inputBytes)

  return json(req, {
    ok: true,
    nota: resultado.nota,
    tareas_propuestas: resultado.tareas_propuestas,
  })
})

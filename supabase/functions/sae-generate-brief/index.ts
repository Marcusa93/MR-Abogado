// On-demand brief generation for an expediente.
// Body: { expediente_id: string }
// Returns: { brief: string, model: string, generated_at: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_MODEL = 'anthropic/claude-3.5-haiku'

const SYSTEM_PROMPT = `Sos un asistente jurídico que sintetiza expedientes judiciales argentinos.

A partir del contexto del expediente y los resúmenes de actuaciones que te paso, escribís un brief narrativo de 3 a 5 párrafos cortos que cubra:

1. **Datos clave**: tipo de juicio, partes principales, monto si aplica.
2. **Estado procesal actual**: en qué etapa está (prueba, alegatos, sentencia, etc.) y qué fue lo último relevante que pasó.
3. **Hitos importantes**: sentencias, recursos, audiencias destacadas en orden cronológico inverso (más reciente primero).
4. **Próximos pasos / pendientes**: si hay plazos vigentes, audiencias agendadas o acciones a tomar.
5. **Riesgos u observaciones**: solo si surgen explícitamente del material (no especules).

Reglas:
- Usá español neutro y conciso, sin jerga rebuscada.
- NO inventes hechos ni fechas que no estén en el material.
- Si falta información, decilo ("no se observan actuaciones recientes").
- No empieces con "Este expediente..." — andá directo al contenido.
- Devolvé SOLO el brief en texto plano. Sin markdown, sin headers, sin viñetas.`

interface ExpedienteRow {
  id: string
  numero: string | null
  caratula: string | null
  numero_sae: string | null
  fuero: string | null
  estado_interno: string | null
  observaciones: string | null
  cliente: { nombre: string | null; apellido: string | null } | { nombre: string | null; apellido: string | null }[] | null
}

interface MovementRow {
  id: string
  fecha: string
  titulo: string
  tipo_movimiento: string
  ai_summary: string | null
  ai_extracted: { partes?: string[]; fechas?: { tipo: string; fecha_iso: string; descripcion: string }[]; plazos?: { dias: number; habiles: boolean; vence_aprox: string | null; descripcion: string }[] } | null
  cuerpo: string | null
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const apiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!apiKey) return json({ error: 'OPENROUTER_API_KEY no configurada' }, 500)

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) return json({ error: 'No autorizado' }, 401)

    const body = await req.json().catch(() => null) as { expediente_id?: string } | null
    if (!body?.expediente_id) return json({ error: 'expediente_id requerido' }, 400)

    // Verify ownership via RLS-respecting client
    const { data: expedienteAuth, error: authExpError } = await anonClient
      .from('expedientes')
      .select('id')
      .eq('id', body.expediente_id)
      .maybeSingle()
    if (authExpError || !expedienteAuth) return json({ error: 'Expediente no encontrado o sin permisos' }, 404)

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Fetch expediente metadata
    const { data: exp, error: expError } = await serviceClient
      .from('expedientes')
      .select('id, numero, caratula, numero_sae, fuero, estado_interno, observaciones, cliente:clientes(nombre, apellido)')
      .eq('id', body.expediente_id)
      .single()
    if (expError || !exp) return json({ error: 'Expediente no encontrado' }, 404)

    const expRow = exp as unknown as ExpedienteRow

    // Fetch movements (most recent first; cap to keep token cost reasonable)
    const { data: movements, error: movError } = await serviceClient
      .from('sae_movements')
      .select('id, fecha, titulo, tipo_movimiento, ai_summary, ai_extracted, cuerpo')
      .eq('expediente_id', body.expediente_id)
      .order('fecha', { ascending: false })
      .limit(40)
    if (movError) throw movError

    const movs = (movements ?? []) as unknown as MovementRow[]

    if (movs.length === 0) {
      return json({ error: 'El expediente no tiene actuaciones SAE para resumir.' }, 400)
    }

    // Build context
    const cliente = Array.isArray(expRow.cliente) ? expRow.cliente[0] : expRow.cliente
    const clienteNombre = cliente
      ? `${cliente.apellido ?? ''} ${cliente.nombre ?? ''}`.trim()
      : 'Sin cliente registrado'

    const expContext = `EXPEDIENTE
Número interno: ${expRow.numero ?? 's/n'}
Número SAE: ${expRow.numero_sae ?? 's/n'}
Carátula: ${expRow.caratula ?? 's/n'}
Fuero: ${expRow.fuero ?? 's/n'}
Estado interno: ${expRow.estado_interno ?? 's/n'}
Cliente: ${clienteNombre}
Observaciones: ${expRow.observaciones ?? '(ninguna)'}`

    const movContext = movs.map((m, idx) => {
      const summary = m.ai_summary ?? (m.cuerpo?.trim()?.slice(0, 400) ?? '(sin resumen)')
      const partes = m.ai_extracted?.partes?.join(', ')
      const plazos = m.ai_extracted?.plazos?.map(p => `${p.dias} ${p.habiles ? 'días háb.' : 'días'} ${p.vence_aprox ? `(vence ${p.vence_aprox})` : ''}: ${p.descripcion}`).join('; ')
      const fechas = m.ai_extracted?.fechas?.map(f => `${f.tipo} ${f.fecha_iso}: ${f.descripcion}`).join('; ')
      return `--- Actuación ${idx + 1} ---
Fecha: ${m.fecha}
Tipo: ${m.tipo_movimiento}
Título: ${m.titulo}
Resumen: ${summary}${partes ? `\nPartes: ${partes}` : ''}${plazos ? `\nPlazos: ${plazos}` : ''}${fechas ? `\nFechas: ${fechas}` : ''}`
    }).join('\n\n')

    const userMessage = `${expContext}

ACTUACIONES (más recientes primero, máx 40):
${movContext}`

    const aiRes = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://app.marcorossi.com.ar',
        'X-Title': 'MR Abogado Brief',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.2,
        max_tokens: 1200,
      }),
    })

    if (!aiRes.ok) {
      const txt = await aiRes.text()
      return json({ error: `OpenRouter ${aiRes.status}: ${txt.slice(0, 200)}` }, 502)
    }

    const payload = await aiRes.json() as { choices?: { message?: { content?: string } }[] }
    const brief = payload.choices?.[0]?.message?.content?.trim()
    if (!brief) return json({ error: 'OpenRouter no devolvió contenido' }, 502)

    const generatedAt = new Date().toISOString()
    await serviceClient
      .from('expedientes')
      .update({
        ai_brief: brief,
        ai_brief_generated_at: generatedAt,
        ai_brief_model: DEFAULT_MODEL,
      })
      .eq('id', body.expediente_id)

    return json({ brief, model: DEFAULT_MODEL, generated_at: generatedAt })

  } catch (err) {
    console.error('[sae-generate-brief]', err)
    return json({ error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

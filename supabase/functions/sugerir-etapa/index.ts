// Sugiere la etapa procesal de un expediente a partir de sus actuaciones SAE.
// Devuelve { etapa, razon }. El usuario confirma en la UI.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { checkLlmGuard, logLlmCall } from '../_shared/llm-guard.ts'

const FUNCTION_NAME = 'sugerir-etapa'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

const ETAPAS = [
  'Demanda', 'Contestación', 'Apertura a prueba', 'Etapa probatoria',
  'Alegatos', 'Sentencia', 'Apelación', 'Ejecución', 'Archivo',
]

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  try {
    const apiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!apiKey) return json(req, { error: 'OPENROUTER_API_KEY no configurada' }, 500)

    const anon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user }, error: authErr } = await anon.auth.getUser()
    if (authErr || !user) return json(req, { error: 'No autorizado' }, 401)

    const body = await req.json().catch(() => null) as { expediente_id?: string } | null
    if (!body?.expediente_id) return json(req, { error: 'expediente_id requerido' }, 400)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const guard = await checkLlmGuard(admin, user.id, FUNCTION_NAME, 50_000)
    if (!guard.ok) return json(req, { error: guard.error }, guard.status)

    const { data: exp } = await admin.from('expedientes')
      .select('caratula, fuero, etapa_procesal').eq('id', body.expediente_id).maybeSingle()

    const { data: movs } = await admin.from('sae_movements')
      .select('fecha, titulo, tipo_movimiento, ai_summary')
      .eq('expediente_id', body.expediente_id)
      .order('fecha', { ascending: false }).limit(25)

    if (!movs || movs.length === 0) {
      return json(req, { error: 'No hay actuaciones para inferir la etapa' }, 422)
    }

    const contexto = (movs as { fecha: string; titulo: string; tipo_movimiento: string; ai_summary: string | null }[])
      .map((m) => `- ${m.fecha} (${m.tipo_movimiento}): ${m.titulo}${m.ai_summary ? ` — ${m.ai_summary}` : ''}`)
      .join('\n')

    const systemPrompt = `Sos un asistente jurídico argentino. A partir de las actuaciones de un expediente, inferís en qué ETAPA PROCESAL está.
Elegí preferentemente una de estas etapas típicas: ${ETAPAS.join(', ')}.
Si ninguna encaja, proponé una etapa breve y precisa (texto libre).
Fijate en las actuaciones MÁS RECIENTES (arriba de la lista) para determinar la etapa actual.
Devolvé SOLO un JSON válido: {"etapa": "la etapa actual", "razon": "una frase corta que la justifique citando la actuación clave"}.`

    const userMsg = `Carátula: ${(exp as { caratula?: string } | null)?.caratula ?? 's/d'}
Fuero: ${(exp as { fuero?: string } | null)?.fuero ?? 's/d'}
${(exp as { etapa_procesal?: string } | null)?.etapa_procesal ? `Etapa marcada actualmente: ${(exp as { etapa_procesal?: string }).etapa_procesal}` : ''}

Actuaciones (más recientes primero):
${contexto}`

    logLlmCall(admin, user.id, FUNCTION_NAME, contexto.length)
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://app.marcorossi.com.ar',
        'X-Title': 'MR Abogado Etapa',
      },
      body: JSON.stringify({
        model: Deno.env.get('OPENROUTER_MODEL') ?? 'anthropic/claude-3.5-haiku',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }],
        temperature: 0.2,
        max_tokens: 300,
        response_format: { type: 'json_object' },
      }),
    })
    if (!res.ok) return json(req, { error: `OpenRouter ${res.status}` }, 502)
    const content = (await res.json() as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content
    if (!content) return json(req, { error: 'Sin respuesta del modelo' }, 502)

    try {
      const parsed = JSON.parse(content) as { etapa?: string; razon?: string }
      const etapa = (parsed.etapa ?? '').trim()
      if (!etapa) return json(req, { error: 'El modelo no sugirió una etapa' }, 422)
      return json(req, { etapa, razon: (parsed.razon ?? '').trim() })
    } catch {
      return json(req, { error: 'JSON inválido del modelo' }, 502)
    }
  } catch (err) {
    console.error('[sugerir-etapa]', err)
    return json(req, { error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

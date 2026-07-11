// Enriquece las notas informales del abogado convirtiéndolas en texto jurídico formal.
// Respeta el principio: no prometemos resultados — el derecho es una ciencia social.

import { corsHeaders } from '../_shared/cors.ts'
import { checkLlmGuard, logLlmCall } from '../_shared/llm-guard.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FUNCTION_NAME = 'consulta-enrich-notas'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
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

  const body = await req.json().catch(() => ({}))
  const { consulta_id, notas_raw, diagnostico_observaciones, nombre, apellido, tipo_asunto } = body

  if (!notas_raw?.trim()) return json(req, { error: 'Faltan las notas a enriquecer' }, 400)

  const inputBytes = new TextEncoder().encode(notas_raw).length
  const guard = await checkLlmGuard(adminClient, user.id, FUNCTION_NAME, inputBytes)
  if (!guard.ok) return json(req, { error: guard.error }, guard.status)

  const clienteLabel = [nombre, apellido].filter(Boolean).join(' ') || 'el consultante'

  const systemPrompt = `Sos asistente del Estudio Jurídico Dr. Marco Rossi, Tucumán, Argentina.
Tu tarea es redactar en formato jurídico formal las notas informales que el abogado tomó durante o después de una consulta.

REGLAS ESTRICTAS:
- Escribir en tercera persona formal: "Se considera pertinente agregar...", "Cabe señalar que..."
- NUNCA prometer resultados específicos. El derecho es una ciencia social; los resultados dependen del juez, las pruebas, la contraparte y el contexto fáctico.
- Usar frases como: "podría corresponder reclamar", "resultaría viable analizar", "se evaluará la posibilidad de", "sin perjuicio del resultado final del proceso"
- Citar figuras jurídicas correctamente cuando el abogado las mencione (ej: "daño moral" → art. 1741 CCC; "daño punitivo" → art. 1714 CCC; "art. 80 LCT" → entrega de documentación laboral)
- Mantener el sentido de lo que el abogado expresó, solo formalizarlo
- Devolver ÚNICAMENTE el texto redactado, sin títulos ni aclaraciones previas`

  const userPrompt = `Cliente: ${clienteLabel}
Tipo de asunto: ${tipo_asunto ?? 'no especificado'}
${diagnostico_observaciones ? `\nAnálisis IA existente:\n${diagnostico_observaciones}\n` : ''}
Notas del abogado a formalizar:
${notas_raw.trim()}

Redactá estas notas en lenguaje jurídico formal para incluirlas como observaciones complementarias al dictamen.`

  const llmRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openrouterKey}`,
      'HTTP-Referer': 'https://app.marcorossi.com.ar',
      'X-Title': 'MR Abogado Enriquecimiento Notas',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4-5',
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

  if (llmData.error) {
    return json(req, { error: `Error del proveedor IA: ${llmData.error.message}` }, 500)
  }
  if (!llmData.choices?.length) {
    return json(req, { error: 'El modelo no devolvió contenido.' }, 500)
  }

  const texto_enriquecido = llmData.choices[0].message.content?.trim() ?? ''
  if (!texto_enriquecido) {
    return json(req, { error: 'El modelo devolvió contenido vacío.' }, 500)
  }

  // Guardar en notas_abogado
  if (consulta_id) {
    await adminClient
      .from('consultas')
      .update({ notas_abogado: texto_enriquecido, updated_at: new Date().toISOString() })
      .eq('id', consulta_id)
  }

  logLlmCall(adminClient, user.id, FUNCTION_NAME, inputBytes)

  return json(req, { ok: true, texto_enriquecido })
})

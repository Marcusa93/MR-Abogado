// Genera diagnóstico jurídico y honorarios sugeridos desde notas libres de consulta inicial.
// LLM-guarded, requiere auth.

import { corsHeaders } from '../_shared/cors.ts'
import { checkLlmGuard, logLlmCall } from '../_shared/llm-guard.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FUNCTION_NAME = 'consulta-diagnostico'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

const TIPO_LABEL: Record<string, string> = {
  laboral_trabajador: 'laboral (trabajador/empleado)',
  laboral_empleador: 'laboral (empleador/empresa)',
  civil: 'civil / comercial',
  familia: 'derecho de familia',
  previsional: 'previsional / jubilaciones',
  penal: 'penal',
  otro: 'otro',
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
  const { consulta_id, nombre, apellido, tipo_asunto, notas_libres } = body

  if (!notas_libres?.trim()) return json(req, { error: 'Faltan los hechos del caso' }, 400)
  if (!tipo_asunto) return json(req, { error: 'Falta el tipo de asunto' }, 400)

  const inputBytes = new TextEncoder().encode(notas_libres).length
  const guard = await checkLlmGuard(adminClient, user.id, FUNCTION_NAME, inputBytes)
  if (!guard.ok) return json(req, { error: guard.error }, guard.status)

  const clienteLabel = [nombre, apellido].filter(Boolean).join(' ') || 'el consultante'

  const systemPrompt = `Sos un abogado experto del Estudio Jurídico Dr. Marco Rossi, Tucumán, Argentina.
Analizás consultas iniciales de potenciales clientes y generás diagnósticos jurídicos precisos y accionables.
El contexto es el fuero tucumano (Cámara Civil y Comercial, Laboral, Familia, Previsional).

Devolvé ÚNICAMENTE un JSON válido con esta estructura exacta (sin markdown, sin texto extra):
{
  "fuero": "string — fuero judicial aplicable (Laboral / Civil / Familia / Previsional / Penal / otro)",
  "pretension": "string — qué reclama o necesita el cliente, en una oración concisa y técnica",
  "chances_estimadas": "alta | media | baja | sin_datos",
  "acciones_recomendadas": ["string", "string"],
  "riesgos": ["string"],
  "observaciones": "string — análisis jurídico del caso: prescripción, plazos, elementos de prueba claves, particularidades del fuero local",
  "tipo_honorario_sugerido": "cuota_litis | arancel_verbal | arancel_escrito | honorario_fijo",
  "descripcion_honorarios": "string — justificación breve del honorario sugerido y condiciones"
}

Para tipo_honorario_sugerido:
- laboral_trabajador → siempre "cuota_litis" (pacto 20% sobre lo que se obtiene)
- civil/familia/previsional: causa simple → "arancel_verbal"; causa compleja o con documentación → "arancel_escrito"
- Si el cliente solo quiere una opinión puntual → "arancel_verbal"
- Si requiere escrito formal / representación extrajudicial → "arancel_escrito"`

  const userPrompt = `Cliente: ${clienteLabel}
Tipo de asunto: ${TIPO_LABEL[tipo_asunto] ?? tipo_asunto}

Hechos del caso (notas de la consulta):
${notas_libres.trim()}

Generá el diagnóstico jurídico.`

  const llmRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openrouterKey}`,
      'HTTP-Referer': 'https://app.marcorossi.com.ar',
      'X-Title': 'MR Abogado Diagnóstico Consulta',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4-5',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.25,
      max_tokens: 1500,
    }),
  })

  if (!llmRes.ok) {
    const txt = await llmRes.text().catch(() => '')
    return json(req, { error: `LLM error ${llmRes.status}: ${txt.slice(0, 200)}` }, 500)
  }

  const llmData = await llmRes.json() as { choices?: Array<{ message: { content: string } }> }
  const raw = llmData.choices?.[0]?.message?.content ?? ''

  let diagnostico: Record<string, unknown>
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    diagnostico = JSON.parse(cleaned)
  } catch {
    return json(req, { error: 'El modelo devolvió un formato inesperado. Intentá de nuevo.', raw }, 500)
  }

  // Si hay consulta_id, persistimos en la DB
  if (consulta_id) {
    await adminClient
      .from('consultas')
      .update({
        diagnostico_ia: diagnostico,
        diagnostico_at: new Date().toISOString(),
        estado: 'en_proceso',
        updated_at: new Date().toISOString(),
      })
      .eq('id', consulta_id)
  }

  logLlmCall(adminClient, user.id, FUNCTION_NAME, inputBytes)

  return json(req, { ok: true, diagnostico })
})

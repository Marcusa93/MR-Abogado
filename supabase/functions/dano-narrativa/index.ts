// Genera la fundamentación narrativa de una estimación de daños.
// Los NÚMEROS provienen del motor determinístico (frontend/src/lib/danos): el LLM
// sólo redacta la justificación, NUNCA inventa ni recalcula montos.

import { corsHeaders } from '../_shared/cors.ts'
import { checkLlmGuard, logLlmCall } from '../_shared/llm-guard.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FUNCTION_NAME = 'dano-narrativa'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

function formatPesos(n: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Math.round(n))
}

// Arma un resumen textual del resultado determinístico para el prompt.
function resumenResultado(resultado: any): string {
  const esc = resultado?.escenarios ?? {}
  const lineas: string[] = []
  for (const k of ['conservador', 'razonable', 'expansivo']) {
    const e = esc[k]
    if (!e) continue
    lineas.push(`- Escenario ${k}: ${formatPesos(e.total)}`)
    for (const r of e.rubros ?? []) {
      if (k === 'razonable') lineas.push(`    · ${r.label}: ${formatPesos(r.monto)}`)
    }
  }
  const aud = resultado?.auditoria ?? {}
  if (aud.nivelConfianza) lineas.push(`- Nivel de confianza: ${aud.nivelConfianza}`)
  if (aud.variablesEstimadas?.length) lineas.push(`- Variables estimadas: ${aud.variablesEstimadas.join(', ')}`)
  if (aud.alertas?.length) lineas.push(`- Alertas: ${aud.alertas.map((a: any) => a.mensaje).join(' | ')}`)
  return lineas.join('\n')
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
  const { resultado, tipo_caso, descripcion } = body
  if (!resultado?.escenarios) return json(req, { error: 'Falta el resultado del cálculo' }, 400)

  const resumen = resumenResultado(resultado)
  const inputBytes = new TextEncoder().encode(resumen + (descripcion ?? '')).length
  const guard = await checkLlmGuard(adminClient, user.id, FUNCTION_NAME, inputBytes)
  if (!guard.ok) return json(req, { error: guard.error }, guard.status)

  const systemPrompt = `Sos asistente jurídico del Estudio Dr. Marco Rossi, Tucumán, Argentina.
Redactás la FUNDAMENTACIÓN de una estimación de daños ya calculada por un motor determinístico.

REGLAS ESTRICTAS:
- Los MONTOS ya están calculados. NO los recalcules, NO inventes cifras nuevas, NO propongas otros números. Citá exactamente los que se te dan.
- Explicá el porqué: el rubro, el criterio (art. 1746 renta capitalizada; art. 1741 satisfacciones sustitutivas; art. 52 bis LDC multa civil; canastas CBT; Irigoyen Testa), y el nivel de gravedad/procedencia.
- Usá la doctrina de Tucumán: deuda de valor, reparación plena, daño punitivo no simbólico ni como % del compensatorio.
- NUNCA prometas resultados. Frases como "resultaría razonable estimar", "sin perjuicio del criterio judicial", "constituye una base objetiva controlable".
- Señalá expresamente lo que requiere revisión humana (procedencia del punitivo, comparación de precedentes, duplicaciones, Pc/Pd).
- Estructura: 2 a 4 párrafos, en tercera persona formal. Devolvé SÓLO el texto.`

  const userPrompt = `Tipo de caso: ${tipo_caso ?? 'no especificado'}
${descripcion ? `Descripción de los hechos:\n${descripcion}\n` : ''}
Resultado del cálculo (determinístico, NO modificar los montos):
${resumen}

Redactá la fundamentación jurídica de esta estimación.`

  const llmRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openrouterKey}`,
      'HTTP-Referer': 'https://app.marcorossi.com.ar',
      'X-Title': 'MR Abogado Fundamentación Daños',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    }),
  })

  if (!llmRes.ok) {
    const txt = await llmRes.text().catch(() => '')
    return json(req, { error: `LLM error ${llmRes.status}: ${txt.slice(0, 300)}` }, 500)
  }

  const llmData = await llmRes.json() as {
    choices?: Array<{ message: { content: string } }>
    error?: { message?: string }
  }
  if (llmData.error) return json(req, { error: `Error del proveedor IA: ${llmData.error.message}` }, 500)
  const narrativa = llmData.choices?.[0]?.message.content?.trim() ?? ''
  if (!narrativa) return json(req, { error: 'El modelo devolvió contenido vacío.' }, 500)

  logLlmCall(adminClient, user.id, FUNCTION_NAME, inputBytes)
  return json(req, { ok: true, narrativa })
})

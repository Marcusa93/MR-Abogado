// Extrae de un relato en lenguaje natural los campos estructurados del estimador
// de daños y detecta la información faltante. El LLM SOLO extrae/estructura:
// NO calcula montos ni indemnizaciones (eso lo hace el motor determinístico).

import { corsHeaders } from '../_shared/cors.ts'
import { checkLlmGuard, logLlmCall } from '../_shared/llm-guard.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FUNCTION_NAME = 'dano-extraer'

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
  const relato: string = body.relato ?? ''
  if (!relato.trim()) return json(req, { error: 'Falta el relato del caso' }, 400)

  const inputBytes = new TextEncoder().encode(relato).length
  const guard = await checkLlmGuard(adminClient, user.id, FUNCTION_NAME, inputBytes)
  if (!guard.ok) return json(req, { error: guard.error }, guard.status)

  const systemPrompt = `Sos asistente del Estudio Dr. Marco Rossi (Tucumán). Extraés de un relato en lenguaje natural los datos necesarios para estimar daños. NO calculás montos ni indemnizaciones: sólo identificás y estructurás lo que el relato dice, y marcás lo que falta.

Devolvé EXCLUSIVAMENTE un objeto JSON válido (sin markdown, sin texto extra) con esta forma:
{
  "relacion_consumo": boolean,            // ¿es una relación de consumo (LDC)?
  "rubros": string[],                     // subconjunto de: "incapacidad","lucro_cesante","gastos_medicos","no_patrimonial","punitivo"
  "incapacidad": {
    "edad": number|null,
    "porcentaje": number|null,            // % de incapacidad si se menciona
    "ingreso_mensual": number|null,       // en pesos, si hay dato
    "ingreso_acreditado": boolean,        // true si el relato indica ingreso probado/documentado
    "tipo": "fisica"|"psiquica"|"ambas"|null
  },
  "gastos": { "medicos_pasados": number|null, "medicos_futuros": number|null },
  "lucro_cesante_pasado": number|null,
  "no_patrimonial": {
    "duracion_meses": number|null,
    "vulnerabilidad": "ninguna"|"media"|"alta"|"hipervulnerable"|null,
    "afectacion_salud": boolean,
    "reiteracion": boolean
  },
  "punitivo": {
    "trato_indigno": boolean, "riesgo_salud": boolean, "reiteracion": boolean,
    "grave": boolean, "vulnerabilidad": boolean, "obstructiva": boolean,
    "metodo_sugerido": "canastas"|"irigoyen_testa"|"beneficio_ilicito"|"prudencial"|null
  },
  "faltantes": string[],                  // datos que faltan o son ambiguos y hay que precisar
  "resumen": string                       // 1-2 frases de lo detectado
}

REGLAS:
- Incluí un rubro en "rubros" sólo si el relato da base para él.
- No inventes números. Si un dato no está, poné null y agregalo a "faltantes".
- "punitivo" sólo tiene sentido si relacion_consumo es true.
- Si no hay ingreso documentado, ingreso_acreditado=false (se usará SMVM subsidiario) y agregá una nota en faltantes si conviene acreditarlo.`

  const llmRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openrouterKey}`,
      'HTTP-Referer': 'https://app.marcorossi.com.ar',
      'X-Title': 'MR Abogado Extracción Daños',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Relato del caso:\n${relato.trim()}` },
      ],
      temperature: 0.1,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
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

  const raw = llmData.choices?.[0]?.message.content?.trim() ?? ''
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim()
  let campos: unknown
  try {
    campos = JSON.parse(cleaned)
  } catch {
    return json(req, { error: 'El modelo no devolvió JSON válido.' }, 500)
  }

  logLlmCall(adminClient, user.id, FUNCTION_NAME, inputBytes)
  return json(req, { ok: true, campos })
})

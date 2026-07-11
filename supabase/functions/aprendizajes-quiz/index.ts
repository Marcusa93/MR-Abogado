// Genera preguntas de repaso diario mezclando aprendizajes activos y casos reales del estudio.

import { corsHeaders } from '../_shared/cors.ts'
import { checkLlmGuard, logLlmCall } from '../_shared/llm-guard.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FUNCTION_NAME = 'aprendizajes-quiz'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

interface PreguntaQuiz {
  id: string
  enunciado: string
  tipo: 'opcion_multiple' | 'verdadero_falso'
  opciones: string[]
  respuesta_correcta: string
  explicacion: string
  categoria: 'patron' | 'caso' | 'derecho'
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

  const inputBytes = 100 // costo fijo bajo para generar preguntas
  const guard = await checkLlmGuard(adminClient, user.id, FUNCTION_NAME, inputBytes)
  if (!guard.ok) return json(req, { error: guard.error }, guard.status)

  // 1. Fetch aprendizajes activos (no propuestos)
  const { data: aprendizajes } = await adminClient
    .from('aprendizajes_rulebook' as never)
    .select('contenido, target_kind, target_ref_text, confidence, observed_in_cases')
    .eq('is_active', true)
    .eq('proposed', false)
    .order('observed_in_cases', { ascending: false })
    .limit(12) as { data: Array<{
      contenido: string
      target_kind: string
      target_ref_text: string | null
      confidence: string
      observed_in_cases: number
    }> | null }

  // 2. Fetch expedientes activos recientes (para preguntas sobre casos reales)
  const { data: expedientes } = await adminClient
    .from('expedientes')
    .select(`
      caratula, fuero, estado_interno,
      clientes:cliente_id (nombre, apellido),
      organismos:organismo_id (nombre)
    `)
    .is('deleted_at', null)
    .not('estado_interno', 'in', '("FINALIZADO","NO_VIABLE_RECHAZADO")')
    .order('updated_at', { ascending: false })
    .limit(5) as { data: Array<{
      caratula: string | null
      fuero: string | null
      estado_interno: string
      clientes: { nombre: string | null; apellido: string | null } | null
      organismos: { nombre: string | null } | null
    }> | null }

  const tieneAprendizajes = (aprendizajes?.length ?? 0) > 0
  const tieneExpedientes = (expedientes?.length ?? 0) > 0

  if (!tieneAprendizajes && !tieneExpedientes) {
    return json(req, {
      ok: true,
      preguntas: [],
      mensaje: 'Todavía no hay aprendizajes activos ni expedientes para generar preguntas. Aprobá al menos un aprendizaje o cargá expedientes activos primero.',
    })
  }

  // Construir contexto para el prompt
  const aprendizajesTexto = (aprendizajes ?? []).slice(0, 8).map((a, i) => {
    const ref = a.target_ref_text ? ` → ${a.target_ref_text}` : ''
    return `${i + 1}. [${a.target_kind}${ref}] ${a.contenido}`
  }).join('\n')

  const expedientesTexto = (expedientes ?? []).slice(0, 4).map((e, i) => {
    const cliente = e.clientes ? `${e.clientes.nombre ?? ''} ${e.clientes.apellido ?? ''}`.trim() : 'desconocido'
    const organismo = e.organismos?.nombre ?? 'sin organismo'
    return `${i + 1}. Caso: "${e.caratula ?? 'sin carátula'}" — Fuero: ${e.fuero ?? 'desconocido'} — Etapa: ${e.estado_interno} — Cliente: ${cliente} — Tribunal: ${organismo}`
  }).join('\n')

  const systemPrompt = `Sos un asistente jurídico que genera preguntas de repaso para el Dr. Marco Rossi, abogado con estudio en Tucumán, Argentina. El derecho aplicable es argentino.

Generás preguntas variadas mezclando:
- Patrones aprendidos del estudio (preferencias de jueces, normativa recurrente, estilos procesales)
- Preguntas sobre los casos activos del estudio
- Preguntas de derecho sustantivo/procesal relevante para su práctica (civil, laboral, familia, previsional)

FORMATO DE RESPUESTA: JSON puro, sin markdown. Exactamente este schema:
{
  "preguntas": [
    {
      "id": "q1",
      "enunciado": "¿...?",
      "tipo": "opcion_multiple",
      "opciones": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "respuesta_correcta": "A. ...",
      "explicacion": "...",
      "categoria": "patron"
    }
  ]
}

Categorías: "patron" (basado en aprendizajes del estudio), "caso" (sobre expedientes activos), "derecho" (conceptos jurídicos)
Para "opcion_multiple": siempre 4 opciones (A, B, C, D), la correcta debe estar incluida como una de ellas.
Para "verdadero_falso": opciones son ["Verdadero", "Falso"], respuesta_correcta es "Verdadero" o "Falso".
La "respuesta_correcta" debe ser exactamente igual al texto de una de las opciones.
Generá exactamente 5 preguntas, variadas en tipo y categoría.`

  let userPrompt = 'Generá 5 preguntas de repaso jurídico.'

  if (tieneAprendizajes) {
    userPrompt += `\n\nPATRONES DEL ESTUDIO (para preguntas de categoría "patron"):\n${aprendizajesTexto}`
  }

  if (tieneExpedientes) {
    userPrompt += `\n\nEXPEDIENTES ACTIVOS (para preguntas de categoría "caso"):\n${expedientesTexto}`
  }

  userPrompt += '\n\nIncluí al menos 1 pregunta de cada categoría disponible. Mezclá opcion_multiple con algún verdadero_falso.'

  const llmRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openrouterKey}`,
      'HTTP-Referer': 'https://app.marcorossi.com.ar',
      'X-Title': 'MR Abogado Quiz Diario',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4-5',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 2500,
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

  if (llmData.error) return json(req, { error: `Error IA: ${llmData.error.message}` }, 500)
  if (!llmData.choices?.length) return json(req, { error: 'Sin respuesta del modelo.' }, 500)

  let resultado: { preguntas: PreguntaQuiz[] }
  try {
    resultado = JSON.parse(llmData.choices[0].message.content ?? '{}')
  } catch {
    return json(req, { error: 'El modelo devolvió JSON inválido.' }, 500)
  }

  if (!Array.isArray(resultado?.preguntas)) {
    return json(req, { error: 'Formato de respuesta inesperado.' }, 500)
  }

  logLlmCall(adminClient, user.id, FUNCTION_NAME, inputBytes)

  return json(req, { ok: true, preguntas: resultado.preguntas })
})

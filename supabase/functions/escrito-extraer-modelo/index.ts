// escrito-extraer-modelo — extrae la estructura EscritoContenido de un texto de escrito real.
// Usado para cargar modelos de demandas/escritos al banco de modelos compartidos del estudio.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { checkLlmGuard, logLlmCall } from '../_shared/llm-guard.ts'

const FUNCTION_NAME = 'escrito-extraer-modelo'
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') ?? ''
const MODEL = 'anthropic/claude-haiku-4-5'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

const SCHEMA_DESCRIPTION = `
Devolvé un JSON con esta forma exacta:
{
  "titulo": "NOMBRE DEL TIPO DE ESCRITO EN MAYUSCULAS",
  "encabezado_juez": "Señor/a Juez/a: (o el encabezamiento que corresponde)",
  "caratula": "Carátula del expediente o [CARATULA]",
  "presentacion": "Fórmula de presentación del abogado (opcional, puede ser string vacío)",
  "secciones": [
    {
      "titulo": "I. NOMBRE DE SECCIÓN",
      "parrafos": ["párrafo 1", "párrafo 2"]
    }
  ]
}
Reglas:
- Extraé la estructura REAL del documento, sin inventar contenido.
- Reemplazá datos concretos (nombres, números, fechas específicas) con marcadores genéricos: [NOMBRE DEL CLIENTE], [EXPEDIENTE Nº], [FECHA], [JUZGADO], etc.
- Conservá el lenguaje jurídico, las fórmulas procesales y la estructura de cada sección.
- Cada párrafo debe ser una unidad de sentido completa.
- Las secciones deben mantener el orden del documento original.
- Si el documento tiene un PETITORIO, debe ser la última sección.
- No incluyas la firma ni los datos del abogado en las secciones.
`

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'Método no permitido' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json(req, { error: 'No autorizado' }, 401)

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user }, error: authError } = await anonClient.auth.getUser()
  if (authError || !user) return json(req, { error: 'No autorizado' }, 401)

  const body = await req.json().catch(() => null) as {
    texto: string
    nombre?: string
    tipo?: string
  } | null

  if (!body?.texto?.trim()) return json(req, { error: 'El campo texto es requerido' }, 400)

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const inputBytes = new TextEncoder().encode(body.texto).length
  const guard = await checkLlmGuard(serviceClient, user.id, FUNCTION_NAME, inputBytes)
  if (!guard.ok) return json(req, { error: guard.error }, guard.status)

  const MAX_TEXT = 40_000
  const textoTruncado = body.texto.slice(0, MAX_TEXT)

  const messages = [
    {
      role: 'user',
      content: `El abogado te entrega el siguiente escrito judicial real para que extraigas su estructura como modelo reutilizable.

${SCHEMA_DESCRIPTION}

TEXTO DEL ESCRITO:
---
${textoTruncado}
---

Respondé SOLO con el JSON, sin texto adicional.`,
    },
  ]

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://app.marcorossi.com.ar',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 4000,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[escrito-extraer-modelo] LLM error', err)
    return json(req, { error: 'Error al procesar el modelo con IA' }, 502)
  }

  const llmData = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
  const raw = llmData?.choices?.[0]?.message?.content ?? ''

  let contenido: unknown
  try {
    contenido = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim())
  } catch {
    return json(req, { error: 'La IA no devolvió un JSON válido. Intentá con un texto más claro.' }, 422)
  }

  // Validación básica de estructura
  const c = contenido as Record<string, unknown>
  if (!c.titulo || !Array.isArray(c.secciones) || c.secciones.length === 0) {
    return json(req, { error: 'La estructura extraída no es válida. Revisá el texto del modelo.' }, 422)
  }

  logLlmCall(serviceClient, user.id, FUNCTION_NAME, inputBytes)

  return json(req, { contenido, nombre: body.nombre ?? c.titulo, tipo: body.tipo ?? String(c.titulo) })
})

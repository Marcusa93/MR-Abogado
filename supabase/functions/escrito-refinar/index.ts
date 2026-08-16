// Refina un párrafo o una sección completa de un escrito ya generado,
// aplicando una instrucción específica del abogado sobre el texto existente.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { checkLlmGuard, logLlmCall } from '../_shared/llm-guard.ts'

const FUNCTION_NAME = 'escrito-refinar'
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-5'

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

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) return json(req, { error: 'No autorizado' }, 401)

    const body = await req.json().catch(() => null) as {
      escrito_titulo?: string
      registro_tonal?: 'retorico' | 'procesal' | null
      titulo_seccion?: string
      texto_actual: string
      instruccion: string
      alcance: 'seccion' | 'parrafo'
    } | null

    if (!body?.texto_actual?.trim()) return json(req, { error: 'texto_actual requerido' }, 400)
    if (!body?.instruccion?.trim()) return json(req, { error: 'instruccion requerida' }, 400)
    if (!body?.alcance) return json(req, { error: 'alcance requerido (seccion|parrafo)' }, 400)

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const inputBytes = new TextEncoder().encode(body.instruccion + body.texto_actual).length
    const guard = await checkLlmGuard(serviceClient, user.id, FUNCTION_NAME, inputBytes)
    if (!guard.ok) return json(req, { error: guard.error }, guard.status)

    const esSeccion = body.alcance === 'seccion'

    const registroNote = body.registro_tonal === 'retorico'
      ? 'Mantené el registro retórico-suspicaz del texto original: conectores adversativos, lectura crítica de la prueba contraria, sutileza léxica. No uses adjetivos hostiles directos.'
      : body.registro_tonal === 'procesal'
      ? 'Mantené el registro procesal-seco: frases directas, una idea por oración, sin retórica innecesaria.'
      : 'Mantené el estilo y tono del texto original.'

    const sistemaPrompt = `Sos un asistente jurídico especializado en escritos judiciales argentinos.
Tu única tarea es MODIFICAR el texto de ${esSeccion ? 'una sección' : 'un párrafo'} de un escrito ya redactado, aplicando exactamente la instrucción del abogado.

Reglas:
- ${registroNote}
- NO inventes hechos, fechas, partes ni citas legales que no estén en el texto original, salvo que la instrucción lo pida explícitamente.
- Si la instrucción pide ampliar o profundizar, expandí el argumento con rigor jurídico.
- Si la instrucción pide reescribir, hacelo conservando el núcleo del argumento.
- NO agregues títulos, encabezados ni marcadores de sección al inicio de la respuesta.
- Devolvé SOLO el texto ${esSeccion ? 'de los párrafos (separados por \\n\\n, un párrafo por bloque)' : 'del párrafo modificado'}, sin comentarios ni explicaciones.
- NO uses markdown, asteriscos, ni listas con guiones.
- El texto es para un escrito judicial argentino: formal, impersonal, usando vocabulario jurídico preciso.`

    const userMsg = `ESCRITO: "${body.escrito_titulo ?? 'Escrito judicial'}"${body.titulo_seccion ? `\nSECCIÓN: ${body.titulo_seccion}` : ''}

TEXTO ACTUAL:
${body.texto_actual}

INSTRUCCIÓN DEL ABOGADO:
${body.instruccion}

Aplicá la instrucción y devolvé el texto modificado:`

    const llmAc = new AbortController()
    const llmTid = setTimeout(() => llmAc.abort(), 25_000)
    let aiRes: Response
    try {
      aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://app.marcorossi.com.ar',
          'X-Title': 'MR Abogado Escrito Refinar',
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages: [
            { role: 'system', content: sistemaPrompt },
            { role: 'user', content: userMsg },
          ],
          temperature: body.registro_tonal === 'retorico' ? 0.55 : 0.25,
          max_tokens: esSeccion ? 3000 : 1200,
        }),
        signal: llmAc.signal,
      })
    } catch (e) {
      clearTimeout(llmTid)
      if ((e as Error)?.name === 'AbortError') {
        return json(req, { error: 'El modelo tardó demasiado. Intentá de nuevo.' }, 504)
      }
      throw e
    } finally {
      clearTimeout(llmTid)
    }

    if (!aiRes.ok) {
      const txt = await aiRes.text()
      return json(req, { error: `OpenRouter ${aiRes.status}: ${txt.slice(0, 200)}` }, 502)
    }

    const payload = await aiRes.json() as { choices?: { message?: { content?: string } }[] }
    const resultado = payload.choices?.[0]?.message?.content?.trim() ?? ''
    if (!resultado) return json(req, { error: 'El modelo no devolvió contenido' }, 502)

    logLlmCall(serviceClient, user.id, FUNCTION_NAME, inputBytes)
    return json(req, { ok: true, resultado })

  } catch (err) {
    console.error('[escrito-refinar]', err)
    return json(req, { error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

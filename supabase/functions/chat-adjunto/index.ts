// Chat con un adjunto (Q&A grounded en el texto extraído).
// Body: { adjunto_id: string, question: string, history?: {role,content}[], document_text?: string }
// Si document_text no viene, se intenta usar ai_full_text guardado en la BD.
// Returns: { answer: string, model: string } o { error }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'anthropic/claude-sonnet-4'

const SYSTEM_PROMPT = `Sos un asistente jurídico que responde preguntas sobre UN documento PDF específico de un expediente judicial argentino. Sos el "modo conversación" del documento.

REGLAS:
- Solo respondés con info que esté EXPLÍCITAMENTE en el documento o sea inferencia directa razonable. Si la respuesta no está, decí claramente "El documento no menciona eso" y proponé qué sí podés buscar.
- Citá el texto cuando ayude (entre comillas, breve).
- Si te piden montos, fechas o nombres y están en el doc: respondé con el dato exacto. No redondees ni reformules números.
- Sos breve y procesal. Sin moralejas ni preámbulos. Sin emojis.
- Si la pregunta requiere comparar con OTROS expedientes u otro documento, decí que necesitás contexto fuera de este documento.
- Castellano rioplatense formal jurídico (no vos voseante coloquial — usá "usted" o impersonal).`

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

function isValidMsg(m: unknown): m is Msg {
  if (!m || typeof m !== 'object') return false
  const o = m as Record<string, unknown>
  return (o.role === 'user' || o.role === 'assistant') && typeof o.content === 'string'
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

    const body = await req.json().catch(() => null) as
      | { adjunto_id?: string; question?: string; history?: unknown[]; document_text?: string }
      | null
    const adjuntoId = body?.adjunto_id
    const question = typeof body?.question === 'string' ? body.question.trim() : ''
    if (!adjuntoId) return json(req, { error: 'Falta adjunto_id' }, 400)
    if (!question) return json(req, { error: 'Falta question' }, 400)
    if (question.length > 2000) return json(req, { error: 'Pregunta demasiado larga (máx 2000 caracteres).' }, 400)

    const history = Array.isArray(body?.history) ? body.history.filter(isValidMsg).slice(-8) : []

    // Buscar el adjunto vía anon client (RLS) para autorizar.
    const { data: adj, error: adjErr } = await anonClient
      .from('adjuntos')
      .select('id, nombre_archivo, categoria, ai_full_text, ai_summary')
      .eq('id', adjuntoId)
      .is('deleted_at', null)
      .maybeSingle()
    if (adjErr) throw adjErr
    if (!adj) return json(req, { error: 'Adjunto no encontrado o sin permisos.' }, 404)

    // Resolver texto: priorizo el que mande el frontend, si no uso el guardado.
    const providedText = typeof body?.document_text === 'string' ? body.document_text.trim() : ''
    const docText = providedText || (typeof adj.ai_full_text === 'string' ? adj.ai_full_text : '')

    if (!docText.trim()) {
      return json(req, {
        error: 'No tengo el texto del documento. Analizalo primero con "Analizar con IA" o reenvialo extrayendo en el frontend.',
        needs_text: true,
      }, 400)
    }

    // Truncar para mantener costos predecibles
    const truncated = docText.length > 80_000
    const grounded = truncated ? docText.slice(0, 80_000) + '\n\n[... TEXTO TRUNCADO ...]' : docText

    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      {
        role: 'user' as const,
        content: `Documento que se está consultando: ${adj.nombre_archivo}${adj.categoria ? ` (categoría: ${adj.categoria})` : ''}

--- CONTENIDO DEL DOCUMENTO ---
${grounded}
--- FIN DEL DOCUMENTO ---

A continuación responderé preguntas sobre este documento.`,
      },
      ...history,
      { role: 'user' as const, content: question },
    ]

    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://app.marcorossi.com.ar',
        'X-Title': 'MR Abogado Doc Chat',
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.2,
        max_tokens: 1200,
      }),
    })

    if (!res.ok) {
      const txt = await res.text()
      console.error('[chat-adjunto] openrouter error', res.status, txt.slice(0, 200))
      return json(req, { error: `Error del modelo (${res.status})` }, 502)
    }

    const payload = await res.json() as { choices?: { message?: { content?: string } }[] }
    const answer = payload.choices?.[0]?.message?.content?.trim()
    if (!answer) return json(req, { error: 'El modelo no devolvió respuesta.' }, 502)

    return json(req, { answer, model: MODEL, truncated })

  } catch (err) {
    console.error('[chat-adjunto] fatal', err)
    return json(req, { error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

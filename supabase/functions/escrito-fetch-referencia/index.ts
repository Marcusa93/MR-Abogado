// escrito-fetch-referencia — dada una URL pública, extrae una cita jurídica estructurada.
// Usado para citar fallos, normativa y doctrina directamente desde portales externos.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { checkLlmGuard, logLlmCall } from '../_shared/llm-guard.ts'

const FUNCTION_NAME = 'escrito-fetch-referencia'
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') ?? ''
const MODEL = 'anthropic/claude-haiku-4-5'
const MAX_FETCH_BYTES = 400_000  // 400KB HTML
const MAX_TEXT_CHARS = 20_000   // 20K chars al LLM

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

// Bloquea IPs privadas / localhost (SSRF prevention).
function isPrivateUrl(url: URL): boolean {
  const h = url.hostname.toLowerCase()
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true
  if (h.startsWith('192.168.') || h.startsWith('10.') || h.startsWith('172.')) return true
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.corp')) return true
  // Supabase internals
  if (h.includes('supabase.co') && !h.startsWith('app.')) return true
  return false
}

function stripHtml(html: string): string {
  // Eliminar scripts, styles y head completos
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    // Decodificar entidades HTML comunes
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    // Normalizar espacios
    .replace(/\s+/g, ' ')
    .trim()
  return text.slice(0, MAX_TEXT_CHARS)
}

const EXTRACTION_PROMPT = `Analizá el texto de esta página web jurídica y extraé la información de la cita en formato JSON.

Devolvé SOLO el siguiente JSON (sin texto adicional):
{
  "tipo": "fallo" | "normativa" | "doctrina" | "otro",
  "tribunal": "nombre del tribunal o cámara (null si no hay)",
  "fecha": "YYYY-MM-DD o texto descriptivo (null si no hay)",
  "caratula": "carátula o título principal de la norma/fallo (null si no hay)",
  "numero": "número de ley, autos o expediente (null si no hay)",
  "extracto": "párrafo o extracto más relevante del documento, máximo 400 caracteres (null si no hay)",
  "cita_formal": "cita bibliográfica formal al estilo jurídico argentino"
}

Reglas:
- Si es una ley o decreto: tribunal = null, caratula = nombre de la ley, numero = número de ley/decreto.
- Si es un fallo: tribunal = nombre del tribunal, caratula = carátula del expediente (partes).
- cita_formal debe ser la forma correcta de citar la fuente en un escrito judicial argentino.
- Extracto: elegí el párrafo más relevante del texto (la razón de la decisión, o el artículo clave).
- Si el texto no contiene un documento jurídico reconocible, igual completá los campos con lo que puedas.
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

  const body = await req.json().catch(() => null) as { url?: string } | null
  if (!body?.url?.trim()) return json(req, { error: 'El campo url es requerido' }, 400)

  let parsed: URL
  try {
    parsed = new URL(body.url.trim())
  } catch {
    return json(req, { error: 'URL inválida' }, 400)
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return json(req, { error: 'Solo se permiten URLs http/https' }, 400)
  }
  if (isPrivateUrl(parsed)) {
    return json(req, { error: 'URL no permitida' }, 400)
  }

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // LLM guard (contamos la URL como input pequeño, el costo real es el HTML)
  const inputBytes = new TextEncoder().encode(body.url).length
  const guard = await checkLlmGuard(serviceClient, user.id, FUNCTION_NAME, inputBytes)
  if (!guard.ok) return json(req, { error: guard.error }, guard.status)

  // Fetch de la URL
  let rawHtml: string
  try {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 12_000)
    const resp = await fetch(body.url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MRAbogado/1.0)',
        'Accept': 'text/html,text/plain,*/*',
        'Accept-Language': 'es-AR,es;q=0.9',
      },
    })
    clearTimeout(timeout)

    if (!resp.ok) {
      return json(req, { error: `La página respondió con error ${resp.status}` }, 422)
    }
    const contentType = resp.headers.get('content-type') ?? ''
    if (!contentType.includes('html') && !contentType.includes('text')) {
      return json(req, { error: 'La URL no devuelve contenido de texto legible' }, 422)
    }

    // Leer con límite de tamaño
    const reader = resp.body?.getReader()
    if (!reader) return json(req, { error: 'No se pudo leer la respuesta' }, 502)
    const chunks: Uint8Array[] = []
    let totalBytes = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.length
      if (totalBytes > MAX_FETCH_BYTES) { reader.cancel(); break }
      chunks.push(value)
    }
    rawHtml = new TextDecoder('utf-8', { fatal: false }).decode(
      new Uint8Array(chunks.reduce<number[]>((acc, c) => [...acc, ...c], []))
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    if (msg.includes('abort')) return json(req, { error: 'La página tardó demasiado en responder' }, 504)
    return json(req, { error: `No se pudo acceder a la URL: ${msg}` }, 502)
  }

  const textoLimpio = stripHtml(rawHtml)
  if (textoLimpio.length < 100) {
    return json(req, { error: 'La página no tiene suficiente contenido de texto legible' }, 422)
  }

  // Llamada al LLM para extraer la cita
  const messages = [
    {
      role: 'user',
      content: `${EXTRACTION_PROMPT}\n\nURL: ${body.url}\n\nCONTENIDO:\n---\n${textoLimpio}\n---`,
    },
  ]

  const llmResp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
      max_tokens: 600,
    }),
  })

  if (!llmResp.ok) {
    console.error('[escrito-fetch-referencia] LLM error', await llmResp.text())
    return json(req, { error: 'Error al procesar la referencia con IA' }, 502)
  }

  const llmData = await llmResp.json() as { choices?: Array<{ message?: { content?: string } }> }
  const raw = llmData?.choices?.[0]?.message?.content ?? ''

  let cita: unknown
  try {
    cita = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim())
  } catch {
    return json(req, { error: 'La IA no pudo extraer la cita. Intentá con otra URL.' }, 422)
  }

  logLlmCall(serviceClient, user.id, FUNCTION_NAME, new TextEncoder().encode(textoLimpio).length)

  return json(req, { ...(cita as Record<string, unknown>), fuente_url: body.url })
})

// Genera un GUION DE REEL estructurado a partir de un audio (tu idea hablada),
// un texto o un link de noticia. Pensado para que Marco diga el tema y Samira
// reciba un guion listo para grabar/editar.
//
// Acciones (body.action):
//   'init'    → { filename }                 : bucket + URL firmada de subida (audio)
//   'process' → { path? | texto? | url?; contexto? } : transcribe/extrae → IA → guion → contenidos
//
// El guion se guarda en `contenidos` (categoria 'video_guion') con el cuerpo en
// JSON marcado ({"_tipo":"guion_reel", ...}) para que el front lo renderice por
// escenas. Usa service role para insertar (bypass RLS).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { checkLlmGuard, logLlmCall } from '../_shared/llm-guard.ts'

const BUCKET = 'contenidos-media'
const FUNCTION_NAME = 'guion-reel-generar'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
const OPENAI_TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

// ── Transcripción de audio (Groq Whisper, fallback OpenAI) ───────────────────
async function transcribe(audio: ArrayBuffer, mime: string, groqKey?: string, openaiKey?: string): Promise<string> {
  const ext = mime.includes('webm') ? 'webm' : mime.includes('mp4') || mime.includes('m4a') ? 'm4a' : mime.includes('mpeg') || mime.includes('mp3') ? 'mp3' : 'ogg'
  const form = () => {
    const f = new FormData()
    f.append('file', new Blob([audio], { type: mime || 'audio/ogg' }), `audio.${ext}`)
    f.append('language', 'es')
    f.append('response_format', 'json')
    return f
  }
  if (groqKey) {
    const f = form(); f.append('model', 'whisper-large-v3-turbo')
    const r = await fetch(GROQ_TRANSCRIPTION_URL, { method: 'POST', headers: { Authorization: `Bearer ${groqKey}` }, body: f })
    if (r.ok) return (await r.json() as { text?: string }).text ?? ''
    console.warn('[guion-reel-generar] Groq falló, fallback OpenAI')
  }
  if (openaiKey) {
    const f = form(); f.append('model', 'whisper-1')
    const r = await fetch(OPENAI_TRANSCRIPTION_URL, { method: 'POST', headers: { Authorization: `Bearer ${openaiKey}` }, body: f })
    if (!r.ok) throw new Error(`OpenAI transcripción ${r.status}: ${(await r.text()).slice(0, 150)}`)
    return (await r.json() as { text?: string }).text ?? ''
  }
  throw new Error('No hay proveedor de transcripción (GROQ_API_KEY u OPENAI_API_KEY)')
}

// ── Extracción de texto de una URL (noticia/artículo) ────────────────────────
async function extraerDeUrl(url: string): Promise<string> {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MRAbogadoBot/1.0)' } })
  if (!r.ok) throw new Error(`No se pudo abrir el link (${r.status})`)
  const html = await r.text()
  // Limpieza simple: sacar scripts/styles y tags, colapsar espacios.
  const sinScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
  const texto = sinScripts
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return texto.slice(0, 16_000)
}

// ── Prompt: guion de Reel estructurado, con la voz de Marco ──────────────────
const REEL_SYSTEM = `Sos el guionista de Reels del abogado Marco Rossi (Estudio Jurídico MR, Tucumán): especialista en IA aplicada al derecho, prueba electrónica y transformación digital de la justicia. Su voz es coloquial rioplatense, directa, apasionada y con ironía suave. Primera persona del singular.

Tu trabajo: a partir del material que te paso (una idea hablada, un texto o una noticia), armás UN guion de Reel vertical (Instagram/TikTok) BIEN ESTRUCTURADO y atrapante, listo para que Marco lo grabe y la editora (Samira) consiga las imágenes y arme el video.

Principios:
- El HOOK es lo más importante: los primeros 3 segundos deciden si te ven o te saltean. Tiene que generar tensión, curiosidad o sorpresa. Nunca arrancar con "Hola, soy Marco" ni "Hoy les vengo a hablar de".
- Reel de 30 a 60 segundos. Entre 3 y 6 escenas. Ritmo ágil, frases cortas, una idea por escena.
- Para cada escena indicás: lo que Marco dice A CÁMARA (texto hablado, natural, como habla él), una SUGERENCIA VISUAL concreta (b-roll, imagen, plano, recurso) y el TEXTO EN PANTALLA (corto, impactante).
- Cerrá con un remate y una llamada a la acción suave (comentar, seguir, consultar al estudio).
- No inventes datos, casos ni cifras que el material no diga. Si el material es una idea suelta, desarrollála con criterio jurídico real pero sin inventar hechos concretos.

Devolvé SOLO un JSON válido con EXACTAMENTE esta forma:
{
  "tema": "el tema en una frase",
  "titulo": "título corto interno para identificar el guion (máx 8 palabras)",
  "duracion_estimada": "ej: 45 segundos",
  "hooks": ["2 o 3 opciones de gancho para los primeros 3 segundos"],
  "escenas": [
    { "n": 1, "a_camara": "lo que dice Marco", "visual": "sugerencia visual / b-roll / imagen", "texto_pantalla": "texto en pantalla corto" }
  ],
  "cierre": "el remate final que dice a cámara",
  "cta": "la llamada a la acción",
  "notas_edicion": "ritmo, música, cortes, subtítulos, formato vertical, etc."
}
No agregues texto fuera del JSON.`

interface Guion {
  tema: string
  titulo: string
  duracion_estimada: string
  hooks: string[]
  escenas: { n: number; a_camara: string; visual: string; texto_pantalla: string }[]
  cierre: string
  cta: string
  notas_edicion: string
}

async function generarGuion(material: string, contexto: string | undefined, apiKey: string): Promise<Guion | null> {
  const userMsg = `Material de origen:\n\n${material.slice(0, 16_000)}${contexto ? `\n\nÁngulo/indicación extra: ${contexto}` : ''}`
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://app.marcorossi.com.ar',
      'X-Title': 'MR Abogado Guion Reel',
    },
    body: JSON.stringify({
      model: Deno.env.get('OPENROUTER_MODEL') ?? 'anthropic/claude-3.5-sonnet',
      messages: [{ role: 'system', content: REEL_SYSTEM }, { role: 'user', content: userMsg }],
      temperature: 0.8,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    }),
  })
  if (!res.ok) return null
  const content = (await res.json() as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content
  if (!content) return null
  try {
    const g = JSON.parse(content) as Partial<Guion>
    if (!g.escenas?.length && !g.hooks?.length) return null
    return {
      tema: (g.tema ?? '').trim(),
      titulo: (g.titulo ?? g.tema ?? 'Guion de Reel').trim().slice(0, 200),
      duracion_estimada: (g.duracion_estimada ?? '').trim(),
      hooks: Array.isArray(g.hooks) ? g.hooks.map((h) => String(h).trim()).filter(Boolean) : [],
      escenas: Array.isArray(g.escenas) ? g.escenas.map((e, i) => ({
        n: e.n ?? i + 1,
        a_camara: String(e.a_camara ?? '').trim(),
        visual: String(e.visual ?? '').trim(),
        texto_pantalla: String(e.texto_pantalla ?? '').trim(),
      })) : [],
      cierre: (g.cierre ?? '').trim(),
      cta: (g.cta ?? '').trim(),
      notas_edicion: (g.notas_edicion ?? '').trim(),
    }
  } catch { return null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  try {
    const anon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user }, error: authError } = await anon.auth.getUser()
    if (authError || !user) return json(req, { error: 'No autorizado' }, 401)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = await req.json().catch(() => null) as
      | { action: 'init'; filename?: string }
      | { action: 'process'; path?: string; texto?: string; url?: string; contexto?: string }
      | null
    if (!body?.action) return json(req, { error: 'Falta action' }, 400)

    // ── INIT: bucket + URL firmada de subida (audio) ──────────────────────────
    if (body.action === 'init') {
      await admin.storage.createBucket(BUCKET, { public: false }).catch(() => {})
      const safe = (body.filename ?? 'audio').replace(/[^\w.\-]+/g, '_').slice(-80)
      const path = `${user.id}/${crypto.randomUUID()}-${safe}`
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path)
      if (error || !data) return json(req, { error: `No se pudo preparar la subida: ${error?.message}` }, 500)
      return json(req, { path: data.path, token: data.token, signedUrl: data.signedUrl })
    }

    // ── PROCESS: conseguir material → IA → guion → contenidos ─────────────────
    if (body.action === 'process') {
      const apiKey = Deno.env.get('OPENROUTER_API_KEY')
      if (!apiKey) return json(req, { error: 'OPENROUTER_API_KEY no configurada' }, 500)

      const guard = await checkLlmGuard(admin, user.id, FUNCTION_NAME, 200_000)
      if (!guard.ok) return json(req, { error: guard.error }, guard.status)

      let material = ''
      let cleanupStoragePath: string | null = null

      if (body.path) {
        if (!body.path.startsWith(`${user.id}/`)) return json(req, { error: 'Ruta no permitida' }, 403)
        const { data: file, error: dlErr } = await admin.storage.from(BUCKET).download(body.path)
        if (dlErr || !file) return json(req, { error: `No se pudo descargar el audio: ${dlErr?.message}` }, 404)
        cleanupStoragePath = body.path
        const mime = file.type || 'audio/ogg'
        material = await transcribe(await file.arrayBuffer(), mime, Deno.env.get('GROQ_API_KEY'), Deno.env.get('OPENAI_API_KEY'))
      } else if (body.url) {
        material = await extraerDeUrl(body.url.trim())
      } else if (body.texto) {
        material = body.texto.trim()
      } else {
        return json(req, { error: 'Falta el material: audio (path), texto o url' }, 400)
      }

      material = material.trim()
      if (!material) return json(req, { error: 'No se obtuvo material (¿el audio tiene voz, o el link/texto tiene contenido?)' }, 422)

      logLlmCall(admin, user.id, FUNCTION_NAME, material.length)
      const guion = await generarGuion(material, body.contexto, apiKey)
      if (!guion) return json(req, { error: 'La IA no generó un guion aprovechable' }, 422)

      // Guardar como contenido (categoria video_guion) con el JSON marcado.
      const cuerpo = JSON.stringify({ _tipo: 'guion_reel', ...guion })
      const { data: inserted, error: insErr } = await admin.from('contenidos').insert({
        titulo: guion.titulo || 'Guion de Reel',
        categoria: 'video_guion',
        estado: 'borrador',
        cuerpo,
        notas_internas: guion.notas_edicion || null,
        enlace_referencia: body.url ?? null,
        created_by: user.id,
      }).select('id').single()
      if (insErr) return json(req, { error: `No se pudo guardar el guion: ${insErr.message}` }, 500)

      if (cleanupStoragePath) admin.storage.from(BUCKET).remove([cleanupStoragePath]).catch(() => {})

      return json(req, { ok: true, id: inserted?.id, material_chars: material.length })
    }

    return json(req, { error: 'action inválida' }, 400)
  } catch (err) {
    console.error('[guion-reel-generar]', err)
    return json(req, { error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

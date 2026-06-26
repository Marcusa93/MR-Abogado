// Genera borradores de contenido por plataforma a partir de un video.
//
// Acciones (body.action):
//   'init'    → { filename }            : asegura bucket + devuelve URL firmada de subida
//   'process' → { path, contexto? }     : video → audio (VPS) → transcripción → IA → tarjetas
//
// Reutiliza: compresor de audio del VPS (AUDIO_COMPRESSOR_URL/TOKEN), Whisper
// (GROQ/OPENAI) y OpenRouter para el copy. Inserta filas en `contenidos`.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { checkLlmGuard, logLlmCall } from '../_shared/llm-guard.ts'
import { getValidAccessToken, downloadDriveFile } from '../_shared/google-drive.ts'

const BUCKET = 'contenidos-media'
const FUNCTION_NAME = 'contenido-desde-video'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
const OPENAI_TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

// Plataforma → categoría de la tabla contenidos
const PLATAFORMAS: { key: string; categoria: string; nombre: string }[] = [
  { key: 'linkedin', categoria: 'linkedin', nombre: 'LinkedIn' },
  { key: 'x', categoria: 'twitter', nombre: 'X (Twitter)' },
  { key: 'instagram', categoria: 'instagram', nombre: 'Instagram' },
  { key: 'youtube', categoria: 'video_guion', nombre: 'YouTube / TikTok' },
]

async function transcribe(audio: ArrayBuffer, groqKey?: string, openaiKey?: string): Promise<string> {
  const form = () => {
    const f = new FormData()
    f.append('file', new Blob([audio], { type: 'audio/ogg' }), 'audio.ogg')
    f.append('language', 'es')
    f.append('response_format', 'json')
    return f
  }
  if (groqKey) {
    const f = form(); f.append('model', 'whisper-large-v3-turbo')
    const r = await fetch(GROQ_TRANSCRIPTION_URL, { method: 'POST', headers: { Authorization: `Bearer ${groqKey}` }, body: f })
    if (r.ok) return (await r.json() as { text?: string }).text ?? ''
    console.warn('[contenido-desde-video] Groq falló, fallback OpenAI')
  }
  if (openaiKey) {
    const f = form(); f.append('model', 'whisper-1')
    const r = await fetch(OPENAI_TRANSCRIPTION_URL, { method: 'POST', headers: { Authorization: `Bearer ${openaiKey}` }, body: f })
    if (!r.ok) throw new Error(`OpenAI transcripción ${r.status}: ${(await r.text()).slice(0, 150)}`)
    return (await r.json() as { text?: string }).text ?? ''
  }
  throw new Error('No hay proveedor de transcripción (GROQ_API_KEY u OPENAI_API_KEY)')
}

const SYSTEM_PROMPT = `Sos el community manager del Estudio Jurídico Dr. Marco Rossi (Tucumán, Argentina; derecho civil, laboral, familia y previsional). A partir de la transcripción de un video, redactás el contenido LISTO PARA PUBLICAR en cada red social.

Reglas:
- Español rioplatense, tono profesional pero cercano y claro para público general.
- NO inventes datos jurídicos, fallos, cifras ni promesas de resultado. Si el video no lo dice, no lo afirmes.
- Cada plataforma con su estilo propio.
- Incluí hashtags relevantes (sin excederte).
- Devolvé SOLO un JSON válido con esta forma exacta:

{
  "linkedin":  { "titulo": "título corto", "cuerpo": "post profesional con gancho inicial, desarrollo de valor y un cierre/CTA", "hashtags": "#... #..." },
  "x":         { "titulo": "título corto", "cuerpo": "1-3 posts cortos y punchy separados por doble salto de línea", "hashtags": "#..." },
  "instagram": { "titulo": "título corto", "cuerpo": "caption atractivo, con emojis moderados y llamada a la acción", "hashtags": "#..." },
  "youtube":   { "titulo": "título del video", "cuerpo": "descripción para YouTube/TikTok con resumen y puntos clave", "hashtags": "#..." }
}`

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
      | { action: 'process'; path?: string; drive_file_id?: string; contexto?: string }
      | null
    if (!body?.action) return json(req, { error: 'Falta action' }, 400)

    // ── INIT: asegurar bucket + URL firmada de subida ─────────────────────────
    if (body.action === 'init') {
      await admin.storage.createBucket(BUCKET, { public: false }).catch(() => {}) // idempotente
      const safe = (body.filename ?? 'video').replace(/[^\w.\-]+/g, '_').slice(-80)
      const path = `${user.id}/${crypto.randomUUID()}-${safe}`
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path)
      if (error || !data) return json(req, { error: `No se pudo preparar la subida: ${error?.message}` }, 500)
      return json(req, { path: data.path, token: data.token, signedUrl: data.signedUrl })
    }

    // ── PROCESS: video → audio → transcripción → IA → tarjetas ────────────────
    if (body.action === 'process') {
      if (!body.path && !body.drive_file_id) return json(req, { error: 'Falta path o drive_file_id' }, 400)
      const apiKey = Deno.env.get('OPENROUTER_API_KEY')
      if (!apiKey) return json(req, { error: 'OPENROUTER_API_KEY no configurada' }, 500)
      const compressorUrl = Deno.env.get('AUDIO_COMPRESSOR_URL')
      const compressorToken = Deno.env.get('AUDIO_COMPRESSOR_TOKEN')
      if (!compressorUrl || !compressorToken) return json(req, { error: 'Compresor de audio no configurado' }, 500)

      const guard = await checkLlmGuard(admin, user.id, FUNCTION_NAME, 200_000)
      if (!guard.ok) return json(req, { error: guard.error }, guard.status)

      // 1) Obtener el video: subida directa (storage) o desde el Drive del usuario
      let videoBytes: ArrayBuffer
      let cleanupStoragePath: string | null = null
      if (body.drive_file_id) {
        const cId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
        const cSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')
        if (!cId || !cSecret) return json(req, { error: 'Drive OAuth no configurado en el servidor' }, 500)
        const accessToken = await getValidAccessToken({ serviceClient: admin, profileId: user.id, clientId: cId, clientSecret: cSecret })
        const dl = await downloadDriveFile({ accessToken, fileId: body.drive_file_id })
        videoBytes = dl.data
      } else {
        if (!body.path!.startsWith(`${user.id}/`)) return json(req, { error: 'Ruta no permitida' }, 403)
        const { data: file, error: dlErr } = await admin.storage.from(BUCKET).download(body.path!)
        if (dlErr || !file) return json(req, { error: `No se pudo descargar el video: ${dlErr?.message}` }, 404)
        videoBytes = await file.arrayBuffer()
        cleanupStoragePath = body.path!
      }

      // 2) Extraer audio en el VPS
      const compRes = await fetch(`${compressorUrl.replace(/\/$/, '')}/compress`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${compressorToken}`, 'Content-Type': 'application/octet-stream' },
        body: videoBytes,
      })
      if (!compRes.ok) return json(req, { error: `Extracción de audio falló (${compRes.status})` }, 502)
      const audio = await compRes.arrayBuffer()

      // 3) Transcribir
      const transcript = (await transcribe(audio, Deno.env.get('GROQ_API_KEY'), Deno.env.get('OPENAI_API_KEY'))).trim()
      if (!transcript) return json(req, { error: 'La transcripción salió vacía (¿el video tiene audio hablado?)' }, 422)

      // 4) IA → copy por plataforma
      const userMsg = `Transcripción del video:\n\n${transcript.slice(0, 18_000)}${body.contexto ? `\n\nContexto/ángulo del estudio: ${body.contexto}` : ''}\n\nGenerá el contenido por plataforma en el JSON indicado.`
      const aiRes = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://app.marcorossi.com.ar',
          'X-Title': 'MR Abogado Contenidos',
        },
        body: JSON.stringify({
          model: Deno.env.get('OPENROUTER_MODEL') ?? 'anthropic/claude-3.5-haiku',
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userMsg }],
          temperature: 0.7,
          max_tokens: 2500,
          response_format: { type: 'json_object' },
        }),
      })
      if (!aiRes.ok) return json(req, { error: `IA falló (${aiRes.status}): ${(await aiRes.text()).slice(0, 150)}` }, 502)
      logLlmCall(admin, user.id, FUNCTION_NAME, transcript.length)
      const content = (await aiRes.json() as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content
      if (!content) return json(req, { error: 'La IA no devolvió contenido' }, 502)

      let parsed: Record<string, { titulo?: string; cuerpo?: string; hashtags?: string }>
      try { parsed = JSON.parse(content) } catch { return json(req, { error: 'La IA devolvió un JSON inválido' }, 502) }

      // 5) Insertar una tarjeta (borrador) por plataforma con contenido
      const rows = PLATAFORMAS
        .map((p) => ({ p, c: parsed[p.key] }))
        .filter(({ c }) => c && (c.cuerpo?.trim() || c.titulo?.trim()))
        .map(({ p, c }) => ({
          titulo: (c!.titulo?.trim() || `Post ${p.nombre}`).slice(0, 200),
          categoria: p.categoria,
          estado: 'borrador',
          cuerpo: c!.cuerpo?.trim() ?? null,
          hashtags: c!.hashtags?.trim() ?? null,
          created_by: user.id,
        }))
      if (!rows.length) return json(req, { error: 'La IA no generó contenido aprovechable' }, 422)

      const { data: inserted, error: insErr } = await admin.from('contenidos').insert(rows).select('id, categoria')
      if (insErr) return json(req, { error: `No se pudieron guardar las tarjetas: ${insErr.message}` }, 500)

      // Limpieza: borrar el video del storage si fue subida directa (Drive no se toca)
      if (cleanupStoragePath) admin.storage.from(BUCKET).remove([cleanupStoragePath]).catch(() => {})

      return json(req, { created: inserted?.length ?? 0, transcript_chars: transcript.length })
    }

    return json(req, { error: 'action inválida' }, 400)
  } catch (err) {
    console.error('[contenido-desde-video]', err)
    return json(req, { error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

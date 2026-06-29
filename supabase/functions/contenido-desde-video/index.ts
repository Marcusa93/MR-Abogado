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

const LINKEDIN_PROMPT = `Sos Marco Rossi: abogado, tecnoactivista, docente universitario e investigador especializado en inteligencia artificial aplicada al derecho, prueba electrónica y transformación digital del sistema judicial. Dirigís el Estudio Jurídico MR.

Tu voz en LinkedIn es personal, directa y argentina. No escribís como una empresa ni como un manual. Escribís como alguien que vive lo que cuenta, que se equivocó y aprendió, que le apasiona lo que hace.

REGLAS DE ESTILO:
- Empezá siempre con un gancho: una pregunta provocadora, una afirmación cortante o una metáfora concreta. Nunca con "Hoy quiero hablarles de...".
- Usá primera persona del singular. Hablá de tu experiencia real, no de generalidades.
- El tono es coloquial rioplatense: "contame", "bancarse", "piola", "a los tropiezos", "huevos", "te digo". Evitá anglicismos innecesarios y lenguaje corporativo.
- Usá metáforas físicas y sensoriales para explicar conceptos abstractos (tecnología, derecho, cambio). Que el lector sienta algo.
- Estructura: gancho → tensión o problema → experiencia personal o reflexión → cierre con pregunta o invitación.
- Párrafos cortos (2-4 líneas máximo). Sin bullet points. Sin títulos en negrita. Texto corrido.
- Cerrá siempre con una pregunta al lector o una frase que invite a la acción o reflexión.
- Hashtags al final, entre 4 y 8. Mezclar técnicos (#IA #PruebaElectronica #DerechoDigital #LegalTech) con propios del estudio si aplica.
- Extensión: entre 150 y 350 palabras. Nunca más. Nunca menos de 100.

TEMÁTICAS POSIBLES:
- Inteligencia artificial aplicada al derecho y la justicia
- Prueba electrónica: valor probatorio, autenticidad, peritos, WhatsApp, emails, capturas
- Transformación digital del estudio jurídico
- Automatización de procesos legales
- Ética y límites de la IA en el ejercicio del derecho
- Casos reales o situaciones que ilustren cómo la tecnología cambia el litigio
- Reflexiones sobre el rol del abogado en la era de la IA

LO QUE NO HACÉS:
- No usás frases genéricas del tipo "En el mundo actual..." o "La tecnología avanza a pasos agigantados..."
- No hacés listas de puntos
- No citás estadísticas sin contexto personal
- No hablás en plural mayestático ("nosotros los abogados")
- No usás comillas para resaltar palabras clave
- No terminás con "¡Seguinos para más contenido!"

CONTEXTO DEL ESTUDIO:
El Estudio Jurídico MR (marcorossi.com.ar) trabaja en la intersección entre derecho y tecnología. Las publicaciones posicionan a Marco como referente en IA legal y prueba electrónica, y atraen clientes que necesitan asesoramiento en causas con evidencia digital o que quieren incorporar IA a su práctica jurídica.`

const X_PROMPT = `Sos Marco Rossi (@marquitorossi): abogado, tecnoactivista, Director de IA de la Municipalidad de Tucumán, docente universitario y escritor. Usás X para pensar en voz alta, provocar, difundir y posicionarte en la intersección entre derecho, IA y tecnología.

En X tu voz es más corta, más filosa y más irónica que en LinkedIn. Escribís como alguien que tiene algo para decir y lo suelta sin rodeos. No escribís posts, escribís pensamientos.

FORMATO Y LONGITUD:
- Tweet simple: máximo 280 caracteres. Directo, sin introducción. Que arranque fuerte.
- Thread (hilo): el primer tweet es el gancho (máximo 220 chars, tiene que funcionar solo). Los tweets siguientes desarrollan de a uno. Máximo 4-5 tweets por hilo. Cada uno autosuficiente pero que empuje a leer el siguiente. Separá los tweets del hilo con un doble salto de línea.
- No uses asteriscos, negritas ni emojis decorativos. Solo emojis que agreguen significado o tono (🤖⚖️🔥😅 sí. 🌟💫✨ no).

TONO Y VOZ:
- Coloquial rioplatense sin exagerar. "Mirá", "dale", "obvio", "laburando", "fua", "piola".
- Ironía suave. Nunca agresivo. Crítico con ideas, nunca con personas.
- Primera persona siempre. "Yo creo", "me parece", "hoy pasó".
- Podés mezclar lo técnico con lo cotidiano sin vergüenza.
- Permitido el humor breve si refuerza el punto.

ESTRUCTURAS QUE FUNCIONAN EN X:
1. Pregunta que descoloca → respuesta tuya en 1 línea
2. Observación irónica de 1 línea sola (sin explicar)
3. Afirmación polémica + pequeño contexto (para generar debate)
4. Mini-hilo: dato/caso → implicancia jurídica → pregunta al final
5. "Hoy pasó esto:" → contás algo real, breve, que ilustra un punto mayor

LO QUE NO HACÉS EN X:
- No metáforas largas (eso es para LinkedIn)
- No listas de puntos
- No frases motivacionales genéricas
- No explicar demasiado — dejá espacio para que el lector piense
- No terminar con "¿Me seguís?" ni CTAs forzados

HASHTAGS EN X: máximo 2, solo si son muy relevantes. Preferibles: #IA #LegalTech #DerechoDigital #PruebaElectronica.

EJEMPLOS DE TONO CORRECTO:
"Un screenshot puede hacer o romper un caso. ¿Sabés cuándo es válido como prueba?"
"La IA no va a reemplazar abogados. Va a reemplazar a los abogados que no usen IA."
"Hoy un cliente me trajo 400 capturas de WhatsApp como prueba. El trabajo empieza ahí."

El Estudio Jurídico MR (marcorossi.com.ar) es el espacio profesional. Generá debate, cercanía y consultas.

CRÍTICO — LÍMITE DE CARACTERES: cada tweet del cuerpo va separado por UNA LÍNEA EN BLANCO y tiene MÁXIMO 280 caracteres (el primero, máximo 270). Si la idea no entra en uno, armá un hilo de 2 a 5 tweets, cada uno autosuficiente. Los hashtags (máx 2) van al final del ÚLTIMO tweet, dentro del cuerpo — dejá el campo "hashtags" vacío.`

const IG_PROMPT = `Sos Marco Rossi: abogado tecnoactivista, especialista en IA aplicada al derecho y prueba electrónica. Estudio Jurídico MR.

En Instagram tu voz es cercana, humana y visual. Escribís el caption de un reel o carrusel, en primera persona, como a alguien que te pregunta de verdad.

REGLAS:
- Gancho fuerte en la primera línea (lo que se ve antes del "ver más").
- Coloquial rioplatense, cálido y directo. Nada corporativo. Primera persona del singular.
- Emojis con moderación, solo si suman tono.
- Párrafos cortos, con saltos de línea para respirar.
- Cerrá con una pregunta o invitación a comentar/guardar.
- Temáticas: prueba electrónica (WhatsApp, capturas, emails como prueba), IA en el derecho, casos reales, el futuro del abogado.
- No inventes datos. Si el material no lo dice, no lo afirmes.
- Hashtags al final, 5 a 10, mezcla de técnicos y de alcance.`

const YT_PROMPT = `Sos Marco Rossi: abogado especialista en IA y prueba electrónica. Estudio Jurídico MR.

Escribís para YouTube/TikTok: un TÍTULO potente (que dé ganas de hacer click, sin clickbait barato) y una DESCRIPCIÓN.

REGLAS:
- Título corto, con gancho, primera persona o pregunta. Nada de "En este video...".
- Descripción: 2-4 párrafos. Arranca fuerte, resume de qué va y cierra invitando a comentar/seguir.
- Coloquial rioplatense, directo y apasionado.
- Temáticas: prueba electrónica, IA en el derecho, casos reales, futuro del abogado.
- No inventes datos.
- En "titulo" va el título del video; en "cuerpo" la descripción.
- Hashtags al final de la descripción, 3 a 6.`

const PROMPTS: Record<string, string> = {
  linkedin: LINKEDIN_PROMPT,
  x: X_PROMPT,
  instagram: IG_PROMPT,
  youtube: YT_PROMPT,
}

const JSON_SUFFIX = `

---
A partir del material de origen que te paso, escribí UNA pieza para esta plataforma respetando TODO lo de arriba. Devolvé SOLO un JSON válido: {"titulo": "título corto interno para identificar el post", "cuerpo": "el texto LISTO PARA PUBLICAR, tal cual, sin comillas envolventes", "hashtags": "los hashtags como string, o vacío"}. El "cuerpo" es lo que se publica. No inventes hechos que el material no diga.`

async function generarPlataforma(
  systemPrompt: string,
  transcript: string,
  contexto: string | undefined,
  apiKey: string,
): Promise<{ titulo: string; cuerpo: string; hashtags: string } | null> {
  const userMsg = `Material de origen (transcripción de un video o un guion del estudio):\n\n${transcript.slice(0, 18_000)}${contexto ? `\n\nContexto/ángulo: ${contexto}` : ''}`
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://app.marcorossi.com.ar',
      'X-Title': 'MR Abogado Contenidos',
    },
    body: JSON.stringify({
      model: Deno.env.get('OPENROUTER_MODEL') ?? 'anthropic/claude-3.5-haiku',
      messages: [{ role: 'system', content: systemPrompt + JSON_SUFFIX }, { role: 'user', content: userMsg }],
      temperature: 0.8,
      max_tokens: 1300,
      response_format: { type: 'json_object' },
    }),
  })
  if (!res.ok) return null
  const content = (await res.json() as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content
  if (!content) return null
  try {
    const p = JSON.parse(content) as { titulo?: string; cuerpo?: string; hashtags?: string }
    const cuerpo = (p.cuerpo ?? '').trim()
    const titulo = (p.titulo ?? '').trim()
    if (!cuerpo && !titulo) return null
    return { titulo, cuerpo, hashtags: (p.hashtags ?? '').trim() }
  } catch { return null }
}

// Parte un tweet largo en trozos de ≤280, cortando en espacios cuando se puede.
function splitTweet(t: string, max = 280): string[] {
  t = t.trim()
  if (t.length <= max) return t ? [t] : []
  const out: string[] = []
  let rest = t
  while (rest.length > max) {
    let cut = rest.lastIndexOf(' ', max)
    if (cut < max * 0.6) cut = max
    out.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) out.push(rest)
  return out
}

// Arma un hilo válido: tweets separados por línea en blanco, cada uno ≤280,
// hashtags anexados al último, máximo 5 tweets.
function armarHilo(cuerpo: string, hashtags: string): string {
  let tweets = cuerpo.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)
  const tags = hashtags.trim()
  if (tags) {
    const last = tweets.length ? tweets[tweets.length - 1] : ''
    const merged = `${last}\n\n${tags}`.trim()
    if (last && merged.length <= 280) tweets[tweets.length - 1] = merged
    else tweets.push(tags)
  }
  tweets = tweets.flatMap((t) => splitTweet(t))
  if (tweets.length > 5) tweets = tweets.slice(0, 5)
  return tweets.join('\n\n')
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

      // 1) Conseguir el TEXTO base: de un guion (texto/Google Doc) o de un video
      //    (audio → transcripción). Desde Drive autodetectamos el tipo por mimeType.
      let transcript = ''
      let cleanupStoragePath: string | null = null

      const videoToTranscript = async (bytes: ArrayBuffer): Promise<string> => {
        const compRes = await fetch(`${compressorUrl.replace(/\/$/, '')}/compress`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${compressorToken}`, 'Content-Type': 'application/octet-stream' },
          body: bytes,
        })
        if (!compRes.ok) throw new Error(`Extracción de audio falló (${compRes.status})`)
        const audio = await compRes.arrayBuffer()
        return (await transcribe(audio, Deno.env.get('GROQ_API_KEY'), Deno.env.get('OPENAI_API_KEY'))).trim()
      }

      if (body.drive_file_id) {
        const cId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
        const cSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')
        if (!cId || !cSecret) return json(req, { error: 'Drive OAuth no configurado en el servidor' }, 500)
        const accessToken = await getValidAccessToken({ serviceClient: admin, profileId: user.id, clientId: cId, clientSecret: cSecret })
        const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${body.drive_file_id}?fields=name,mimeType&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${accessToken}` } })
        if (!metaRes.ok) {
          const detalle = (await metaRes.text()).slice(0, 150)
          return json(req, { error: `No se pudo leer el archivo de Drive (${metaRes.status}). Si recién reconectaste el Drive, reintentá. Detalle: ${detalle}` }, 502)
        }
        const mt = (await metaRes.json() as { mimeType?: string }).mimeType ?? ''
        if (mt === 'application/vnd.google-apps.document' || mt.startsWith('text/')) {
          // Guion: traer el texto directo (export para Google Docs, alt=media para texto plano)
          const txtUrl = mt === 'application/vnd.google-apps.document'
            ? `https://www.googleapis.com/drive/v3/files/${body.drive_file_id}/export?mimeType=text/plain`
            : `https://www.googleapis.com/drive/v3/files/${body.drive_file_id}?alt=media`
          const txtRes = await fetch(txtUrl, { headers: { Authorization: `Bearer ${accessToken}` } })
          if (!txtRes.ok) return json(req, { error: `No se pudo leer el guion de Drive (${txtRes.status})` }, 502)
          transcript = (await txtRes.text()).trim()
        } else {
          // Video/audio del Drive
          const dl = await downloadDriveFile({ accessToken, fileId: body.drive_file_id })
          transcript = await videoToTranscript(dl.data)
        }
      } else {
        if (!body.path!.startsWith(`${user.id}/`)) return json(req, { error: 'Ruta no permitida' }, 403)
        const { data: file, error: dlErr } = await admin.storage.from(BUCKET).download(body.path!)
        if (dlErr || !file) return json(req, { error: `No se pudo descargar el video: ${dlErr?.message}` }, 404)
        cleanupStoragePath = body.path!
        transcript = await videoToTranscript(await file.arrayBuffer())
      }

      transcript = transcript.trim()
      if (!transcript) return json(req, { error: 'No se obtuvo texto (¿el video tiene audio hablado, o el guion tiene contenido?)' }, 422)

      // 4) IA → una pieza por plataforma, cada una con SU system prompt (voz de Marco)
      logLlmCall(admin, user.id, FUNCTION_NAME, transcript.length)
      const generadas = await Promise.all(
        PLATAFORMAS.map(async (p) => ({ p, c: await generarPlataforma(PROMPTS[p.key], transcript, body.contexto, apiKey) })),
      )

      // 5) Insertar una tarjeta (borrador) por plataforma con contenido
      const rows = generadas
        .filter(({ c }) => c && (c.cuerpo || c.titulo))
        .map(({ p, c }) => {
          const esX = p.categoria === 'twitter'
          // En X armamos un hilo válido (cada tweet ≤280, hashtags al final).
          const cuerpo = esX ? armarHilo(c!.cuerpo || '', c!.hashtags || '') : (c!.cuerpo || '')
          return {
            titulo: (c!.titulo || `Post ${p.nombre}`).slice(0, 200),
            categoria: p.categoria,
            estado: 'borrador',
            cuerpo: cuerpo || null,
            hashtags: esX ? null : (c!.hashtags || null),
            created_by: user.id,
          }
        })
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

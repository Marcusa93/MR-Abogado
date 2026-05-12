// Transcribe un archivo de audio con OpenAI Whisper.
//
// Body: una de estas dos formas:
//   { source: 'sae_attachment', movement_id: string, file_name: string }
//   { source: 'upload', audiencia_id?: string, movement_id?: string,
//     storage_path: string, file_name: string }
//
// Returns: { transcript_id, transcript, duration_seconds }
//
// Costos: ~$0.006 por minuto de audio. Límite Whisper: 25 MB.
// Para archivos más grandes el cliente debe comprimir antes.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { authenticateWithSae, SaeError, type SaeSession } from '../_shared/sae-request-connector.ts'

const OPENAI_TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions'
const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
const OPENAI_WHISPER_MODEL = 'whisper-1'
const GROQ_WHISPER_MODEL = 'whisper-large-v3-turbo' // 25 MB cap, español ok
const SAE_API_URL = 'https://conexpbe.justucuman.gov.ar/api'
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface SaeAttachmentBody {
  source: 'sae_attachment'
  movement_id: string
  file_name: string
}

interface UploadBody {
  source: 'upload'
  audiencia_id?: string
  movement_id?: string
  storage_path: string
  file_name: string
}

type RequestBody = SaeAttachmentBody | UploadBody

async function downloadFromSae(
  movementId: string,
  fileName: string,
  serviceClient: ReturnType<typeof createClient>,
  username: string,
  password: string,
): Promise<{ bytes: ArrayBuffer; expedienteId: string }> {
  // Get movement metadata for procid + jurisdictionId
  const { data: m, error } = await serviceClient
    .from('sae_movements')
    .select('expediente_id, sae_case_id, external_id, raw_payload')
    .eq('id', movementId)
    .single()
  if (error || !m) throw new Error('Actuación no encontrada')

  const movement = m as unknown as { expediente_id: string; sae_case_id: string | null; external_id: string | null; raw_payload: { jurisdiction_id?: number } | null }

  const jid = movement.raw_payload?.jurisdiction_id
  if (!movement.sae_case_id || !movement.external_id || !jid) {
    throw new Error('Datos de SAE incompletos en la actuación')
  }

  const session = await authenticateWithSae({ username, password })

  // POST a /user/proceedings/history/file (mismo flujo que sae-document)
  const encoded = encodeSaeFileName(fileName)
  const fileRes = await fetch(`${SAE_API_URL}/user/proceedings/history/file`, {
    method: 'POST',
    headers: apiHeaders(session, 'application/json, text/plain, */*'),
    body: JSON.stringify({
      jurisdiction: String(jid),
      proceeding: String(movement.sae_case_id),
      history: String(movement.external_id),
      file: encoded,
    }),
  })

  if (!fileRes.ok) throw new Error(`SAE rechazó la descarga (${fileRes.status})`)

  const contentType = fileRes.headers.get('content-type') ?? ''
  if (contentType.includes('audio') || contentType.includes('octet-stream')) {
    return { bytes: await fileRes.arrayBuffer(), expedienteId: movement.expediente_id }
  }

  // SAE devolvió JSON con la URL real
  const payload = await fileRes.json().catch(() => null) as { url?: string; data?: { url?: string } } | null
  const url = payload?.url ?? payload?.data?.url
  if (!url) throw new Error('SAE no devolvió URL del audio')
  const absUrl = url.startsWith('http') ? url : `https://consultaexpedientes.justucuman.gov.ar${url}`

  const binRes = await fetch(absUrl, {
    method: 'GET',
    headers: apiHeaders(session, 'audio/*, application/octet-stream, */*'),
  })
  if (!binRes.ok) throw new Error(`No se pudo descargar el audio (${binRes.status})`)
  return { bytes: await binRes.arrayBuffer(), expedienteId: movement.expediente_id }
}

function apiHeaders(session: SaeSession, accept: string): Headers {
  const h = new Headers({
    Accept: accept,
    'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
    'User-Agent': BROWSER_UA,
    Origin: 'https://consultaexpedientes.justucuman.gov.ar',
    Referer: 'https://consultaexpedientes.justucuman.gov.ar/',
    'Content-Type': 'application/json',
  })
  if (session.cookies.length) h.set('Cookie', session.cookies.join('; '))
  if (session.headers?.Authorization) h.set('Authorization', session.headers.Authorization)
  return h
}

function encodeSaeFileName(fileName: string): string {
  const bytes = new Uint8Array(fileName.length)
  for (let i = 0; i < fileName.length; i++) bytes[i] = fileName.charCodeAt(i) & 0xff
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

async function downloadFromStorage(
  storagePath: string,
  serviceClient: ReturnType<typeof createClient>,
): Promise<ArrayBuffer> {
  const { data, error } = await serviceClient.storage.from('audiencias-audio').download(storagePath)
  if (error || !data) throw new Error(`No se pudo descargar el audio del Storage: ${error?.message ?? 'desconocido'}`)
  return await data.arrayBuffer()
}

interface TranscribeResult {
  text: string
  duration?: number
  provider: 'groq' | 'openai'
  model: string
}

async function callWhisperProvider(
  audio: ArrayBuffer,
  fileName: string,
  endpoint: string,
  apiKey: string,
  model: string,
): Promise<{ text: string; duration?: number }> {
  const formData = new FormData()
  formData.append('file', new Blob([audio], { type: 'audio/mpeg' }), fileName)
  formData.append('model', model)
  formData.append('language', 'es')
  formData.append('response_format', 'verbose_json')

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status}: ${text.slice(0, 200)}`)
  }
  const payload = await res.json() as { text?: string; duration?: number }
  if (!payload.text) throw new Error('Sin texto en la respuesta')
  return { text: payload.text, duration: payload.duration }
}

async function transcribe(audio: ArrayBuffer, fileName: string, opts: { groqKey?: string; openaiKey?: string }): Promise<TranscribeResult> {
  if (audio.byteLength > 25 * 1024 * 1024) {
    throw new Error(`Audio de ${(audio.byteLength / 1024 / 1024).toFixed(1)} MB excede el límite de Whisper (25 MB). Comprimilo antes.`)
  }

  // 1) Probar Groq primero (gratis hasta rate limits)
  if (opts.groqKey) {
    try {
      const r = await callWhisperProvider(audio, fileName, GROQ_TRANSCRIPTION_URL, opts.groqKey, GROQ_WHISPER_MODEL)
      return { ...r, provider: 'groq', model: GROQ_WHISPER_MODEL }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[transcribe] Groq falló, fallback a OpenAI:', msg)
      if (!opts.openaiKey) {
        throw new Error(`Groq falló y no hay OpenAI key configurada: ${msg}`)
      }
      // continuamos al fallback OpenAI
    }
  }

  // 2) Fallback OpenAI Whisper (paga ~$0.006/min)
  if (opts.openaiKey) {
    const r = await callWhisperProvider(audio, fileName, OPENAI_TRANSCRIPTION_URL, opts.openaiKey, OPENAI_WHISPER_MODEL)
    return { ...r, provider: 'openai', model: OPENAI_WHISPER_MODEL }
  }

  throw new Error('No hay ningún proveedor de transcripción configurado (GROQ_API_KEY o OPENAI_API_KEY)')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const groqKey = Deno.env.get('GROQ_API_KEY')
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!groqKey && !openaiKey) {
      return json({ error: 'Configurá GROQ_API_KEY (recomendado) o OPENAI_API_KEY en Edge Functions secrets' }, 500)
    }

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) return json({ error: 'No autorizado' }, 401)

    const body = await req.json().catch(() => null) as RequestBody | null
    if (!body || !body.source) return json({ error: 'Body inválido' }, 400)
    if (body.source !== 'sae_attachment' && body.source !== 'upload') {
      return json({ error: 'source debe ser "sae_attachment" o "upload"' }, 400)
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let audioBytes: ArrayBuffer
    let expedienteId: string
    let movementId: string | null = null
    let audienciaId: string | null = null

    if (body.source === 'sae_attachment') {
      // Need SAE credentials
      const { data: cred } = await serviceClient
        .from('sae_credentials')
        .select('username, encrypted_secret')
        .eq('profile_id', user.id)
        .eq('provider', 'justucuman')
        .maybeSingle()
      if (!cred) return json({ error: 'No tenés credenciales SAE configuradas' }, 400)
      const credRow = cred as unknown as { username: string; encrypted_secret: string | null }
      const password = credRow.encrypted_secret ? atob(credRow.encrypted_secret) : null
      if (!password) return json({ error: 'No se pudo recuperar la contraseña SAE' }, 500)

      const result = await downloadFromSae(body.movement_id, body.file_name, serviceClient, credRow.username, password)
      audioBytes = result.bytes
      expedienteId = result.expedienteId
      movementId = body.movement_id
    } else {
      // upload
      audioBytes = await downloadFromStorage(body.storage_path, serviceClient)
      // Resolve expediente_id from the linked record
      if (body.movement_id) {
        const { data: m } = await serviceClient
          .from('sae_movements')
          .select('expediente_id')
          .eq('id', body.movement_id)
          .single()
        const mRow = m as unknown as { expediente_id: string } | null
        if (!mRow) return json({ error: 'Actuación no encontrada' }, 404)
        expedienteId = mRow.expediente_id
        movementId = body.movement_id
      } else if (body.audiencia_id) {
        const { data: a } = await serviceClient
          .from('audiencias')
          .select('expediente_id')
          .eq('id', body.audiencia_id)
          .single()
        const aRow = a as unknown as { expediente_id: string } | null
        if (!aRow) return json({ error: 'Audiencia no encontrada' }, 404)
        expedienteId = aRow.expediente_id
        audienciaId = body.audiencia_id
      } else {
        return json({ error: 'Para source=upload se requiere movement_id o audiencia_id' }, 400)
      }
    }

    // Insert pending transcript row
    const { data: row, error: insertErr } = await serviceClient
      .from('audiencia_transcripts')
      .insert({
        movement_id: movementId,
        audiencia_id: audienciaId,
        expediente_id: expedienteId,
        status: 'transcribing',
        audio_source: body.source,
        audio_storage_path: body.source === 'upload' ? (body as UploadBody).storage_path : null,
        audio_filename: body.file_name,
        created_by: user.id,
      })
      .select('id')
      .single()
    if (insertErr || !row) throw new Error(`No se pudo crear transcript row: ${insertErr?.message}`)
    const transcriptId = (row as unknown as { id: string }).id

    // ── Background: la transcripción puede tardar 30s-2min, devolvemos al
    //    instante y el cliente hace polling para ver cuándo termina.
    const backgroundWork = (async () => {
      try {
        const { text, duration, provider, model } = await transcribe(audioBytes, body.file_name, { groqKey, openaiKey })
        await serviceClient
          .from('audiencia_transcripts')
          .update({
            status: 'completed',
            transcript: text,
            transcript_model: `${provider}:${model}`,
            transcript_at: new Date().toISOString(),
            audio_duration_seconds: duration ? Math.round(duration) : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', transcriptId)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error en transcripción'
        console.error('[sae-transcribe-audio][bg]', transcriptId, msg)
        await serviceClient
          .from('audiencia_transcripts')
          .update({
            status: 'error',
            error_message: msg.slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq('id', transcriptId)
      }
    })()

    // EdgeRuntime.waitUntil mantiene la función corriendo después de la respuesta.
    // @ts-expect-error EdgeRuntime es global en Supabase Edge Functions
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(backgroundWork)
    else void backgroundWork // fallback para devs locales

    return json({
      transcript_id: transcriptId,
      status: 'transcribing',
      message: 'Transcripción en proceso. Vas a verla cuando termine (~30s-2min).',
    }, 202)

  } catch (err) {
    console.error('[sae-transcribe-audio]', err)
    const msg = err instanceof SaeError ? err.message : err instanceof Error ? err.message : 'Error interno'
    return json({ error: msg }, 500)
  }
})

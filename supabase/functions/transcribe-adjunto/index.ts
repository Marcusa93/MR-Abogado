// Transcribe audio de un adjunto usando Groq Whisper.
// Body: { adjunto_id: string, force?: boolean }
// Returns: { success, transcription } o { error }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { checkLlmGuard, logLlmCall } from '../_shared/llm-guard.ts'

const FUNCTION_NAME = 'transcribe-adjunto'
const GROQ_MAX_BYTES = 24 * 1024 * 1024 // 24 MB (Groq limit es 25 MB)

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  try {
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) return json(req, { error: 'No autorizado' }, 401)

    const body = await req.json().catch(() => null) as { adjunto_id?: string; force?: boolean } | null
    const adjuntoId = body?.adjunto_id
    if (!adjuntoId) return json(req, { error: 'Falta adjunto_id' }, 400)

    const groqKey = Deno.env.get('GROQ_API_KEY')
    if (!groqKey) return json(req, { error: 'GROQ_API_KEY no configurada' }, 500)

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Verificar acceso (anon client respeta RLS)
    const { data: adj, error: adjError } = await anonClient
      .from('adjuntos')
      .select('id, consulta_id, nombre_archivo, tipo_mime, storage_path, tamano_bytes, ai_analyzed_at, ai_full_text')
      .eq('id', adjuntoId)
      .is('deleted_at', null)
      .maybeSingle()
    if (adjError) throw adjError
    if (!adj) return json(req, { error: 'Adjunto no encontrado o sin permisos' }, 404)

    const adjRow = adj as any

    // Idempotencia
    if (adjRow.ai_analyzed_at && !body?.force) {
      return json(req, { success: true, cached: true, transcription: adjRow.ai_full_text ?? '' })
    }

    // Validar MIME type
    const mime = (adjRow.tipo_mime as string | null) ?? ''
    if (!mime.startsWith('audio/') && mime !== 'video/mp4' && mime !== 'video/webm') {
      return json(req, { error: 'El adjunto no es un archivo de audio' }, 400)
    }

    // Validar tamaño antes de descargar
    const sizeBytes = (adjRow.tamano_bytes as number | null) ?? 0
    if (sizeBytes > GROQ_MAX_BYTES) {
      const mb = Math.round(sizeBytes / 1024 / 1024)
      const errMsg = `Archivo demasiado grande para transcribir (${mb} MB, máximo 24 MB)`
      await serviceClient.from('adjuntos').update({
        ai_error: errMsg,
        ai_analyzed_at: new Date().toISOString(),
      }).eq('id', adjuntoId)
      return json(req, { error: errMsg }, 400)
    }

    // Rate limit — pasamos 1000 como proxy (el chequeo de tamaño real ya se hizo arriba)
    const guard = await checkLlmGuard(serviceClient, user.id, FUNCTION_NAME, 1000)
    if (!guard.ok) return json(req, { error: guard.error }, guard.status)

    // Descargar audio del storage con service_role
    const { data: audioBlob, error: downloadError } = await serviceClient.storage
      .from('adjuntos')
      .download(adjRow.storage_path as string)
    if (downloadError || !audioBlob) {
      const errMsg = downloadError?.message ?? 'No se pudo descargar el audio'
      await serviceClient.from('adjuntos').update({
        ai_error: errMsg,
        ai_analyzed_at: new Date().toISOString(),
      }).eq('id', adjuntoId)
      return json(req, { error: errMsg }, 502)
    }

    // Enviar a Groq Whisper
    const formData = new FormData()
    formData.append('file', audioBlob, adjRow.nombre_archivo as string)
    formData.append('model', 'whisper-large-v3-turbo')
    formData.append('language', 'es')
    formData.append('response_format', 'text')

    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${groqKey}` },
      body: formData,
    })

    if (!groqRes.ok) {
      const errText = await groqRes.text()
      const errMsg = `Groq error ${groqRes.status}: ${errText.slice(0, 200)}`
      console.error('[transcribe-adjunto]', errMsg)
      await serviceClient.from('adjuntos').update({
        ai_error: errMsg,
        ai_analyzed_at: new Date().toISOString(),
      }).eq('id', adjuntoId)
      return json(req, { error: errMsg }, 502)
    }

    const transcription = (await groqRes.text()).trim()
    if (!transcription) {
      const errMsg = 'Transcripción vacía — audio sin habla detectada'
      await serviceClient.from('adjuntos').update({
        ai_error: errMsg,
        ai_analyzed_at: new Date().toISOString(),
      }).eq('id', adjuntoId)
      return json(req, { error: errMsg }, 400)
    }

    // Guardar transcripción en adjunto
    const summary = transcription.length > 400
      ? transcription.slice(0, 397) + '...'
      : transcription

    await serviceClient.from('adjuntos').update({
      ai_full_text: transcription,
      ai_summary: summary,
      ai_extracted: { tipo_documento: 'transcripcion_audio' },
      ai_model: 'groq/whisper-large-v3-turbo',
      ai_analyzed_at: new Date().toISOString(),
      ai_error: null,
    }).eq('id', adjuntoId)

    // Volcar transcripción a notas_libres de la consulta (fire-and-forget)
    if (adjRow.consulta_id) {
      const appendText = `\n\n— ${adjRow.nombre_archivo} (audio)\n${transcription}`
      serviceClient.rpc('append_consulta_notas', {
        p_consulta_id: adjRow.consulta_id,
        p_text: appendText,
      }).then(() => undefined).catch((err: unknown) =>
        console.warn('[transcribe-adjunto] append_consulta_notas falló', err))
    }

    logLlmCall(serviceClient, user.id, FUNCTION_NAME, sizeBytes)

    return json(req, { success: true, cached: false, transcription })
  } catch (err) {
    console.error('[transcribe-adjunto]', err)
    return json(req, { error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

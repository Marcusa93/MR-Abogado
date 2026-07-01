// Transcribe un audio a texto. Genérico y reutilizable (ej. modo idea libre de
// escritos). Reusa transcribeAudio de _shared/guion-reel-core.ts (Groq/OpenAI).
//
// Acciones (body.action):
//   'init'    → { filename }  : asegura bucket + URL firmada de subida
//   'process' → { path }      : baja el audio, transcribe, limpia y devuelve { texto }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { checkLlmGuard } from '../_shared/llm-guard.ts'
import { transcribeAudio } from '../_shared/guion-reel-core.ts'

const BUCKET = 'contenidos-media'
const FUNCTION_NAME = 'transcribir-audio'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
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
      | { action: 'process'; path?: string }
      | null
    if (!body?.action) return json(req, { error: 'Falta action' }, 400)

    if (body.action === 'init') {
      await admin.storage.createBucket(BUCKET, { public: false }).catch(() => {})
      const safe = (body.filename ?? 'audio').replace(/[^\w.\-]+/g, '_').slice(-80)
      const path = `${user.id}/tr-${crypto.randomUUID()}-${safe}`
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path)
      if (error || !data) return json(req, { error: `No se pudo preparar la subida: ${error?.message}` }, 500)
      return json(req, { path: data.path, token: data.token, signedUrl: data.signedUrl })
    }

    if (body.action === 'process') {
      if (!body.path) return json(req, { error: 'Falta path' }, 400)
      if (!body.path.startsWith(`${user.id}/`)) return json(req, { error: 'Ruta no permitida' }, 403)

      const guard = await checkLlmGuard(admin, user.id, FUNCTION_NAME, 50_000)
      if (!guard.ok) return json(req, { error: guard.error }, guard.status)

      const { data: file, error: dlErr } = await admin.storage.from(BUCKET).download(body.path)
      if (dlErr || !file) return json(req, { error: `No se pudo descargar el audio: ${dlErr?.message}` }, 404)

      const texto = (await transcribeAudio(
        await file.arrayBuffer(),
        file.type || 'audio/ogg',
        Deno.env.get('GROQ_API_KEY'),
        Deno.env.get('OPENAI_API_KEY'),
      )).trim()

      admin.storage.from(BUCKET).remove([body.path]).catch(() => {})

      if (!texto) return json(req, { error: 'No se obtuvo texto (¿el audio tiene voz?)' }, 422)
      return json(req, { texto })
    }

    return json(req, { error: 'action inválida' }, 400)
  } catch (err) {
    console.error('[transcribir-audio]', err)
    return json(req, { error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

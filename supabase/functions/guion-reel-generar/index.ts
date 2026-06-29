// Genera un GUION DE REEL estructurado a partir de un audio (tu idea hablada),
// un texto o un link de noticia. Pensado para que Marco diga el tema y Samira
// reciba un guion listo para grabar/editar.
//
// Acciones (body.action):
//   'init'    → { filename }                          : bucket + URL firmada de subida (audio)
//   'process' → { path? | texto? | url?; contexto? }  : transcribe/extrae → IA → guion → contenidos
//
// El motor (transcripción, scraping, prompt, generación) vive en
// _shared/guion-reel-core.ts y se comparte con telegram-contenido-webhook.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { checkLlmGuard, logLlmCall } from '../_shared/llm-guard.ts'
import { transcribeAudio, extraerDeUrl, generarGuion, guionAContenidoRow } from '../_shared/guion-reel-core.ts'

const BUCKET = 'contenidos-media'
const FUNCTION_NAME = 'guion-reel-generar'

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
        material = await transcribeAudio(await file.arrayBuffer(), file.type || 'audio/ogg', Deno.env.get('GROQ_API_KEY'), Deno.env.get('OPENAI_API_KEY'))
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

      const { data: inserted, error: insErr } = await admin
        .from('contenidos')
        .insert(guionAContenidoRow(guion, user.id, body.url ?? null))
        .select('id').single()
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

// Transcribe un chunk de audio (multipart) directamente vía Groq Whisper.
// Diseñado para transcripción en tiempo real desde el browser — sin storage intermedio.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { transcribeAudio } from '../_shared/guion-reel-core.ts'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const groqKey = Deno.env.get('GROQ_API_KEY')
  const openaiKey = Deno.env.get('OPENAI_API_KEY')

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json(req, { error: 'No autorizado' }, 401)

  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json(req, { error: 'No autorizado' }, 401)

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return json(req, { error: 'Se esperaba multipart/form-data con campo "audio"' }, 400)
  }

  const audioFile = form.get('audio') as File | null
  if (!audioFile || audioFile.size === 0) return json(req, { error: 'Falta el audio' }, 400)
  if (audioFile.size > 10 * 1024 * 1024) return json(req, { error: 'Audio muy largo (máx. 10MB por chunk)' }, 413)

  // Sin llm_guard aquí — los chunks son pequeños y ya es un flujo interactivo.
  // El costo por llamada (< $0.001) es despreciable.

  try {
    const buffer = await audioFile.arrayBuffer()
    const texto = await transcribeAudio(buffer, audioFile.type, groqKey, openaiKey)
    return json(req, { texto: texto.trim() })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[consulta-transcribir] error:', msg)
    return json(req, { error: msg }, 502)
  }
})

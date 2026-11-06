// ─────────────────────────────────────────────────────────────────────────────
// Edge function: consulta-transcribir
//
// Transcripción de entrevistas por tramos, sin guardar audio.
//
//  POST multipart (accion=tramo): audio (15-25 s) + previo (cola del texto
//    anterior, para que Whisper mantenga continuidad). Se transcribe con Groq
//    (whisper-large-v3-turbo; OpenAI whisper-1 de respaldo) y se devuelven los
//    segmentos. El audio no se escribe en ningún lado.
//
//  POST JSON { accion: 'hablantes', segmentos: string[] }: la IA marca quién
//    dice cada segmento (C = cliente, A = abogado, O = otra persona). No
//    reescribe el texto: solo devuelve una etiqueta por segmento.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { checkLlmGuard, logLlmCall } from '../_shared/llm-guard.ts'

const FUNCTION_NAME = 'consulta-transcribir'
const MAX_AUDIO = 8 * 1024 * 1024

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } })
}

// Frases que Whisper inventa sobre silencio o ruido
const ALUCINACIONES = [
  /subt[ií]tulos? (realizados|hechos|por)/i, /amara\.org/i, /gracias por (ver|mirar)/i,
  /suscr[ií]bete/i, /no olvides suscribirte/i, /^\s*(\.|…|gracias\.?|m[uú]sica|\[.*\])\s*$/i,
]

type Segmento = { text: string; no_speech_prob?: number; avg_logprob?: number; compression_ratio?: number }

async function whisper(audio: Blob, nombre: string, previo: string): Promise<string[]> {
  const intentos: { url: string; key?: string; model: string }[] = [
    { url: 'https://api.groq.com/openai/v1/audio/transcriptions', key: Deno.env.get('GROQ_API_KEY'), model: 'whisper-large-v3-turbo' },
    { url: 'https://api.openai.com/v1/audio/transcriptions', key: Deno.env.get('OPENAI_API_KEY'), model: 'whisper-1' },
  ]
  let ultimoError = 'No hay proveedor de transcripción configurado'
  for (const p of intentos) {
    if (!p.key) continue
    const f = new FormData()
    f.append('file', audio, nombre)
    f.append('model', p.model)
    f.append('language', 'es')
    f.append('response_format', 'verbose_json')
    f.append('temperature', '0')
    if (previo) f.append('prompt', previo.slice(-400))
    const r = await fetch(p.url, { method: 'POST', headers: { Authorization: `Bearer ${p.key}` }, body: f })
    if (!r.ok) { ultimoError = `${p.model} ${r.status}: ${(await r.text()).slice(0, 160)}`; console.warn('[consulta-transcribir]', ultimoError); continue }
    const d = await r.json() as { text?: string; segments?: Segmento[] }
    const segs = d.segments?.length ? d.segments : [{ text: d.text ?? '' }]
    return segs
      .filter((s) => !((s.no_speech_prob ?? 0) > 0.6 && (s.avg_logprob ?? 0) < -0.8))
      .filter((s) => (s.compression_ratio ?? 0) < 2.6)
      .map((s) => s.text.trim())
      .filter((t) => t && !ALUCINACIONES.some((re) => re.test(t)))
  }
  throw new Error(ultimoError)
}

async function etiquetarHablantes(segmentos: string[]): Promise<string[]> {
  const key = Deno.env.get('OPENROUTER_API_KEY')
  if (!key) throw new Error('Falta OPENROUTER_API_KEY')
  const lista = segmentos.map((s, i) => `${i + 1}. ${s}`).join('\n')
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4.6',
      temperature: 0,
      max_tokens: 4000,
      messages: [
        { role: 'system', content:
          'Recibís la transcripción de una entrevista entre un abogado y su cliente (a veces hay otra persona, como un familiar), dividida en segmentos numerados. ' +
          'Para cada segmento indicá quién habla: A = abogado (pregunta, repregunta, explica derechos, plazos, honorarios o estrategia, pide documentación), ' +
          'C = cliente (relata los hechos, cuenta su situación, responde), O = otra persona distinta (solo si es evidente). ' +
          'Un mismo segmento largo suele ser de una sola persona. Tené en cuenta la continuidad: una respuesta sigue a una pregunta. ' +
          'Respondé SOLO con las letras separadas por coma, una por segmento, en orden, sin nada más. Ejemplo para 4 segmentos: A,C,C,A' },
        { role: 'user', content: `Segmentos (${segmentos.length}):\n${lista}` },
      ],
    }),
  })
  if (!r.ok) throw new Error(`IA ${r.status}: ${(await r.text()).slice(0, 160)}`)
  const d = await r.json() as { choices?: { message?: { content?: string } }[] }
  const letras = (d.choices?.[0]?.message?.content ?? '').toUpperCase().match(/[ACO]/g) ?? []
  // Si devolvió menos etiquetas, se completa repitiendo la última
  return segmentos.map((_, i) => letras[i] ?? letras[letras.length - 1] ?? 'C')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  try {
    const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
    const { data: { user } } = await anon.auth.getUser()
    if (!user) return json(req, { error: 'No autorizado' }, 401)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const tipo = req.headers.get('content-type') ?? ''
    if (tipo.includes('multipart/form-data')) {
      const form = await req.formData()
      const audio = form.get('audio')
      if (!(audio instanceof Blob) || audio.size === 0) return json(req, { error: 'Falta el audio' }, 400)
      if (audio.size > MAX_AUDIO) return json(req, { error: 'Tramo de audio demasiado grande' }, 413)
      // El tope de bytes del guard es para texto: el tramo cuenta como una llamada
      const guard = await checkLlmGuard(admin, user.id, FUNCTION_NAME, 1000)
      if (!guard.ok) return json(req, { error: guard.error }, guard.status)
      const mime = audio.type || 'audio/webm'
      const ext = mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac') ? 'mp4' : mime.includes('ogg') ? 'ogg' : mime.includes('wav') ? 'wav' : 'webm'
      const segmentos = await whisper(audio, `tramo.${ext}`, String(form.get('previo') ?? ''))
      logLlmCall(admin, user.id, FUNCTION_NAME, 1000)
      return json(req, { segmentos })
    }

    const body = await req.json().catch(() => null) as { accion?: string; segmentos?: string[] } | null
    if (body?.accion === 'hablantes') {
      const segs = (body.segmentos ?? []).map((s) => String(s)).filter(Boolean).slice(0, 1500)
      if (!segs.length) return json(req, { etiquetas: [] })
      const bytes = new TextEncoder().encode(segs.join('\n')).length
      const guard = await checkLlmGuard(admin, user.id, FUNCTION_NAME, bytes)
      if (!guard.ok) return json(req, { error: guard.error }, guard.status)
      // Entrevistas largas: de a 250 segmentos, con contexto del bloque anterior implícito en el orden
      const etiquetas: string[] = []
      for (let i = 0; i < segs.length; i += 250) etiquetas.push(...await etiquetarHablantes(segs.slice(i, i + 250)))
      logLlmCall(admin, user.id, FUNCTION_NAME, bytes)
      return json(req, { etiquetas })
    }
    return json(req, { error: 'Pedido inválido' }, 400)
  } catch (err) {
    console.error('[consulta-transcribir]', err)
    return json(req, { error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

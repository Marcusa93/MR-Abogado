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

type Segmento = { text: string; start?: number; end?: number; no_speech_prob?: number; avg_logprob?: number; compression_ratio?: number }
export type SegmentoTramo = { texto: string; inicio: number; fin: number }

async function whisper(audio: Blob, nombre: string, previo: string): Promise<SegmentoTramo[]> {
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
      .map((s) => ({ texto: s.text.trim(), inicio: s.start ?? 0, fin: s.end ?? 0 }))
      .filter((s) => s.texto && !ALUCINACIONES.some((re) => re.test(s.texto)))
  }
  throw new Error(ultimoError)
}

type EntradaHablante = { texto: string; tono?: number | null }

async function llm(system: string, user: string, maxTokens: number): Promise<string> {
  const key = Deno.env.get('OPENROUTER_API_KEY')
  if (!key) throw new Error('Falta OPENROUTER_API_KEY')
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4.6', temperature: 0, max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  })
  if (!r.ok) throw new Error(`IA ${r.status}: ${(await r.text()).slice(0, 160)}`)
  const d = await r.json() as { choices?: { message?: { content?: string } }[] }
  return d.choices?.[0]?.message?.content ?? ''
}

async function etiquetarHablantes(segmentos: EntradaHablante[], conTerceros: boolean): Promise<string[]> {
  const conTono = segmentos.some((s) => s.tono)
  const lista = segmentos.map((s, i) => `${i + 1}.${s.tono ? ` [tono ${Math.round(s.tono)} Hz]` : ''} ${s.texto}`).join('\n')
  const salida = await llm(
    'Recibís la transcripción de una entrevista en un estudio jurídico, dividida en segmentos numerados. ' +
    'Indicá quién dice cada segmento: A = abogado (pregunta, repregunta, explica derechos, plazos, honorarios o estrategia, pide documentación), ' +
    `C = cliente (relata los hechos, cuenta su situación, responde)${conTerceros ? ', O = otra persona presente (familiar, acompañante), solo si es evidente' : ''}.\n` +
    'Reglas:\n' +
    '- Cambiá de hablante SOLO cuando haya evidencia clara: una pregunta seguida de su respuesta, un cambio de perspectiva (\"mi jefe me dijo\" frente a \"¿cuándo le dijo?\"), o una diferencia de tono de voz.\n' +
    '- Ante la duda, el segmento es de la misma persona que el anterior. Un relato largo en primera persona es de una sola persona.\n' +
    '- Es posible que hable una sola persona todo el tiempo (por ejemplo, el abogado dictando o probando): si no hay intercambio real de preguntas y respuestas, poné la misma letra en todos.\n' +
    (conTono ? '- El tono es la frecuencia media de la voz medida en ese segmento. Tonos parecidos (diferencia menor a 20 %) sugieren la misma persona; una diferencia grande y sostenida (por ejemplo 120 Hz frente a 210 Hz) sugiere otra persona. Es una pista, no una prueba: combinala con el contenido.\n' : '') +
    'Respondé SOLO con las letras separadas por coma, una por segmento, en orden. Ejemplo para 4 segmentos: A,C,C,A',
    `Segmentos (${segmentos.length}):\n${lista}`, 4000)
  const letras = (salida.toUpperCase().match(/[ACO]/g) ?? []).map((l) => (l === 'O' && !conTerceros ? 'C' : l))
  return segmentos.map((_, i) => letras[i] ?? letras[letras.length - 1] ?? 'C')
}

const AREAS = ['laboral_trabajador', 'laboral_empleador', 'civil', 'familia', 'previsional', 'penal', 'otro']

/** Propone qué incorporar de la entrevista a la consulta, sin pisar lo que ya está. */
async function propuestaIncorporar(c: Record<string, unknown>, transcripcion: string, marcas: string[]) {
  const preguntas = Array.isArray(c.preguntas_sugeridas) ? (c.preguntas_sugeridas as string[]) : []
  const salida = await llm(
    'Sos abogado del Estudio Jurídico Dr. Marco Rossi (Tucumán, Argentina; foro local de Tucumán: no hay SECLO, la instancia administrativa laboral es la Secretaría de Estado de Trabajo). Recibís el estado actual de una consulta y la transcripción de la entrevista con el cliente. ' +
    'Tu tarea es proponer qué incorporar a la consulta. No inventes nada: todo tiene que surgir de la transcripción. No repitas lo que ya figura en los hechos cargados.\n' +
    'Devolvé SOLO un JSON válido, sin markdown, con esta forma:\n' +
    '{\n' +
    '  "hechos_nuevos": ["hecho concreto, redactado en tercera persona, con fechas, montos y nombres si se mencionaron"],\n' +
    '  "contradicciones": ["diferencia entre lo que ya estaba cargado y lo que dijo en la entrevista"],\n' +
    '  "datos_cliente": { "nombre": "", "apellido": "", "telefono": "", "email": "" },\n' +
    `  "areas": ["una o más de: ${AREAS.join(', ')}"],\n` +
    '  "preguntas_respondidas": [números de las preguntas pendientes que quedaron respondidas en la entrevista],\n' +
    '  "preguntas_nuevas": ["pregunta concreta que falta hacerle al cliente"],\n' +
    '  "documentacion": ["documento concreto que hay que pedirle (ej. telegrama de despido, últimos 3 recibos de sueldo)"],\n' +
    '  "plazos": ["plazo o vencimiento que puede estar corriendo, con la fecha de inicio que surge de la entrevista"]\n' +
    '}\n' +
    'En datos_cliente completá solo lo que el cliente dijo explícitamente; dejá vacío lo demás. Las marcas del abogado (si hay) señalan los momentos que consideró importantes: priorizalos.',
    `CONSULTA ACTUAL\nCliente: ${[c.nombre, c.apellido].filter(Boolean).join(' ') || '(sin nombre)'}\nTeléfono: ${c.telefono ?? ''}\nEmail: ${c.email ?? ''}\n` +
    `Áreas: ${((c.areas_derecho as string[] | null) ?? [c.tipo_asunto]).join(', ')}\n\nHECHOS YA CARGADOS:\n${(c.notas_libres as string) || '(vacío)'}\n\n` +
    `PREGUNTAS PENDIENTES:\n${preguntas.map((p, i) => `${i + 1}. ${p}`).join('\n') || '(ninguna)'}\n\n` +
    (marcas.length ? `MARCAS DEL ABOGADO:\n${marcas.map((m) => `- ${m}`).join('\n')}\n\n` : '') +
    `TRANSCRIPCIÓN DE LA ENTREVISTA:\n${transcripcion}`, 4000)
  const m = salida.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('La IA no devolvió el formato esperado')
  const p = JSON.parse(m[0]) as Record<string, unknown>
  const lista = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [])
  const dc = (p.datos_cliente ?? {}) as Record<string, unknown>
  return {
    hechos_nuevos: lista(p.hechos_nuevos),
    contradicciones: lista(p.contradicciones),
    datos_cliente: Object.fromEntries(['nombre', 'apellido', 'telefono', 'email']
      .map((k) => [k, String(dc[k] ?? '').trim()]).filter(([k, v]) => v && !String(c[k] ?? '').trim())),
    areas: lista(p.areas).filter((a) => AREAS.includes(a)),
    preguntas_respondidas: (Array.isArray(p.preguntas_respondidas) ? p.preguntas_respondidas : [])
      .map((n) => Number(n) - 1).filter((n) => Number.isInteger(n) && n >= 0 && n < preguntas.length),
    preguntas_nuevas: lista(p.preguntas_nuevas),
    documentacion: lista(p.documentacion),
    plazos: lista(p.plazos),
  }
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

    const body = await req.json().catch(() => null) as {
      accion?: string; segmentos?: (string | EntradaHablante)[]; terceros?: boolean
      consulta_id?: string; transcripcion?: string; marcas?: string[]
    } | null
    if (body?.accion === 'hablantes') {
      const segs = (body.segmentos ?? [])
        .map((s) => (typeof s === 'string' ? { texto: s } : { texto: String(s?.texto ?? ''), tono: Number(s?.tono) || null }))
        .filter((s) => s.texto).slice(0, 1500)
      if (!segs.length) return json(req, { etiquetas: [] })
      const bytes = new TextEncoder().encode(segs.map((s) => s.texto).join('\n')).length
      const guard = await checkLlmGuard(admin, user.id, FUNCTION_NAME, bytes)
      if (!guard.ok) return json(req, { error: guard.error }, guard.status)
      // Entrevistas largas: de a 250 segmentos, con contexto del bloque anterior implícito en el orden
      const etiquetas: string[] = []
      for (let i = 0; i < segs.length; i += 250) etiquetas.push(...await etiquetarHablantes(segs.slice(i, i + 250), !!body.terceros))
      logLlmCall(admin, user.id, FUNCTION_NAME, bytes)
      return json(req, { etiquetas })
    }
    if (body?.accion === 'incorporar') {
      if (!body.consulta_id || !body.transcripcion?.trim()) return json(req, { error: 'Faltan la consulta o la transcripción' }, 400)
      // RLS: solo quien puede ver la consulta
      const { data: c } = await anon.from('consultas')
        .select('id, nombre, apellido, telefono, email, tipo_asunto, areas_derecho, notas_libres, preguntas_sugeridas')
        .eq('id', body.consulta_id).maybeSingle()
      if (!c) return json(req, { error: 'Consulta no encontrada' }, 404)
      const transcripcion = body.transcripcion.slice(0, 150_000)
      const bytes = new TextEncoder().encode(transcripcion + ((c as { notas_libres?: string }).notas_libres ?? '')).length
      const guard = await checkLlmGuard(admin, user.id, FUNCTION_NAME, bytes)
      if (!guard.ok) return json(req, { error: guard.error }, guard.status)
      const propuesta = await propuestaIncorporar(c as Record<string, unknown>, transcripcion, (body.marcas ?? []).map(String).slice(0, 50))
      logLlmCall(admin, user.id, FUNCTION_NAME, bytes)
      return json(req, { propuesta })
    }
    return json(req, { error: 'Pedido inválido' }, 400)
  } catch (err) {
    console.error('[consulta-transcribir]', err)
    return json(req, { error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

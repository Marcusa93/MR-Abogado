// Motor compartido para generar guiones de Reel.
// Lo usan: guion-reel-generar (desde la app) y telegram-contenido-webhook (desde Telegram).
//
// Provee: transcripción de audio, extracción de texto de una URL, el system
// prompt con la voz de Marco, y la generación del guion estructurado.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
const OPENAI_TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions'

export interface Guion {
  tema: string
  titulo: string
  duracion_estimada: string
  hooks: string[]
  escenas: { n: number; a_camara: string; visual: string; texto_pantalla: string }[]
  cierre: string
  cta: string
  notas_edicion: string
}

// ── Transcripción de audio (Groq Whisper, fallback OpenAI) ───────────────────
export async function transcribeAudio(audio: ArrayBuffer, mime: string, groqKey?: string, openaiKey?: string): Promise<string> {
  const ext = mime.includes('webm') ? 'webm'
    : mime.includes('mp4') || mime.includes('m4a') ? 'm4a'
    : mime.includes('mpeg') || mime.includes('mp3') ? 'mp3'
    : 'ogg'
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
    console.warn('[guion-reel-core] Groq falló, fallback OpenAI')
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
export async function extraerDeUrl(url: string): Promise<string> {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MRAbogadoBot/1.0)' } })
  if (!r.ok) throw new Error(`No se pudo abrir el link (${r.status})`)
  const html = await r.text()
  const sinScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
  return sinScripts
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16_000)
}

// ── Prompt: guion de Reel estructurado, con la voz de Marco ──────────────────
export const REEL_SYSTEM = `Sos el guionista de Reels del abogado Marco Rossi (Estudio Jurídico MR, Tucumán): especialista en IA aplicada al derecho, prueba electrónica y transformación digital de la justicia. Su voz es coloquial rioplatense, directa, apasionada y con ironía suave. Primera persona del singular.

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

// ── Generación del guion vía OpenRouter ──────────────────────────────────────
export async function generarGuion(material: string, contexto: string | undefined, apiKey: string): Promise<Guion | null> {
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

// Serializa el guion para el campo `cuerpo` de contenidos. Guarda también el
// material de origen (_material) para poder regenerar variantes sin el audio.
export function guionACuerpo(guion: Guion, material?: string): string {
  return JSON.stringify({ _tipo: 'guion_reel', ...guion, _material: (material ?? '').slice(0, 5000) })
}

// Fila para insertar en `contenidos` a partir de un guion.
export function guionAContenidoRow(guion: Guion, createdBy: string, enlace?: string | null, material?: string) {
  return {
    titulo: guion.titulo || 'Guion de Reel',
    categoria: 'video_guion',
    estado: 'borrador',
    cuerpo: guionACuerpo(guion, material),
    notas_internas: guion.notas_edicion || null,
    enlace_referencia: enlace ?? null,
    created_by: createdBy,
  }
}

// Lee el material de origen guardado en el cuerpo de un guion (para regenerar).
export function materialDeCuerpo(cuerpo: string | null): string {
  if (!cuerpo) return ''
  try {
    const j = JSON.parse(cuerpo) as { _material?: string }
    return j._material ?? ''
  } catch { return '' }
}

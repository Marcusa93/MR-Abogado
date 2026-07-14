// Desarrolla una idea de calendario en un post completo para su plataforma.
// Usa los mismos system prompts de voz de Marco Rossi que contenido-desde-video.
// Body: { contenido_id: string, imagen_url?: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { checkLlmGuard, logLlmCall } from '../_shared/llm-guard.ts'

const FUNCTION_NAME = 'contenido-desarrollar'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'anthropic/claude-haiku-4.5'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

// ── System prompts (mismos que contenido-desde-video, actualizados acá también si cambian) ──

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

const FB_PROMPT = `Sos Marco Rossi: abogado tecnoactivista, especialista en IA aplicada al derecho y prueba electrónica. Estudio Jurídico MR.

En Facebook tu voz es cercana y conversacional, pensada para un público más amplio y menos técnico que LinkedIn. Escribís un posteo en primera persona, como quien le explica algo importante a un conocido.

REGLAS:
- Gancho claro en la primera línea.
- Coloquial rioplatense, cálido y directo. Nada corporativo. Primera persona del singular.
- Párrafos cortos, fáciles de leer. Podés usar algún emoji si suma tono.
- Explicá un poco más que en X o Instagram: el público de Facebook agradece contexto.
- Cerrá con una pregunta o invitación a comentar/compartir.
- Temáticas: prueba electrónica (WhatsApp, capturas, emails como prueba), IA en el derecho, casos reales, el futuro del abogado.
- No inventes datos. Si el material no lo dice, no lo afirmes.
- Hashtags al final, 2 a 5, de alcance amplio.`

const DESARROLLO_SUFFIX = `

---
A partir de la IDEA y el GANCHO que te paso, escribí el POST COMPLETO listo para publicar en esta plataforma, respetando TODO lo de arriba.
El gancho puede usarse como primera línea o adaptarse si encontrás una mejor apertura.
Devolvé SOLO un JSON válido sin texto adicional:
{"titulo": "título interno descriptivo (máx 60 chars)", "cuerpo": "el texto COMPLETO LISTO PARA PUBLICAR, tal cual, sin comillas envolventes", "hashtags": "los hashtags como string, o string vacío"}
El "cuerpo" es lo que Marco copia y pega directamente para publicar. Escribí en su voz. No inventes datos ni hechos que la idea no mencione.`

const PROMPTS: Record<string, string> = {
  linkedin: LINKEDIN_PROMPT + DESARROLLO_SUFFIX,
  twitter: X_PROMPT + DESARROLLO_SUFFIX,
  instagram: IG_PROMPT + DESARROLLO_SUFFIX,
  facebook: FB_PROMPT + DESARROLLO_SUFFIX,
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  try {
    const apiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!apiKey) return json(req, { error: 'OPENROUTER_API_KEY no configurada' }, 500)

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) return json(req, { error: 'No autorizado' }, 401)

    const body = await req.json().catch(() => null) as {
      contenido_id: string
      imagen_url?: string
    } | null

    if (!body?.contenido_id) return json(req, { error: 'contenido_id requerido' }, 400)

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: contenido, error: fetchErr } = await serviceClient
      .from('contenidos')
      .select('id, titulo, cuerpo, categoria')
      .eq('id', body.contenido_id)
      .is('deleted_at', null)
      .single()

    if (fetchErr || !contenido) return json(req, { error: 'Contenido no encontrado' }, 404)

    let ideaTexto = ''
    let gancho = ''
    try {
      const j = JSON.parse(contenido.cuerpo ?? '{}') as { _tipo?: string; texto?: string; gancho?: string }
      if (j._tipo !== 'idea_contenido') return json(req, { error: 'Este contenido no es una idea de calendario' }, 422)
      ideaTexto = j.texto ?? ''
      gancho = j.gancho ?? ''
    } catch {
      return json(req, { error: 'Cuerpo del contenido inválido' }, 422)
    }

    if (!ideaTexto) return json(req, { error: 'La idea no tiene texto' }, 422)

    const systemPrompt = PROMPTS[contenido.categoria]
    if (!systemPrompt) return json(req, { error: `Sin prompt configurado para la plataforma "${contenido.categoria}"` }, 422)

    const inputBytes = JSON.stringify(body).length
    const guard = await checkLlmGuard(serviceClient, user.id, FUNCTION_NAME, inputBytes)
    if (!guard.ok) return json(req, { error: guard.error }, guard.status)

    const imagenNota = body.imagen_url
      ? '\n\nNota: el post va acompañado de una imagen/foto. Escribí asumiendo que hay una imagen visual de apoyo.'
      : ''

    const userPrompt = `IDEA: ${ideaTexto}

GANCHO SUGERIDO: ${gancho || '(sin gancho definido, generá vos la apertura)'}${imagenNota}`

    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://app.marcorossi.com.ar',
        'X-Title': 'MR Abogado Desarrollar Post',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    })

    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`OpenRouter ${res.status}: ${txt.slice(0, 300)}`)
    }

    const payload = await res.json() as {
      choices?: { message?: { content?: string } }[]
    }
    const rawContent = payload.choices?.[0]?.message?.content
    if (!rawContent) throw new Error('OpenRouter no devolvió contenido')

    let result: { titulo?: string; cuerpo?: string; hashtags?: string } = {}
    try {
      const trimmed = rawContent.trim()
      const start = trimmed.indexOf('{')
      const end = trimmed.lastIndexOf('}')
      if (start !== -1 && end > start) {
        result = JSON.parse(trimmed.slice(start, end + 1))
      }
    } catch { /* noop */ }

    if (!result.cuerpo) throw new Error('El modelo no generó el post correctamente. Intentá de nuevo.')

    const updates: Record<string, string | null> = {
      cuerpo: result.cuerpo,
      hashtags: result.hashtags || null,
    }
    if (result.titulo) updates.titulo = result.titulo.slice(0, 200)
    if (body.imagen_url) updates.imagen_url = body.imagen_url

    const { error: updateErr } = await serviceClient
      .from('contenidos')
      .update(updates)
      .eq('id', body.contenido_id)

    if (updateErr) throw updateErr

    logLlmCall(serviceClient, user.id, FUNCTION_NAME, inputBytes)

    return json(req, { id: body.contenido_id, titulo: updates.titulo ?? contenido.titulo })
  } catch (err) {
    console.error('[contenido-desarrollar]', err)
    return json(req, { error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

// Genera el calendario editorial mensual para Marco Rossi.
// Crea borradores en la tabla contenidos con fecha asignada (publicar_el).
// Body: { year, month, plataformas: string[] }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { checkLlmGuard, logLlmCall } from '../_shared/llm-guard.ts'

const FUNCTION_NAME = 'calendario-editorial-generar'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'anthropic/claude-haiku-4.5'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

// ── Helpers de fecha ──────────────────────────────────────────────────────────

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function buildWorkingDays(
  year: number,
  month: number,
  feriaPeriods: { inicio: string; fin: string }[],
): string[] {
  const days: string[] = []
  const daysInMonth = new Date(year, month, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = isoDate(year, month, d)
    const dow = new Date(Date.UTC(year, month - 1, d)).getUTCDay()
    if (dow === 0 || dow === 6) continue
    if (feriaPeriods.some(p => iso >= p.inicio && iso <= p.fin)) continue
    days.push(iso)
  }
  return days
}

// ── Prompts ───────────────────────────────────────────────────────────────────

const MES_LABELS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const CONTEXTO_MES: Record<number, string> = {
  1:  'inicio de año judicial, regreso de feria de verano, renovación de contratos anuales',
  2:  'pleno ciclo judicial, cuotas alimentarias de inicio de año, acuerdos de marzo',
  3:  'se acerca el Día del Trabajador, inicio otoño, temporada de accidentes de tránsito',
  4:  'Semana Santa, inicio del segundo cuatrimestre, despidos de fin de ciclo',
  5:  'Día del Trabajador (1/5), ART y accidentes laborales, temporada de aguinaldo cercana',
  6:  'fin de año escolar, primer aguinaldo, liquidaciones de mitad de año',
  7:  'feria judicial de invierno, contenido educativo atemporal, preparación post-feria',
  8:  'regreso de feria, retomada judicial intensa, sentencias acumuladas de julio',
  9:  'primavera, renovación de contratos de alquiler, temporada de licitaciones públicas',
  10: 'Día de la Diversidad Cultural, cierre de causas de año, contratos de fin de ciclo',
  11: 'fin de año se acerca, liquidaciones, acuerdos extrajudiciales de cierre',
  12: 'aguinaldo, cierre del año judicial, reflexión anual, preparación para enero',
}

const FRECUENCIAS: Record<string, string> = {
  linkedin:    '4 posts por semana (Lunes, Martes, Jueves, Viernes). Tono técnico-profesional.',
  instagram:   '3 posts por semana (Lunes, Miércoles, Viernes). Contenido educativo y cercano.',
  twitter:     '3 posts por semana (Martes, Jueves, Viernes). Opinión breve, reacción a noticias.',
  video_guion: '1 guion de Reel/TikTok por semana (30-45 seg). Gancho fuerte, dato sorprendente, CTA.',
}

const SYSTEM_PROMPT = `Sos un especialista en marketing jurídico digital para el Dr. Marco Rossi, abogado en San Miguel de Tucumán, Argentina.

Marco ejerce derecho civil, laboral, familia y previsional. Su estilo es formal, directo y sin adornos.

PILARES DE CONTENIDO (rotá entre todos a lo largo del mes):
1. Laboral: despidos, indemnizaciones, ART, aguinaldo, vacaciones, licencias, derechos del trabajador
2. Familia: divorcio, cuota alimentaria, violencia de género, sucesiones, adopción, tenencia
3. Civil: contratos, alquileres, daños y perjuicios, derechos del consumidor, accidentes de tránsito
4. Previsional: jubilaciones, pensiones, ANSES, moratorias, beneficios sociales
5. Novedades: fallos relevantes de CSJN o Cámara, reformas legislativas, noticias jurídicas de impacto
6. Humanización: reflexiones del ejercicio profesional, valores del estudio, lecciones de la práctica

TONO POR PLATAFORMA:
- linkedin: técnico-profesional. Análisis de fallos, criterio jurídico, experiencias de casos. Público: colegas, empresas, RRHH. 150-300 palabras.
- instagram: educativo y cercano. Derechos populares, mitos legales, respuestas a dudas frecuentes. Emojis moderados, cierre con pregunta. Gancho visual en primera línea.
- twitter: opinión breve y directa. Una idea fuerte en pocas palabras. Ironía cuando aplica. Máx 240 caracteres.
- video_guion: guion de Reel/TikTok. Estructura: GANCHO (3 seg) → DESARROLLO (30 seg) → CTA (5 seg). Natural, conversacional, como si Marco hablara a cámara.

REGLAS CRÍTICAS:
- No repitas el mismo PILAR en el mismo día en distintas plataformas
- Distribuí los 6 pilares equitativamente a lo largo del mes
- Los temas deben ser específicos y accionables, no genéricos ("Cuándo te corresponde el doble de aguinaldo", no "El aguinaldo en Argentina")
- Cada idea debe ser suficientemente concreta para que Marco sepa exactamente qué escribir sin investigación adicional
- Para linkedin: un fallo real o una situación de práctica cotidiana
- Para instagram y twitter: un derecho o error común que la gente no conoce
- Para video_guion: un gancho de los primeros 3 segundos que detenga el scroll

Devolvé SOLO el JSON con esta estructura exacta, sin texto adicional:
{
  "plan": [
    {
      "fecha": "YYYY-MM-DD",
      "plataforma": "linkedin|instagram|twitter|video_guion",
      "titulo": "Título interno descriptivo (máx 70 caracteres)",
      "idea": "2-3 oraciones explicando el ángulo, qué decir y por qué importa ahora",
      "gancho": "Primera línea o primer enunciado del post (máx 90 caracteres)"
    }
  ]
}`

function buildUserPrompt(
  year: number,
  month: number,
  plataformas: string[],
  workingDays: string[],
): string {
  const mesLabel = MES_LABELS[month - 1]
  const contexto = CONTEXTO_MES[month] ?? 'período regular del año judicial'

  const frecDesc = plataformas
    .map(p => `• ${p}: ${FRECUENCIAS[p] ?? '2 posts/semana'}`)
    .join('\n')

  const dias = workingDays.join(', ')
  const totalSemanas = Math.round(workingDays.length / 5 * 10) / 10

  return `Generá el calendario editorial para ${mesLabel} ${year}.

CONTEXTO DEL MES: ${contexto}

PLATAFORMAS Y FRECUENCIA:
${frecDesc}

DÍAS HÁBILES DISPONIBLES (sin fines de semana ni feria judicial):
${dias}

Hay aproximadamente ${totalSemanas} semanas de contenido.

Asigná fechas de la lista de días disponibles. No uses fechas que no estén en esa lista.
Distribuí los posts respetando las frecuencias por plataforma.
Generá el plan completo para el mes.`
}

// ── Parseo ────────────────────────────────────────────────────────────────────

interface PlanItem {
  fecha: string
  plataforma: string
  titulo: string
  idea: string
  gancho?: string
}

function parsePlan(raw: string): PlanItem[] {
  const trimmed = raw.trim()
  let obj: unknown
  try {
    obj = JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start === -1 || end <= start) return []
    try { obj = JSON.parse(trimmed.slice(start, end + 1)) } catch { return [] }
  }
  const plan = (obj as { plan?: unknown })?.plan
  if (!Array.isArray(plan)) return []
  return plan.filter((item): item is PlanItem =>
    typeof item === 'object' && item !== null &&
    typeof (item as PlanItem).fecha === 'string' &&
    typeof (item as PlanItem).plataforma === 'string' &&
    typeof (item as PlanItem).titulo === 'string' &&
    typeof (item as PlanItem).idea === 'string'
  )
}

const PLATAFORMA_CATEGORIA: Record<string, string> = {
  linkedin: 'linkedin',
  instagram: 'instagram',
  twitter: 'twitter',
  video_guion: 'video_guion',
  tiktok: 'video_guion',
  reels: 'video_guion',
  x: 'twitter',
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
      year: number
      month: number
      plataformas: string[]
    } | null

    if (
      !body ||
      typeof body.year !== 'number' || body.year < 2020 ||
      typeof body.month !== 'number' || body.month < 1 || body.month > 12 ||
      !Array.isArray(body.plataformas) || body.plataformas.length === 0
    ) {
      return json(req, { error: 'Parámetros inválidos: se requiere year, month y al menos una plataforma.' }, 400)
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const inputBytes = JSON.stringify(body).length
    const guard = await checkLlmGuard(serviceClient, user.id, FUNCTION_NAME, inputBytes)
    if (!guard.ok) return json(req, { error: guard.error }, guard.status)

    // Períodos de feria para filtrar días inhábiles
    const { data: feriaRows } = await serviceClient
      .from('feria_judicial')
      .select('inicio, fin')
    const feriaPeriods = (feriaRows ?? []) as { inicio: string; fin: string }[]

    const workingDays = buildWorkingDays(body.year, body.month, feriaPeriods)

    if (workingDays.length === 0) {
      return json(req, { error: 'No hay días hábiles en ese mes (feria judicial completa).' }, 422)
    }

    const userPrompt = buildUserPrompt(body.year, body.month, body.plataformas, workingDays)

    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://app.marcorossi.com.ar',
        'X-Title': 'MR Abogado Calendario Editorial',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.75,
        max_tokens: 8000,
      }),
    })

    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`OpenRouter ${res.status}: ${txt.slice(0, 300)}`)
    }

    const payload = await res.json() as {
      choices?: { message?: { content?: string }; finish_reason?: string }[]
    }
    const content = payload.choices?.[0]?.message?.content
    if (!content) throw new Error('OpenRouter no devolvió contenido')

    const plan = parsePlan(content)
    if (plan.length === 0) throw new Error('El modelo no generó un plan válido. Intentá de nuevo.')

    // Filtrar items cuya fecha no esté en los días hábiles
    const workingSet = new Set(workingDays)
    const planValido = plan.filter(item => workingSet.has(item.fecha))

    const rows = planValido.map(item => ({
      titulo: item.titulo.slice(0, 200),
      categoria: PLATAFORMA_CATEGORIA[item.plataforma] ?? 'otro',
      estado: 'borrador',
      cuerpo: JSON.stringify({
        _tipo: 'idea_contenido',
        texto: item.idea,
        gancho: item.gancho ?? '',
      }),
      notas_internas: null,
      hashtags: null,
      publicar_el: item.fecha,
      created_by: user.id,
    }))

    const { error: insertError } = await serviceClient
      .from('contenidos')
      .insert(rows)
    if (insertError) throw insertError

    logLlmCall(serviceClient, user.id, FUNCTION_NAME, inputBytes)

    return json(req, { created: rows.length })
  } catch (err) {
    console.error('[calendario-editorial-generar]', err)
    return json(req, { error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

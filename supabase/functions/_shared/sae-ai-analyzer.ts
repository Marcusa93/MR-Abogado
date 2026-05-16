// ─── AI analysis of SAE movements via OpenRouter ─────────────────────────────
// Conservative extraction: only emits fields when they are explicitly stated in
// the source text. Returns null fields rather than guessing.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_MODEL = 'anthropic/claude-3.5-haiku'

export interface AiExtracted {
  partes: string[]
  fechas: { tipo: string; fecha_iso: string; descripcion: string }[]
  plazos: { dias: number; habiles: boolean; vence_aprox: string | null; descripcion: string }[]
}

export interface AiSuggestedAction {
  tipo: 'tarea' | 'turno'
  titulo: string
  fecha: string | null
  prioridad: 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE'
  descripcion: string
}

export interface AiAnalysis {
  summary: string
  extracted: AiExtracted
  suggested_action: AiSuggestedAction | null
  model: string
}

const SYSTEM_PROMPT = `Sos un asistente jurídico que analiza actuaciones del Sistema de Actuación Electrónica (SAE) de la justicia de Tucumán, Argentina.

Tu tarea es extraer información estructurada de cada actuación judicial. SOS EXTREMADAMENTE CONSERVADOR: solo extrae datos que estén EXPLÍCITAMENTE mencionados en el texto. Cuando dudes, dejá el campo vacío o null. NUNCA inventes fechas, partes ni plazos.

Devolvé SIEMPRE un JSON válido con esta estructura exacta:

{
  "summary": "Resumen breve de 1-2 oraciones de qué es esta actuación, en español neutro y conciso. Sin recomendaciones, sólo qué pasó.",
  "extracted": {
    "partes": ["Nombres de personas/empresas explícitamente mencionados como parte (no incluir jueces, secretarios ni funcionarios)"],
    "fechas": [
      {
        "tipo": "audiencia|vencimiento|notificacion|otro",
        "fecha_iso": "YYYY-MM-DD",
        "descripcion": "qué pasa en esa fecha"
      }
    ],
    "plazos": [
      {
        "dias": 5,
        "habiles": true,
        "vence_aprox": "YYYY-MM-DD o null si no se puede calcular",
        "descripcion": "para qué corre ese plazo"
      }
    ]
  },
  "suggested_action": {
    "tipo": "tarea|turno",
    "titulo": "título corto y accionable, ej: 'Contestar traslado'",
    "fecha": "YYYY-MM-DD o null",
    "prioridad": "BAJA|MEDIA|ALTA|URGENTE",
    "descripcion": "qué hay que hacer concretamente"
  }
}

REGLAS:
- summary debe ser SIEMPRE un string no vacío.
- extracted.partes/fechas/plazos: arrays vacíos [] si no hay datos explícitos.
- suggested_action: null si la actuación no requiere acción del abogado (ej: cargos administrativos, mostradores, sorteos).
- tipo "turno" SOLO si hay una audiencia agendada explícita.
- tipo "tarea" cuando hay una acción a ejecutar (ej: contestar, presentar, apelar, asistir).
- prioridad URGENTE si el plazo es ≤ 3 días, ALTA si ≤ 7 días, MEDIA si ≤ 15 días, BAJA en otro caso.
- Las fechas se expresan en formato DD/MM/YYYY en el texto. Convertilas a YYYY-MM-DD.
- "días hábiles" = habiles: true. "días" sin aclarar en juzgados = habiles: true por defecto.
- vence_aprox: si hay plazo en días hábiles desde la fecha de la actuación, calculá la fecha aproximada (sumando días hábiles, sin contar sábados ni domingos; ignorá feriados).
- NO incluyas markdown ni \`\`\`json. Devolvé el JSON pelado.`

interface AnalyzeInput {
  titulo: string
  cuerpo: string | null
  tipo_movimiento: string
  fecha: string
  apiKey: string
  model?: string
  /** Texto extraído de uno o varios PDFs adjuntos (opcional). */
  documentText?: string
  /** Nombre de los archivos analizados, para contexto. */
  documentFileNames?: string[]
}

export async function analyzeMovementWithAI(input: AnalyzeInput): Promise<AiAnalysis> {
  const docSection = input.documentText && input.documentText.trim()
    ? `

Texto extraído de archivo(s) adjunto(s)${input.documentFileNames?.length ? ` (${input.documentFileNames.join(', ')})` : ''}:
${input.documentText.trim()}`
    : ''

  const userMessage = `Actuación judicial:

Tipo clasificado: ${input.tipo_movimiento}
Fecha: ${input.fecha}
Título: ${input.titulo}
Cuerpo:
${input.cuerpo ?? '(sin cuerpo de texto disponible)'}${docSection}`

  const model = input.model ?? DEFAULT_MODEL

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.apiKey}`,
      'HTTP-Referer': 'https://app.marcorossi.com.ar',
      'X-Title': 'MR Abogado SAE Analyzer',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 800,
    }),
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${txt.slice(0, 200)}`)
  }

  const payload = await res.json() as { choices?: { message?: { content?: string } }[] }
  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error('OpenRouter no devolvió contenido')

  const parsed = JSON.parse(content) as Partial<AiAnalysis> & { extracted?: Partial<AiExtracted> }

  // Normalize / validate
  const extracted: AiExtracted = {
    partes: Array.isArray(parsed.extracted?.partes) ? parsed.extracted.partes.filter((s): s is string => typeof s === 'string' && s.trim().length > 0) : [],
    fechas: Array.isArray(parsed.extracted?.fechas) ? parsed.extracted.fechas.filter(isValidFechaEntry) : [],
    plazos: Array.isArray(parsed.extracted?.plazos) ? parsed.extracted.plazos.filter(isValidPlazoEntry) : [],
  }

  const suggested_action = isValidSuggestedAction(parsed.suggested_action) ? parsed.suggested_action : null

  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
    extracted,
    suggested_action,
    model,
  }
}

function isValidFechaEntry(e: unknown): e is { tipo: string; fecha_iso: string; descripcion: string } {
  if (!e || typeof e !== 'object') return false
  const o = e as Record<string, unknown>
  return typeof o.tipo === 'string' && typeof o.fecha_iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.fecha_iso) && typeof o.descripcion === 'string'
}

function isValidPlazoEntry(e: unknown): e is { dias: number; habiles: boolean; vence_aprox: string | null; descripcion: string } {
  if (!e || typeof e !== 'object') return false
  const o = e as Record<string, unknown>
  if (typeof o.dias !== 'number' || !Number.isFinite(o.dias) || o.dias <= 0) return false
  if (typeof o.habiles !== 'boolean') return false
  if (o.vence_aprox !== null && !(typeof o.vence_aprox === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.vence_aprox))) return false
  if (typeof o.descripcion !== 'string') return false
  return true
}

function isValidSuggestedAction(e: unknown): e is AiSuggestedAction {
  if (!e || typeof e !== 'object') return false
  const o = e as Record<string, unknown>
  if (o.tipo !== 'tarea' && o.tipo !== 'turno') return false
  if (typeof o.titulo !== 'string' || !o.titulo.trim()) return false
  if (o.fecha !== null && !(typeof o.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.fecha))) return false
  if (!['BAJA', 'MEDIA', 'ALTA', 'URGENTE'].includes(o.prioridad as string)) return false
  if (typeof o.descripcion !== 'string') return false
  return true
}

// Tipos de actuación que NO ameritan análisis IA (puro ruido administrativo)
const SKIP_TIPOS = new Set(['planilla'])

const SKIP_TITLE_PATTERNS = [
  /^mostrador/i,
  /^cargo - cargo/i,
  /^pase /i,
  /^acta de sorteo/i,
  /^cargo inicio digital/i,
]

export function shouldAnalyzeMovement(tipo: string, titulo: string, cuerpo: string | null): boolean {
  if (SKIP_TIPOS.has(tipo)) return false
  if (SKIP_TITLE_PATTERNS.some(rx => rx.test(titulo))) return false
  // Need either body or a meaningful title
  if (!cuerpo && titulo.length < 10) return false
  return true
}

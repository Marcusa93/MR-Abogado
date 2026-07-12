// ─── AI analysis of SAE movements via OpenRouter ─────────────────────────────
// Conservative extraction: only emits fields when they are explicitly stated in
// the source text. Returns null fields rather than guessing.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5'

export interface AiExtracted {
  partes: string[]
  fechas: { tipo: string; fecha_iso: string; descripcion: string }[]
  plazos: { dias: number; habiles: boolean; vence_aprox: string | null; descripcion: string }[]
  juez: { nombre: string; cargo: 'juez' | 'secretario' | 'vocal' | 'otro' } | null
  normativa_citada: { norma: string; uso: string | null }[]
  jurisprudencia_citada: { cita: string; uso: string | null }[]
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
    ],
    "juez": {
      "nombre": "Nombre completo del magistrado o secretario firmante, si está EXPLÍCITAMENTE mencionado",
      "cargo": "juez|secretario|vocal|otro"
    },
    "normativa_citada": [
      {
        "norma": "Art. 1741 CCyC | Ley 24.557 art. 6 | CPCC Tucumán art. 56 — con número y artículo cuando estén en el texto",
        "uso": "para qué se cita. null si no se aclara."
      }
    ],
    "jurisprudencia_citada": [
      {
        "cita": "CSJN 'Aquino, Isacio c/ Cargo' (2004) | CSJTuc Sala Civil autos N° 123/20 — con autos y tribunal cuando estén en el texto",
        "uso": "para qué se invoca. null si no se aclara."
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
- juez: null si el texto no menciona explícitamente un magistrado o secretario como firmante o titular. Solo incluir si hay nombre explícito (no inferir). cargo "secretario" si figura como "Secretario/a", "juez" si figura como "Juez/a" o "Titular", "vocal" si es tribunal colegiado.
- normativa_citada: solo normas con número/artículo explícitos. Ej: "Art. 1741 CCyC" no "el código civil". Arrays [] si no hay citas.
- jurisprudencia_citada: solo fallos con autos y tribunal explícitos. Ej: "CSJN 'Aquino'" no "fallo de la Corte". Arrays [] si no hay citas.
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

// Tope de caracteres del texto fuente que mandamos al LLM. Las actuaciones
// largas (sentencias definitivas) pueden tener decenas de miles de caracteres;
// más allá de esto el costo/latencia no compensa y arriesga timeouts.
const MAX_SOURCE_CHARS = 60_000

function truncar(texto: string, max = MAX_SOURCE_CHARS): string {
  if (texto.length <= max) return texto
  return `${texto.slice(0, max)}\n\n[… TEXTO TRUNCADO POR LONGITUD …]`
}

export async function analyzeMovementWithAI(input: AnalyzeInput): Promise<AiAnalysis> {
  const docSection = input.documentText && input.documentText.trim()
    ? `

Texto extraído de archivo(s) adjunto(s)${input.documentFileNames?.length ? ` (${input.documentFileNames.join(', ')})` : ''}:
${truncar(input.documentText.trim())}`
    : ''

  const cuerpo = input.cuerpo ? truncar(input.cuerpo) : '(sin cuerpo de texto disponible)'

  const userMessage = `Actuación judicial:

Tipo clasificado: ${input.tipo_movimiento}
Fecha: ${input.fecha}
Título: ${input.titulo}
Cuerpo:
${cuerpo}${docSection}`

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
      temperature: 0.1,
      max_tokens: 4000,
    }),
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${txt.slice(0, 200)}`)
  }

  const payload = await res.json() as {
    choices?: { message?: { content?: string }; finish_reason?: string }[]
  }
  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error('OpenRouter no devolvió contenido')
  if (payload.choices?.[0]?.finish_reason === 'length') {
    throw new Error('Respuesta IA truncada (max_tokens). La actuación es demasiado larga para el modelo.')
  }

  const parsed = parseJsonLoose(content) as Partial<AiAnalysis> & { extracted?: Partial<AiExtracted> }

  // Normalize / validate
  const extracted: AiExtracted = {
    partes: Array.isArray(parsed.extracted?.partes) ? parsed.extracted.partes.filter((s): s is string => typeof s === 'string' && s.trim().length > 0) : [],
    fechas: Array.isArray(parsed.extracted?.fechas) ? parsed.extracted.fechas.filter(isValidFechaEntry) : [],
    plazos: Array.isArray(parsed.extracted?.plazos) ? parsed.extracted.plazos.filter(isValidPlazoEntry) : [],
    juez: isValidJuezEntry(parsed.extracted?.juez) ? (parsed.extracted.juez as AiExtracted['juez']) : null,
    normativa_citada: Array.isArray(parsed.extracted?.normativa_citada) ? parsed.extracted.normativa_citada.filter(isValidNormaCita) : [],
    jurisprudencia_citada: Array.isArray(parsed.extracted?.jurisprudencia_citada) ? parsed.extracted.jurisprudencia_citada.filter(isValidJurisCita) : [],
  }

  const suggested_action = isValidSuggestedAction(parsed.suggested_action) ? parsed.suggested_action : null

  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
    extracted,
    suggested_action,
    model,
  }
}

// Parseo tolerante: el modelo a veces envuelve el JSON en fences de markdown
// (```json ... ```) o agrega texto antes/después pese a las instrucciones.
function parseJsonLoose(raw: string): unknown {
  const trimmed = raw.trim()
  try {
    return JSON.parse(trimmed)
  } catch { /* sigue */ }

  // Quitar fences ```json ... ```
  const sinFence = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  try {
    return JSON.parse(sinFence)
  } catch { /* sigue */ }

  // Tomar el primer objeto balanceado { ... }
  const start = sinFence.indexOf('{')
  const end = sinFence.lastIndexOf('}')
  if (start !== -1 && end > start) {
    return JSON.parse(sinFence.slice(start, end + 1))
  }
  throw new Error('La respuesta IA no contiene JSON válido.')
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

function isValidNormaCita(e: unknown): e is { norma: string; uso: string | null } {
  if (!e || typeof e !== 'object') return false
  const o = e as Record<string, unknown>
  return typeof o.norma === 'string' && o.norma.trim().length > 2
    && (o.uso === null || typeof o.uso === 'string')
}

function isValidJurisCita(e: unknown): e is { cita: string; uso: string | null } {
  if (!e || typeof e !== 'object') return false
  const o = e as Record<string, unknown>
  return typeof o.cita === 'string' && o.cita.trim().length > 2
    && (o.uso === null || typeof o.uso === 'string')
}

function isValidJuezEntry(e: unknown): e is { nombre: string; cargo: string } {
  if (!e || typeof e !== 'object') return false
  const o = e as Record<string, unknown>
  return typeof o.nombre === 'string' && o.nombre.trim().length > 0
    && ['juez', 'secretario', 'vocal', 'otro'].includes(o.cargo as string)
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

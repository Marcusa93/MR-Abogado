// ─── Extracción de aprendizajes a partir de una sentencia/resolución ─────────
// Lee texto de una sentencia y devuelve qué se hizo lugar, qué se rechazó,
// fundamentos y takeaway para el abogado. Conservador: solo emite con texto
// explícito.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4'

export interface AprendizajeSentencia {
  resumen_resolucion: string
  hizo_lugar: string[]
  rechazo: string[]
  fundamentos_clave: { norma_o_doctrina: string; uso: string }[]
  juez_identificado: string | null
  organismo_identificado: string | null
  takeaway_para_proximo_caso: string
  confidence: 'baja' | 'media' | 'alta'
}

const SYSTEM_PROMPT = `Sos un asistente jurídico que analiza sentencias y resoluciones judiciales argentinas para extraer aprendizajes accionables para el abogado.

OBJETIVO: identificar qué le dieron lugar, qué le rechazaron, por qué, y qué debería hacer distinto la próxima vez en un caso parecido.

REGLA CARDINAL: solo extraés información EXPLÍCITAMENTE presente en el texto. Si dudás, dejá el campo vacío o decí "no surge del fallo". NUNCA inventes.

Devolvés SIEMPRE este JSON exacto, sin markdown ni \`\`\`:

{
  "resumen_resolucion": "1-2 oraciones: qué se resolvió y a favor de quién.",
  "hizo_lugar": ["Lista de pedidos/rubros/puntos a los que el tribunal HIZO LUGAR. Cada item es una oración corta. Array vacío si nada se hizo lugar."],
  "rechazo": ["Lista de pedidos/rubros/puntos que el tribunal RECHAZÓ. Cada item es una oración corta indicando QUÉ se rechazó. Array vacío si nada se rechazó."],
  "fundamentos_clave": [
    {
      "norma_o_doctrina": "Art. X CCyC | Doctrina del fallo Y | etc",
      "uso": "para qué se usó en este fallo"
    }
  ],
  "juez_identificado": "Nombre del juez/jueza que firma, si se identifica explícitamente. null en caso contrario.",
  "organismo_identificado": "Nombre del tribunal/juzgado tal como aparece. null si no surge.",
  "takeaway_para_proximo_caso": "1-3 oraciones de aprendizaje accionable: qué tendría que hacer distinto el abogado la próxima vez en un caso similar (qué fundamentar mejor, qué prueba sumar, qué norma invocar, qué evitar). Tiene que ser concreto, no genérico.",
  "confidence": "baja|media|alta — qué tan claro está todo. 'alta' solo si todos los campos surgen con claridad del texto."
}

REGLAS:
- "hizo_lugar" y "rechazo": cada item se redacta en voz pasiva o impersonal ("Se hizo lugar al reclamo por daño moral", "Se rechazó la indemnización por daño psicológico por falta de prueba pericial").
- "fundamentos_clave": capturar NORMAS con artículo y código ("Art. 1741 CCyC"), no genérico.
- "takeaway_para_proximo_caso": esto es lo más valioso. Tiene que ser específico — algo como "fundamentar el daño psicológico con pericia oficial, no informe privado, porque el tribunal valoró la prueba pericial sobre los informes de parte". NO escribir cosas genéricas como "ser más cuidadoso" o "presentar mejor prueba".
- "confidence" 'alta' SOLO si el fallo está claro y completo; 'media' si hay ambigüedad; 'baja' si el texto es fragmentario.`

interface AnalyzeInput {
  documentText: string
  contextLabel: string  // ej "Sentencia 'Pérez c/ González'" o "Actuación del 12/3"
  apiKey: string
  model?: string
}

export async function extractAprendizajeSentencia(input: AnalyzeInput): Promise<AprendizajeSentencia> {
  const text = input.documentText.trim()
  if (!text) throw new Error('Documento sin texto')

  // Cap input para predecibilidad
  const truncated = text.length > 60_000
  const docText = truncated ? text.slice(0, 60_000) + '\n\n[... TEXTO TRUNCADO ...]' : text

  const userMessage = `Contexto: ${input.contextLabel}

Texto de la sentencia/resolución:
${docText}`

  const model = input.model ?? DEFAULT_MODEL

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.apiKey}`,
      'HTTP-Referer': 'https://app.marcorossi.com.ar',
      'X-Title': 'MR Abogado Aprendizaje Sentencia',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1800,
    }),
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${txt.slice(0, 300)}`)
  }

  const payload = await res.json() as { choices?: { message?: { content?: string } }[] }
  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error('Modelo no devolvió contenido')

  const parsed = JSON.parse(content) as Partial<AprendizajeSentencia>

  // Normalizar y validar
  return {
    resumen_resolucion: typeof parsed.resumen_resolucion === 'string' ? parsed.resumen_resolucion.trim() : '',
    hizo_lugar: Array.isArray(parsed.hizo_lugar) ? parsed.hizo_lugar.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map(s => s.trim()) : [],
    rechazo: Array.isArray(parsed.rechazo) ? parsed.rechazo.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map(s => s.trim()) : [],
    fundamentos_clave: Array.isArray(parsed.fundamentos_clave)
      ? parsed.fundamentos_clave.filter(isValidFundamento)
      : [],
    juez_identificado: typeof parsed.juez_identificado === 'string' && parsed.juez_identificado.trim() ? parsed.juez_identificado.trim() : null,
    organismo_identificado: typeof parsed.organismo_identificado === 'string' && parsed.organismo_identificado.trim() ? parsed.organismo_identificado.trim() : null,
    takeaway_para_proximo_caso: typeof parsed.takeaway_para_proximo_caso === 'string' ? parsed.takeaway_para_proximo_caso.trim() : '',
    confidence: parsed.confidence === 'alta' || parsed.confidence === 'baja' ? parsed.confidence : 'media',
  }
}

function isValidFundamento(e: unknown): e is { norma_o_doctrina: string; uso: string } {
  if (!e || typeof e !== 'object') return false
  const o = e as Record<string, unknown>
  return typeof o.norma_o_doctrina === 'string' && o.norma_o_doctrina.trim().length > 0
    && typeof o.uso === 'string'
}

/**
 * Compone un texto narrativo legible para `aprendizajes_rulebook.contenido`
 * a partir de la extracción estructurada.
 */
export function aprendizajeToContenido(a: AprendizajeSentencia, contextLabel: string): string {
  const parts: string[] = []
  parts.push(`📌 ${a.resumen_resolucion || 'Sentencia analizada'}`)
  parts.push('')
  if (a.hizo_lugar.length > 0) {
    parts.push('✅ Hizo lugar a:')
    a.hizo_lugar.forEach(s => parts.push(`  • ${s}`))
  }
  if (a.rechazo.length > 0) {
    parts.push('')
    parts.push('❌ Rechazó:')
    a.rechazo.forEach(s => parts.push(`  • ${s}`))
  }
  if (a.fundamentos_clave.length > 0) {
    parts.push('')
    parts.push('📚 Fundamentos clave:')
    a.fundamentos_clave.forEach(f => parts.push(`  • ${f.norma_o_doctrina}${f.uso ? ` — ${f.uso}` : ''}`))
  }
  if (a.takeaway_para_proximo_caso) {
    parts.push('')
    parts.push('🎯 Para el próximo caso similar:')
    parts.push(a.takeaway_para_proximo_caso)
  }
  parts.push('')
  parts.push(`— extraído por IA de: ${contextLabel}`)
  return parts.join('\n')
}

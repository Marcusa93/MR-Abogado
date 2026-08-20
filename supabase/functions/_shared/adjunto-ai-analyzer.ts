// ─── AI analysis of adjuntos (PDFs subidos) via OpenRouter ───────────────────
// Extracción jurídica estructurada para demandas, contestaciones, sentencias y
// resoluciones. Mismas reglas conservadoras que sae-ai-analyzer: solo se emiten
// datos explícitos.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4'

export interface AdjuntoExtracted {
  tipo_documento: 'demanda' | 'contestacion' | 'sentencia' | 'resolucion' | 'apelacion' | 'escrito' | 'cedula' | 'otro'
  partes: { actores: string[]; demandados: string[] }
  objeto: string | null
  hechos_clave: string[]
  rubros_reclamados: { concepto: string; monto: number | null; moneda: 'ARS' | 'USD'; fundamento: string | null }[]
  normativa_citada: { norma: string; uso: string | null }[]
  jurisprudencia_citada: { cita: string; uso: string | null }[]
  resultado: string | null
}

export interface AdjuntoAnalysis {
  summary: string
  extracted: AdjuntoExtracted
  model: string
  token_usage?: { prompt: number; completion: number; total: number }
}

const SYSTEM_PROMPT = `Sos un asistente jurídico para un abogado litigante en Tucumán, Argentina. Analizás documentos PDF de un expediente (demandas, contestaciones, sentencias, resoluciones, escritos) y extraés información estructurada.

REGLA CARDINAL: solo extraés datos EXPLÍCITAMENTE mencionados en el texto. Si dudás, devolvés null o array vacío. NUNCA inventes partes, montos, normas ni fallos.

Devolvés SIEMPRE este JSON exacto, sin markdown ni \`\`\`:

{
  "summary": "2-3 oraciones describiendo qué tipo de documento es, partes principales y qué pretende/resuelve. Español neutro, sin opinión.",
  "extracted": {
    "tipo_documento": "demanda|contestacion|sentencia|resolucion|apelacion|escrito|cedula|otro",
    "partes": {
      "actores": ["Nombres de actores/demandantes mencionados explícitamente"],
      "demandados": ["Nombres de demandados/accionados mencionados explícitamente"]
    },
    "objeto": "Una oración: qué se reclama o resuelve. null si no es claro.",
    "hechos_clave": ["Hasta 5 hechos relevantes en orden cronológico. Cada uno en una oración corta."],
    "rubros_reclamados": [
      {
        "concepto": "Daño moral|Daño emergente|Lucro cesante|Daño psicológico|Daño físico|Gastos médicos|Pérdida de chance|Capital|Intereses|...",
        "monto": 5000000,
        "moneda": "ARS",
        "fundamento": "fundamento jurídico o de hecho del rubro, si está. null si no."
      }
    ],
    "normativa_citada": [
      {
        "norma": "Art. 1741 CCyC | Ley 24.240 art. 40 | etc",
        "uso": "para qué se cita la norma. null si no se aclara."
      }
    ],
    "jurisprudencia_citada": [
      {
        "cita": "CSJN 'Aquino, Isacio c/ Cargo Servicios Industriales' (2004) | CSJTuc Sala Civil ...",
        "uso": "para qué se cita el fallo. null si no se aclara."
      }
    ],
    "resultado": "Solo para sentencias/resoluciones: qué decidió el tribunal en una oración (ej: 'Hace lugar parcialmente, condena $X'). null en otros casos."
  }
}

REGLAS DE EXTRACCIÓN:
- monto: número en moneda local (sin separadores ni símbolos). null si el texto dice "a determinar" o "lo que en más o en menos resulte".
- moneda: "ARS" por defecto. "USD" solo si el texto dice US$/u$s/dólares explícitamente.
- Capturá la NORMA con su número/artículo. Ej: "Art. 1741 CCyC" no "el código civil".
- Capturá los FALLOS con autos y tribunal. Ej: "CSJN 'Aquino'" no "fallo de la Corte".
- partes: solo nombres propios. NO funcionarios (juez, secretario), NO genéricos ("la actora").
- summary debe ser SIEMPRE un string no vacío de 2-3 oraciones.
- Arrays vacíos [] si no hay datos. NO inventes "no se mencionan".`

interface AnalyzeInput {
  documentText?: string
  imageUrl?: string
  fileName: string
  categoria?: string | null
  apiKey: string
  model?: string
}

export async function analyzeAdjuntoWithAI(input: AnalyzeInput): Promise<AdjuntoAnalysis> {
  const model = input.model ?? DEFAULT_MODEL

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let messages: { role: string; content: any }[]
  let isVision = false

  if (input.imageUrl) {
    // Vision path: imagen enviada como URL firmada
    isVision = true
    messages = [
      {
        role: 'system',
        content: 'Sos un asistente jurídico para un abogado litigante en Tucumán, Argentina. Analizás imágenes de documentos jurídicos y extraés información estructurada. Respondé ÚNICAMENTE con JSON válido, sin markdown ni triple backticks.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: input.imageUrl },
          },
          {
            type: 'text',
            text: `Documento: ${input.fileName}${input.categoria ? ` (categoría declarada: ${input.categoria})` : ''}\n\nAnalizá la imagen adjunta y devolvé el JSON solicitado con la misma estructura que para documentos de texto.`,
          },
        ],
      },
    ]
  } else if (input.documentText !== undefined) {
    const text = input.documentText.trim()
    if (!text) throw new Error('Documento sin texto extraíble (probable PDF escaneado).')

    // Cap input to ~80K chars (~20K tokens) to keep costs predictable.
    const truncated = text.length > 80_000
    const docText = truncated ? text.slice(0, 80_000) + '\n\n[... TEXTO TRUNCADO ...]' : text

    const userMessage = `Documento: ${input.fileName}${input.categoria ? ` (categoría declarada: ${input.categoria})` : ''}

Contenido:
${docText}`

    messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ]
  } else {
    throw new Error('Se requiere documentText o imageUrl para analizar el adjunto.')
  }

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.apiKey}`,
      'HTTP-Referer': 'https://app.marcorossi.com.ar',
      'X-Title': 'MR Abogado Adjunto Analyzer',
    },
    body: JSON.stringify({
      model,
      messages,
      ...(isVision ? {} : { response_format: { type: 'json_object' } }),
      temperature: 0.1,
      max_tokens: 2000,
    }),
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${txt.slice(0, 300)}`)
  }

  const payload = await res.json() as {
    choices?: { message?: { content?: string } }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
  }
  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error('OpenRouter no devolvió contenido')

  const parsed = JSON.parse(content) as Partial<AdjuntoAnalysis> & { extracted?: Partial<AdjuntoExtracted> }

  const extracted: AdjuntoExtracted = normalizeExtracted(parsed.extracted)

  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
    extracted,
    model,
    token_usage: payload.usage ? {
      prompt: payload.usage.prompt_tokens ?? 0,
      completion: payload.usage.completion_tokens ?? 0,
      total: payload.usage.total_tokens ?? 0,
    } : undefined,
  }
}

function normalizeExtracted(raw: Partial<AdjuntoExtracted> | undefined): AdjuntoExtracted {
  const tipoValido = ['demanda', 'contestacion', 'sentencia', 'resolucion', 'apelacion', 'escrito', 'cedula', 'otro']
  const tipo = (typeof raw?.tipo_documento === 'string' && tipoValido.includes(raw.tipo_documento))
    ? raw.tipo_documento as AdjuntoExtracted['tipo_documento']
    : 'otro'

  const partes = {
    actores: filterStringArray(raw?.partes?.actores),
    demandados: filterStringArray(raw?.partes?.demandados),
  }

  return {
    tipo_documento: tipo,
    partes,
    objeto: typeof raw?.objeto === 'string' && raw.objeto.trim() ? raw.objeto.trim() : null,
    hechos_clave: filterStringArray(raw?.hechos_clave).slice(0, 8),
    rubros_reclamados: Array.isArray(raw?.rubros_reclamados) ? raw.rubros_reclamados.filter(isValidRubro) : [],
    normativa_citada: Array.isArray(raw?.normativa_citada) ? raw.normativa_citada.filter(isValidNormaCita) : [],
    jurisprudencia_citada: Array.isArray(raw?.jurisprudencia_citada) ? raw.jurisprudencia_citada.filter(isValidJurisCita) : [],
    resultado: typeof raw?.resultado === 'string' && raw.resultado.trim() ? raw.resultado.trim() : null,
  }
}

function filterStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map(s => s.trim()) : []
}

function isValidRubro(e: unknown): e is AdjuntoExtracted['rubros_reclamados'][number] {
  if (!e || typeof e !== 'object') return false
  const o = e as Record<string, unknown>
  if (typeof o.concepto !== 'string' || !o.concepto.trim()) return false
  if (o.monto !== null && (typeof o.monto !== 'number' || !Number.isFinite(o.monto))) return false
  if (o.moneda !== 'ARS' && o.moneda !== 'USD') return false
  return true
}

function isValidNormaCita(e: unknown): e is AdjuntoExtracted['normativa_citada'][number] {
  if (!e || typeof e !== 'object') return false
  const o = e as Record<string, unknown>
  return typeof o.norma === 'string' && o.norma.trim().length > 0
}

function isValidJurisCita(e: unknown): e is AdjuntoExtracted['jurisprudencia_citada'][number] {
  if (!e || typeof e !== 'object') return false
  const o = e as Record<string, unknown>
  return typeof o.cita === 'string' && o.cita.trim().length > 0
}

// Categorías de adjuntos que ameritan análisis IA automático al subir.
const AUTO_ANALYZE_CATEGORIES = new Set(['demanda', 'contestacion', 'sentencia', 'resolucion', 'apelacion'])

export function shouldAutoAnalyze(categoria: string | null | undefined): boolean {
  if (!categoria) return false
  return AUTO_ANALYZE_CATEGORIES.has(categoria)
}

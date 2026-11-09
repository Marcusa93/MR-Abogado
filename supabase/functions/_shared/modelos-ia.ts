// Selección de modelo según la tarea jurídica. Un solo lugar para cambiar modelos.
//
//  - Escritos de fondo (demanda, contestación, agravios, alegatos, recursos):
//    el modelo que mejor razona.
//  - Escritos de trámite: modelo intermedio, rápido y barato.
//  - Revisión antes de firmar: un modelo distinto del que redactó (segunda opinión).
//  - Extracción y clasificación: el más liviano.

export const MODELO = {
  preciso: 'anthropic/claude-opus-5.5',
  equilibrado: 'anthropic/claude-sonnet-5.5',
  liviano: 'anthropic/claude-haiku-5.5',
} as const

export type Calidad = 'auto' | 'preciso' | 'rapido'

const RE_FONDO = /demanda|contesta|alegato|agravio|memorial|apelaci|recurso|casaci|nulidad|queja|reposici|revocatoria|ofrec\w* (de )?prueba|amparo|medida cautelar|cautelar|embargo|incidente|excepci|impugna|liquidaci|tutela|interdicto|ejecuci/i

export function esEscritoDeFondo(tipo: string): boolean {
  return RE_FONDO.test(tipo)
}

export interface EleccionModelo {
  modelo: string
  calidad: 'preciso' | 'rapido'
  motivo: string
}

export function modeloParaEscrito(tipo: string, calidad: Calidad | null | undefined): EleccionModelo {
  if (calidad === 'preciso') return { modelo: MODELO.preciso, calidad: 'preciso', motivo: 'Elegiste modo preciso.' }
  if (calidad === 'rapido') return { modelo: MODELO.equilibrado, calidad: 'rapido', motivo: 'Elegiste modo rápido.' }
  return esEscritoDeFondo(tipo)
    ? { modelo: MODELO.preciso, calidad: 'preciso', motivo: 'Escrito de fondo: se usa el modelo que mejor argumenta.' }
    : { modelo: MODELO.equilibrado, calidad: 'rapido', motivo: 'Escrito de trámite: alcanza con el modelo rápido.' }
}

/** Modelo para revisar un escrito: distinto del que lo redactó. */
export function modeloRevisor(modeloRedactor: string | null | undefined): string {
  return modeloRedactor?.includes('opus') ? MODELO.equilibrado : MODELO.preciso
}

/** Nombre corto para mostrar en la interfaz. */
export function nombreModelo(id: string | null | undefined): string {
  if (!id) return '—'
  const m = id.match(/claude-(opus|sonnet|haiku|fable)-([\d.]+)/)
  if (!m) return id.replace(/^[^/]+\//, '')
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}`
}

export interface UsoLlm {
  costo_usd: number | null
  tokens_entrada: number | null
  tokens_salida: number | null
}

/** Lee el bloque `usage` de OpenRouter (pedirlo con `usage: { include: true }`). */
export function leerUso(payload: unknown): UsoLlm {
  const u = (payload as { usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number } })?.usage
  return {
    costo_usd: typeof u?.cost === 'number' ? u.cost : null,
    tokens_entrada: typeof u?.prompt_tokens === 'number' ? u.prompt_tokens : null,
    tokens_salida: typeof u?.completion_tokens === 'number' ? u.completion_tokens : null,
  }
}

export function sumarUso(a: UsoLlm, b: UsoLlm): UsoLlm {
  const s = (x: number | null, y: number | null) => (x == null && y == null ? null : (x ?? 0) + (y ?? 0))
  return { costo_usd: s(a.costo_usd, b.costo_usd), tokens_entrada: s(a.tokens_entrada, b.tokens_entrada), tokens_salida: s(a.tokens_salida, b.tokens_salida) }
}

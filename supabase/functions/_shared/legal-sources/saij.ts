// ─────────────────────────────────────────────────────────────────────────
// Connector SAIJ — Sistema Argentino de Información Jurídica
//
// Re-implementación en Deno de los endpoints internos que usa el MCP
// joaquinescalante23/saij-mcp. Sin axios, sin Node — fetch nativo.
//
// Endpoints SAIJ:
//   GET /busqueda?o&p&f&r&v          → JSON { queryObjectData, searchResults }
//   GET /view-document?guid=         → STRING que se parsea a JSON
//                                       { document: { content: {...} } }
//   GET /suggest?key&amount&suggesterName=suggest → array de strings
//
// Filter string format (campo `f`):
//   "Total|Tipo de Documento/Jurisprudencia|Jurisdicción/Nacional|Tema/Civil[3,1]"
// ─────────────────────────────────────────────────────────────────────────

import type {
  LegalSource,
  SearchInput,
  SearchOutput,
  LegalDocSummary,
  LegalDocFull,
} from './types.ts'

// SAIJ bloquea IPs cloud (incluido Supabase Edge). Si está configurado
// SAIJ_PROXY_URL apuntamos ahí — un proxy en una IP residencial argentina
// que reenvía las requests con auth por X-Proxy-Token.
const DIRECT_BASE_URL = 'https://www.saij.gob.ar'
const PROXY_URL = Deno.env.get('SAIJ_PROXY_URL') ?? ''
const PROXY_TOKEN = Deno.env.get('SAIJ_PROXY_TOKEN') ?? ''
const USE_PROXY = PROXY_URL.length > 0
const BASE_URL = USE_PROXY ? `${PROXY_URL.replace(/\/$/, '')}/proxy` : DIRECT_BASE_URL

const TIMEOUT_MS = 30_000
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const COMMON_HEADERS: HeadersInit = USE_PROXY
  ? {
      'X-Proxy-Token': PROXY_TOKEN,
      'Accept': 'application/json, text/plain, */*',
    }
  : {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
      'Origin': DIRECT_BASE_URL,
      'Referer': `${DIRECT_BASE_URL}/`,
    }

// ─── HTTP con retries y timeout ──────────────────────────────────────────
async function saijFetch(path: string, params: Record<string, string>): Promise<unknown> {
  // URL constructor necesita el path como segundo arg "absolute". Si BASE_URL
  // termina sin slash y path empieza con /, queda bien.
  const url = new URL(BASE_URL + (path.startsWith('/') ? path : '/' + path))
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const MAX_RETRIES = 3
  let lastErr: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(url.toString(), {
        headers: COMMON_HEADERS,
        signal: ctrl.signal,
      })
      clearTimeout(t)
      // 4xx no se retrylea
      if (res.status >= 400 && res.status < 500) {
        const txt = await res.text().catch(() => '')
        throw new Error(`SAIJ ${res.status}: ${txt.slice(0, 300)}`)
      }
      if (!res.ok) throw new Error(`SAIJ HTTP ${res.status}`)
      const text = await res.text()
      try { return JSON.parse(text) }
      catch { return text }
    } catch (e) {
      clearTimeout(t)
      lastErr = e instanceof Error ? e : new Error(String(e))
      if (lastErr.message.startsWith('SAIJ 4')) throw lastErr
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, Math.min(1000 * 2 ** attempt, 8000)))
      }
    }
  }
  throw lastErr ?? new Error('SAIJ fetch failed')
}

// ─── Filter builder (replica el del MCP) ─────────────────────────────────
function buildJurisprudenciaFilter(opts: {
  jurisdiccion?: string; tribunal?: string; materia?: string; tipo?: string
  fecha_desde?: string; fecha_hasta?: string
}): string {
  const parts: string[] = ['Total']
  if (opts.tipo) parts.push(`Tipo de Documento/Jurisprudencia/${opts.tipo}`)
  else parts.push('Tipo de Documento/Jurisprudencia')
  if (opts.jurisdiccion) parts.push(`Jurisdicción/${opts.jurisdiccion}`)
  if (opts.tribunal) parts.push(`Tribunal/${opts.tribunal}`)
  if (opts.materia) parts.push(`Tema/${opts.materia}[3,1]`)
  if (opts.fecha_desde || opts.fecha_hasta) {
    parts.push(`Fecha/[${opts.fecha_desde || '*'},${opts.fecha_hasta || '*'}][20,1]`)
  }
  return parts.join('|')
}

function buildLegislacionFilter(opts: {
  tipo?: string; jurisdiccion?: string; estado_vigencia?: string; tema?: string
}): string {
  const parts: string[] = ['Total']
  if (opts.tipo) parts.push(`Tipo de Documento/Legislación/${opts.tipo}`)
  else parts.push('Tipo de Documento/Legislación')
  if (opts.jurisdiccion) parts.push(`Jurisdicción/${opts.jurisdiccion}`)
  if (opts.estado_vigencia) parts.push(`Estado de Vigencia/${opts.estado_vigencia}`)
  if (opts.tema) parts.push(`Tema/${opts.tema}[5,1]`)
  return parts.join('|')
}

function buildDoctrinaFilter(opts: {
  materia?: string; autor?: string; fecha_desde?: string; fecha_hasta?: string
}): string {
  const parts: string[] = ['Total', 'Tipo de Documento/Doctrina']
  if (opts.materia) parts.push(`Tema/${opts.materia}`)
  if (opts.autor) parts.push(`Autor/${opts.autor}`)
  if (opts.fecha_desde || opts.fecha_hasta) {
    parts.push(`Fecha/[${opts.fecha_desde || '*'},${opts.fecha_hasta || '*'}][20,1]`)
  }
  return parts.join('|')
}

// ─── Parser de search response ───────────────────────────────────────────
function parseSearchResponse(raw: unknown, tipo: string): SearchOutput {
  const r = raw as any
  const sr = r?.searchResults ?? {}
  const docs = (sr.documentResultList ?? []) as any[]
  const total = sr.totalSearchResults ?? 0

  const results: LegalDocSummary[] = docs.map(d => {
    const abs = d.documentAbstract ?? {}
    return {
      source: 'saij',
      source_doc_id: d.uuid,
      tipo,
      titulo: abs.titulo ?? abs['titulo-corto'] ?? null,
      caratula: abs.caratula ?? null,
      tribunal: abs.tribunal ?? null,
      jurisdiccion: abs.jurisdiccion ?? null,
      fecha: abs.fecha ?? null,
      resumen: abs.sumario ?? abs.resumen ?? null,
      url: d.uuid ? `${BASE_URL}/${d.uuid}` : null,
      score: d.documentScore ?? 0,
    }
  })

  return { source: 'saij', total, results }
}

// ─── Parser de document response ─────────────────────────────────────────
function parseDocument(raw: unknown, guid: string): LegalDocFull {
  let parsed: any
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw) } catch { parsed = {} }
  } else {
    parsed = raw
  }
  const content = parsed?.document?.content ?? parsed?.content ?? {}

  const tipo = (content['tipo-documento'] || content.tipo || 'desconocido') as string
  const texto = (content.texto || content['texto-completo'] || content.sumario || null) as string | null

  return {
    source: 'saij',
    source_doc_id: guid,
    tipo: tipo.toLowerCase(),
    titulo: content.titulo ?? content['titulo-corto'] ?? null,
    caratula: content.caratula ?? null,
    tribunal: content.tribunal ?? null,
    jurisdiccion: content.jurisdiccion ?? null,
    fecha: content.fecha ?? null,
    resumen: content.sumario ?? null,
    url: `${BASE_URL}/${guid}`,
    texto_completo: texto,
    metadata: content,
  }
}

// ─── Búsqueda genérica ───────────────────────────────────────────────────
async function searchRaw(
  filterStr: string,
  input: SearchInput,
): Promise<unknown> {
  return await saijFetch('/busqueda', {
    o: String(input.offset ?? 0),
    p: String(Math.min(Math.max(input.limit ?? 10, 1), 50)),
    f: filterStr,
    r: input.query?.trim() || '*:*',
    v: 'colapsada',
  })
}

// ─── Implementación del LegalSource ──────────────────────────────────────
export const saijSource: LegalSource = {
  id: 'saij',
  label: 'SAIJ — Sistema Argentino de Información Jurídica',

  async searchJurisprudencia(input) {
    const filter = buildJurisprudenciaFilter({
      jurisdiccion: input.jurisdiccion,
      tribunal: input.tribunal,
      materia: input.materia,
      tipo: input.tipo,
      fecha_desde: input.fecha_desde,
      fecha_hasta: input.fecha_hasta,
    })
    const raw = await searchRaw(filter, input)
    return parseSearchResponse(raw, 'jurisprudencia')
  },

  async searchLegislacion(input) {
    const filter = buildLegislacionFilter({
      tipo: input.tipo,
      jurisdiccion: input.jurisdiccion,
      estado_vigencia: input.estado_vigencia,
      tema: input.materia,
    })
    const raw = await searchRaw(filter, input)
    return parseSearchResponse(raw, 'legislacion')
  },

  async searchDoctrina(input) {
    const filter = buildDoctrinaFilter({
      materia: input.materia,
      fecha_desde: input.fecha_desde,
      fecha_hasta: input.fecha_hasta,
    })
    const raw = await searchRaw(filter, input)
    return parseSearchResponse(raw, 'doctrina')
  },

  async getDocument(guid) {
    const raw = await saijFetch('/view-document', { guid })
    return parseDocument(raw, guid)
  },

  async resolveCitation(text) {
    // 1) Patrón Ley N
    const lawMatch = text.match(/ley\s*(\d+[\d.]*)/i)
    if (lawMatch) {
      const lawNumber = lawMatch[1].replace(/\./g, '')
      const result = await this.searchLegislacion({ query: lawNumber, limit: 1 })
      if (result.results.length > 0) {
        return await this.getDocument(result.results[0].source_doc_id)
      }
    }
    // 2) "Código Civil"
    if (text.toLowerCase().includes('codigo civil') || text.toLowerCase().includes('código civil')) {
      const filter = 'Total|Tipo de Documento/Legislación/Ley/Código|Estado de Vigencia/Vigente, de alcance general'
      const raw = await searchRaw(filter, { query: 'Civil', limit: 1 })
      const out = parseSearchResponse(raw, 'legislacion')
      if (out.results.length > 0) {
        return await this.getDocument(out.results[0].source_doc_id)
      }
    }
    // 3) Fallback: búsqueda general
    return await this.searchLegislacion({ query: text, limit: 5 })
  },
}

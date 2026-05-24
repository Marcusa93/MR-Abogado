// ─────────────────────────────────────────────────────────────────────────
// Connector JusTucumán — Poder Judicial de Tucumán
//
// Portal:  https://juris.justucuman.gov.ar/busca_juris_resultado_tabs_new.php
// Es un buscador HTML viejito (PHP server-rendered). Bloquea cloud IPs,
// por eso pasamos por el proxy local (mismo que SAIJ, pero ruta diferente).
//
// Filtros útiles según el usuario (abogado tucumano):
//   - descriptores: palabra libre (lo único que sirve de verdad)
//   - tribunal[]:   filtro por sala/tribunal (sirve mucho)
//   - opcsumario/opctitulo/opcfallo: en qué campo busca
//   - cantsuma:     hasta 100 resultados por request
//
// Estrategia: traemos hasta 50 resultados para luego re-rankear con
// embeddings desde legal-lookup. El portal devuelve los resultados por
// fecha desc, no por relevancia, así que el re-rank es lo que da valor.
// ─────────────────────────────────────────────────────────────────────────

import type {
  LegalSource,
  SearchInput,
  SearchOutput,
  LegalDocSummary,
  LegalDocFull,
} from './types.ts'

const DIRECT_BASE_URL = 'https://juris.justucuman.gov.ar'
const PROXY_URL = Deno.env.get('SAIJ_PROXY_URL') ?? ''
const PROXY_TOKEN = Deno.env.get('SAIJ_PROXY_TOKEN') ?? ''
const USE_PROXY = PROXY_URL.length > 0
const BASE_URL = USE_PROXY
  ? `${PROXY_URL.replace(/\/$/, '')}/proxy/tucuman`
  : DIRECT_BASE_URL

const TIMEOUT_MS = 25_000

const COMMON_HEADERS: HeadersInit = USE_PROXY
  ? { 'X-Proxy-Token': PROXY_TOKEN, 'Accept': 'text/html,*/*' }
  : {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'es-AR,es;q=0.9',
    }

// ─── HTTP con timeout + retry ───────────────────────────────────────────
async function jtFetch(path: string, params: Record<string, string | string[]>): Promise<string> {
  const url = new URL(BASE_URL + (path.startsWith('/') ? path : '/' + path))
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) for (const item of v) url.searchParams.append(k, item)
    else url.searchParams.set(k, v)
  }

  const MAX_RETRIES = 2
  let lastErr: Error | null = null
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(url.toString(), { headers: COMMON_HEADERS, signal: ctrl.signal })
      clearTimeout(t)
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`JusTucumán ${res.status}: ${(await res.text()).slice(0, 200)}`)
      }
      if (!res.ok) throw new Error(`JusTucumán HTTP ${res.status}`)
      // El portal sirve UTF-8 a pesar de ser viejo.
      return await res.text()
    } catch (e) {
      clearTimeout(t)
      lastErr = e instanceof Error ? e : new Error(String(e))
      if (lastErr.message.startsWith('JusTucumán 4')) throw lastErr
      if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
    }
  }
  throw lastErr ?? new Error('JusTucumán fetch falló')
}

// ─── Parser HTML ────────────────────────────────────────────────────────
function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim()
}

function parseFechaAr(s: string): string | null {
  // "21/05/2026" → "2026-05-21"
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

function parseResults(html: string): { total: number; results: LegalDocSummary[] } {
  const results: LegalDocSummary[] = []

  // Total de la búsqueda: "<p><b>Registros encontrados: 573</b></p>"
  const totalMatch = html.match(/Registros encontrados:\s*(\d+)/i)
  const total = totalMatch ? parseInt(totalMatch[1], 10) : 0

  // Cada resultado vive en un panel con esta estructura:
  //   <strong>TRIBUNAL_O_SALA</strong></h3>
  //   <p class="titulos"><b>CARATULA<br>Nro. Expte: X<br>Nro. Sent: Y  Fecha Sentencia <span class="numerofecha"> dd/mm/yyyy </span></b></p>
  //   <div class="tab-pane active" id="A1"> <p><br><strong>SUMARIO</strong></p> ...
  //
  // Estrategia: dividimos por "<strong>CAMARA " / "<strong>CORTE " / "<strong>TRIBUNAL " (cada match abre un resultado).
  const blocks = html.split(/(?=<strong>(?:CAMARA |CORTE |TRIBUNAL |SALA |JUZGADO ))/i)

  let idx = 0
  for (const block of blocks) {
    if (!/^<strong>(CAMARA |CORTE |TRIBUNAL |SALA |JUZGADO )/i.test(block)) continue

    const tribunalMatch = block.match(/<strong>([^<]+?)<\/strong>/i)
    const tribunal = tribunalMatch ? stripTags(tribunalMatch[1]) : null
    if (!tribunal) continue

    const titulosMatch = block.match(/<p[^>]*class="titulos"[^>]*>([\s\S]*?)<\/p>/i)
    if (!titulosMatch) continue
    const titulosRaw = titulosMatch[1]

    // Carátula: lo primero hasta <br>
    const caratula = stripTags(titulosRaw.split(/<br\s*\/?>/i)[0])
    if (!caratula) continue

    const expteMatch = titulosRaw.match(/Nro\.\s*Expte:\s*([^<]+?)(?:<br|<\/)/i)
    const sentMatch = titulosRaw.match(/Nro\.\s*Sent:\s*([^<]+?)(?:Fecha|<)/i)
    const fechaMatch = titulosRaw.match(/numerofecha[^>]*>\s*(\d{2}\/\d{2}\/\d{4})/i)

    // Sumario: primer <div class="tab-pane active" id="A..."> dentro del bloque
    const sumarioMatch = block.match(/<div[^>]*class="tab-pane active"[^>]*id="A\d+"[^>]*>\s*<p[^>]*>\s*<br[^>]*>?\s*<strong>([\s\S]*?)<\/strong>/i)
    const sumario = sumarioMatch ? stripTags(sumarioMatch[1]) : null

    idx++
    // ID interno: combinamos expte + sentencia (mejor que nada)
    const expteClean = expteMatch ? stripTags(expteMatch[1]).replace(/[^\w/-]/g, '') : `idx${idx}`
    const sentClean = sentMatch ? stripTags(sentMatch[1]).trim() : '0'
    const sourceDocId = `${expteClean}__${sentClean}`

    results.push({
      source: 'justucuman',
      source_doc_id: sourceDocId,
      tipo: 'jurisprudencia',
      titulo: null,
      caratula,
      tribunal,
      jurisdiccion: 'Tucumán',
      fecha: fechaMatch ? parseFechaAr(fechaMatch[1]) : null,
      resumen: sumario,
      url: `${DIRECT_BASE_URL}/busca_juris_resultado_tabs_new.php`,
      score: 0,
    })
  }

  return { total, results }
}

// ─── Implementación del LegalSource ─────────────────────────────────────
// JusTucumán tarda 1-2 minutos con OR sobre muchos términos (timeout en edge).
// AND es rápido (~1s) pero falla si la query tiene > 3 palabras (intersección vacía).
// Estrategia: reducir la query a las 2-3 palabras más significativas (>4 chars,
// no stopwords) para que AND devuelva un set manejable, y dejar que el re-rank
// semántico posterior elija los más relevantes.
const STOPWORDS_ES = new Set([
  'que','para','sobre','entre','desde','hasta','como','cuando','donde',
  'los','las','del','las','una','uno','con','sin','por','del','según',
  'todos','todas','este','esta','estos','estas','ese','esa','esos','esas',
  'aquel','aquella','muy','más','menos','tambien','también','aunque',
])

function reduceQueryForAnd(query: string): string {
  const tokens = query.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // sin tildes
    .split(/[^a-záéíóúñ0-9]+/i)
    .filter(t => t.length > 3 && !STOPWORDS_ES.has(t))
  // Tomamos hasta 3 términos: orden de aparición = orden de importancia que dió el user
  return tokens.slice(0, 3).join(' ')
}

function buildSearchParams(input: SearchInput): Record<string, string | string[]> {
  const queryOriginal = input.query.trim()
  const queryReducida = reduceQueryForAnd(queryOriginal) || queryOriginal
  const params: Record<string, string | string[]> = {
    descriptores: queryReducida,
    // AND por default (rápido). Si el caller necesita OR (más amplio, lento)
    // puede pasar input.estado_vigencia = 'OR' como hack hasta agregar campo.
    flagsubmit: '1',
    vienede: '1',
    vistab: '0',
    cantsuma: String(Math.min(Math.max(input.limit ?? 50, 1), 100)),
    opcsumario: '1',
    opctitulo: '1',
    opcfallo: '1',
    estilovista: 'default',
    inout: '0',
  }
  if (input.tribunal) params['tribunal[]'] = input.tribunal
  if (input.fecha_desde) {
    const d = input.fecha_desde.split('-')
    if (d.length === 3) params.fechad = `${d[2]}/${d[1]}/${d[0]}`
  }
  if (input.fecha_hasta) {
    const d = input.fecha_hasta.split('-')
    if (d.length === 3) params.fechah = `${d[2]}/${d[1]}/${d[0]}`
  }
  return params
}

export const justucumanSource: LegalSource = {
  id: 'justucuman',
  label: 'JusTucumán — Poder Judicial de Tucumán',

  async searchJurisprudencia(input) {
    const html = await jtFetch('/busca_juris_resultado_tabs_new.php', buildSearchParams(input))
    const { total, results } = parseResults(html)
    return { source: 'justucuman', total, results }
  },

  async searchLegislacion() {
    return { source: 'justucuman', total: 0, results: [] }
  },

  async searchDoctrina() {
    return { source: 'justucuman', total: 0, results: [] }
  },

  // El portal no expone una URL canónica del fallo individual; los sumarios
  // están inline en la página de resultados. Devolvemos lo que tengamos
  // como "documento completo" usando una búsqueda con el doc_id como hint.
  async getDocument(sourceDocId): Promise<LegalDocFull> {
    // sourceDocId: "<expte>__<sent>" — usamos el expte como search hint
    const expte = sourceDocId.split('__')[0]
    const html = await jtFetch('/busca_juris_resultado_tabs_new.php', {
      nexpte: expte, flagsubmit: '1', vienede: '1', vistab: '0', cantsuma: '5',
      opcsumario: '1', opctitulo: '1', opcfallo: '1',
    })
    const { results } = parseResults(html)
    const hit = results.find(r => r.source_doc_id === sourceDocId) ?? results[0]
    if (!hit) {
      throw new Error(`Fallo no encontrado en JusTucumán: ${sourceDocId}`)
    }
    return {
      ...hit,
      texto_completo: hit.resumen, // por ahora sumario; el fallo completo requiere otro endpoint
      metadata: { source_doc_id: sourceDocId, expediente: expte },
    }
  },

  async resolveCitation(text) {
    // Fallback: búsqueda libre
    return await this.searchJurisprudencia({ query: text, limit: 5 })
  },
}

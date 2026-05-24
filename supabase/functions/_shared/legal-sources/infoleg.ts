// ─────────────────────────────────────────────────────────────────────────
// Connector InfoLEG — Información Legislativa (Ministerio de Justicia)
//
// InfoLEG no expone JSON público, sólo HTML server-side rendered. Scrapeamos
// dos endpoints:
//
//   GET /infolegInternet/buscarNormas.do?modo=2&texto=Q&page=N
//      → tabla HTML con resultados (cada <tr> = una norma)
//
//   GET /infolegInternet/verNorma.do?id=NNN
//      → detalle de una norma (encabezado + texto resaltado)
//
// InfoLEG NO bloquea IPs cloud, así que no necesita proxy. Sólo User-Agent.
// Cubre 100% legislación nacional (Leyes, Decretos, Resoluciones, DNUs).
// ─────────────────────────────────────────────────────────────────────────

import type {
  LegalSource,
  SearchInput,
  SearchOutput,
  LegalDocSummary,
  LegalDocFull,
} from './types.ts'

const BASE_URL = 'https://servicios.infoleg.gob.ar'
const TIMEOUT_MS = 30_000
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const COMMON_HEADERS: HeadersInit = {
  'User-Agent': USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
}

// ─── HTTP helper ────────────────────────────────────────────────────────
async function infolegFetch(path: string, params: Record<string, string>): Promise<string> {
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
        redirect: 'follow',
      })
      clearTimeout(t)
      if (res.status >= 400 && res.status < 500) {
        const txt = await res.text().catch(() => '')
        throw new Error(`InfoLEG ${res.status}: ${txt.slice(0, 200)}`)
      }
      if (!res.ok) throw new Error(`InfoLEG HTTP ${res.status}`)
      // InfoLEG sirve en ISO-8859-1 (latin1). El header Content-Type a veces
      // miente. Decodificamos manualmente.
      const buf = new Uint8Array(await res.arrayBuffer())
      const decoded = new TextDecoder('iso-8859-1').decode(buf)
      return decoded
    } catch (e) {
      clearTimeout(t)
      lastErr = e instanceof Error ? e : new Error(String(e))
      if (lastErr.message.startsWith('InfoLEG 4')) throw lastErr
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, Math.min(1000 * 2 ** attempt, 8000)))
      }
    }
  }
  throw lastErr ?? new Error('InfoLEG fetch failed')
}

// ─── HTML parsers ───────────────────────────────────────────────────────
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&deg;/g, '°')
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ')
    .replace(/&Aacute;/g, 'Á').replace(/&Eacute;/g, 'É').replace(/&Iacute;/g, 'Í')
    .replace(/&Oacute;/g, 'Ó').replace(/&Uacute;/g, 'Ú').replace(/&Ntilde;/g, 'Ñ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
}

// Mes abreviado español → 2 dígitos
const MONTHS_ES: Record<string, string> = {
  ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
  jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12',
}
function parseFechaEs(s: string): string | null {
  // "21-may-2026" → "2026-05-21"
  const m = s.match(/(\d{1,2})-([a-zé]{3,4})-(\d{4})/i)
  if (!m) return null
  const dd = m[1].padStart(2, '0')
  const mm = MONTHS_ES[m[2].toLowerCase().slice(0, 3)]
  const yyyy = m[3]
  return mm ? `${yyyy}-${mm}-${dd}` : null
}

// ─── Parser de búsqueda ─────────────────────────────────────────────────
function parseSearchHtml(html: string): SearchOutput {
  const results: LegalDocSummary[] = []

  // Cada resultado es un <tr> que contiene:
  //   - link verNorma.do?...id=NNN
  //   - link verBoletin con fecha (ej: "22-may-2026")
  //   - <b>ORGANISMO</b><br/>
  //   - "TIPO NNN/AAAA - QUALIFIER<br/>"
  //   - <span class="vr_marron10"><i>SUMARIO</i></span>
  const trBlocks = html.split(/<tr[^>]*>/i).slice(1)
  for (const block of trBlocks) {
    const idMatch = block.match(/verNorma\.do[^"]*[?&]id=(\d+)/i)
    if (!idMatch) continue
    const id = idMatch[1]

    // Fecha (en el link verBoletin)
    const fechaTxt = block.match(/verBoletin\.do[^>]*>([^<]+)</i)?.[1]?.trim() ?? null
    const fecha = fechaTxt ? parseFechaEs(fechaTxt) : null

    // Organismo + tipo+numero + sumario
    const organismoMatch = block.match(/<b>([^<]+)<\/b>/i)
    const organismo = organismoMatch ? stripTags(organismoMatch[1]) : null

    // Línea de tipo+numero suele venir entre el </b><br/> y el <span class="vr_marron10">
    let titulo: string | null = null
    let resumen: string | null = null
    const sumarioMatch = block.match(/<span class="vr_marron10"[^>]*>\s*<i>([\s\S]*?)<\/i>\s*<\/span>/i)
    if (sumarioMatch) {
      resumen = stripTags(sumarioMatch[1])
      // El "título" técnico (TIPO NNN/AAAA) está justo antes del sumario.
      const beforeSumario = block.slice(0, sumarioMatch.index ?? 0)
      const tipoLineas = beforeSumario.match(/<\/b>\s*<br\s*\/?>\s*([^<]+?)<br/i)
      if (tipoLineas) {
        titulo = stripTags(tipoLineas[1])
      }
    }

    if (!titulo && !resumen) continue

    results.push({
      source: 'infoleg',
      source_doc_id: id,
      tipo: 'legislacion',
      titulo,
      caratula: organismo,
      tribunal: null,
      jurisdiccion: 'Nacional',
      fecha,
      resumen,
      url: `${BASE_URL}/infolegInternet/verNorma.do?id=${id}`,
      score: 0,
    })
  }

  // Total: InfoLEG muestra "Cantidad de Normas Encontradas: N" en algún lugar.
  const totalMatch = html.match(/(?:Cantidad de Normas?|encontrad[ao]s?)[^0-9]*(\d+)/i)
  const total = totalMatch ? parseInt(totalMatch[1], 10) : results.length

  return { source: 'infoleg', total, results }
}

// ─── Parser de detalle ──────────────────────────────────────────────────
function parseNormaHtml(html: string, id: string): LegalDocFull {
  const enc = html.match(/<div id="Textos_Completos">([\s\S]*?)<\/div>/i)?.[1] ?? ''

  // Tipo de norma — primer <strong> después del id, ej "Decreto Reglamentario"
  const tipoMatch = enc.match(/<strong>\s*([\s\S]*?)<\/strong>/i)
  const tipoBlock = tipoMatch ? stripTags(tipoMatch[1]) : ''
  // tipoBlock típicamente: "Decreto Reglamentario 377/2026 PODER EJECUTIVO NACIONAL (P.E.N.)"
  const numeroMatch = tipoBlock.match(/(\d+\/\d{4}|\d+)/)
  const tipoLimpio = tipoBlock.replace(/\s*\d+\/\d{4}.*$/, '').replace(/\s*\d+\s*$/, '').trim()
  const numero = numeroMatch ? numeroMatch[1] : null

  // Fecha (vr_azul11)
  const fechaTxt = enc.match(/<span class="vr_azul11"[^>]*>\s*([\s\S]*?)<\/span>/i)?.[1]
  const fecha = fechaTxt ? parseFechaEs(stripTags(fechaTxt)) : null

  // Título descriptivo (<span class="destacado"> y/o <h1>)
  const tituloDest = enc.match(/<span class="destacado"[^>]*>([\s\S]*?)<\/span>/i)?.[1]
  const tituloH1 = enc.match(/<h1>([\s\S]*?)<\/h1>/i)?.[1]
  const titulo = stripTags(tituloDest ?? tituloH1 ?? tipoBlock)

  // Texto completo: todo el contenido de #Textos_Completos
  const texto = stripTags(enc)

  return {
    source: 'infoleg',
    source_doc_id: id,
    tipo: 'legislacion',
    titulo: titulo || null,
    caratula: tipoBlock || null,
    tribunal: null,
    jurisdiccion: 'Nacional',
    fecha,
    resumen: null,
    url: `${BASE_URL}/infolegInternet/verNorma.do?id=${id}`,
    texto_completo: texto || null,
    metadata: {
      tipo_norma: tipoLimpio || null,
      numero: numero,
    },
  }
}

// ─── LegalSource ────────────────────────────────────────────────────────
export const infolegSource: LegalSource = {
  id: 'infoleg',
  label: 'InfoLEG — Información Legislativa (Ministerio de Justicia)',

  async searchJurisprudencia(_input) {
    // InfoLEG sólo tiene legislación.
    return { source: 'infoleg', total: 0, results: [] }
  },

  async searchLegislacion(input) {
    const page = Math.max(1, Math.floor((input.offset ?? 0) / 10) + 1)
    const params: Record<string, string> = {
      modo: '2',
      texto: input.query?.trim() || '',
      page: String(page),
    }
    if (input.fecha_desde) params.fechaDesde = input.fecha_desde
    if (input.fecha_hasta) params.fechaHasta = input.fecha_hasta

    const html = await infolegFetch('/infolegInternet/buscarNormas.do', params)
    const out = parseSearchHtml(html)
    const limit = input.limit ?? 10
    return { ...out, results: out.results.slice(0, limit) }
  },

  async searchDoctrina(_input) {
    return { source: 'infoleg', total: 0, results: [] }
  },

  async getDocument(id) {
    const html = await infolegFetch('/infolegInternet/verNorma.do', { id })
    return parseNormaHtml(html, id)
  },

  async resolveCitation(text) {
    // Patrón "Ley NNNNN" o "Decreto NNN/AAAA"
    const lawMatch = text.match(/ley\s*([\d.]+)/i)
    if (lawMatch) {
      const lawNum = lawMatch[1].replace(/\./g, '')
      const result = await this.searchLegislacion({ query: `Ley ${lawNum}`, limit: 5 })
      if (result.results.length > 0) {
        return await this.getDocument(result.results[0].source_doc_id)
      }
    }
    return await this.searchLegislacion({ query: text, limit: 5 })
  },
}

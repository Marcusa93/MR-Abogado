// Ported from SAErpado — HTTP-only SAE connector (no Playwright needed)

const SAE_LOGIN_URL = 'https://login.justucuman.gov.ar/login'
const SAE_CONSULTA_URL = 'https://consultaexpedientes.justucuman.gov.ar/'
const SAE_API_URL = 'https://conexpbe.justucuman.gov.ar/api'
const HTML_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
const JSON_ACCEPT = 'application/json, text/plain, */*'

export interface SaeCredentials { username: string; password: string }

export interface SaeSession {
  cookies: string[]
  headers?: Record<string, string>
}

export class SaeError extends Error {
  constructor(readonly code: string, message: string, readonly status?: number) {
    super(message)
  }
}

// ─── CookieJar ───────────────────────────────────────────────────────────────

class CookieJar {
  private readonly store = new Map<string, string>()

  absorb(headers: Headers) {
    const raw = headers as Headers & { getSetCookie?: () => string[] }
    const lines = typeof raw.getSetCookie === 'function'
      ? raw.getSetCookie()
      : (headers.get('set-cookie') ?? '').split(/,(?=[^;,\s]+=)/g).map(s => s.trim()).filter(Boolean)

    for (const line of lines) {
      const pair = line.split(';')[0]?.trim()
      if (!pair) continue
      const eq = pair.indexOf('=')
      if (eq > 0) this.store.set(pair.slice(0, eq), pair)
    }
  }

  header() { return [...this.store.values()].join('; ') }
  toArray() { return [...this.store.values()] }
  get(name: string) {
    const entry = this.store.get(name)
    if (!entry) return undefined
    const eq = entry.indexOf('=')
    return eq >= 0 ? entry.slice(eq + 1) : undefined
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isRedirect(status: number) {
  return [301, 302, 303, 307, 308].includes(status)
}

async function tryJson<T>(res: Response): Promise<T | null> {
  const text = await res.text()
  if (!text.trim()) return null
  try { return JSON.parse(text) as T } catch { return null }
}

function unwrapArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const d = (payload as Record<string, unknown>).data
    if (Array.isArray(d)) return d
  }
  return []
}

function extractCsrf(html: string) {
  return html.match(/name="_token"\s+value="([^"]+)"/i)?.[1]
    ?? html.match(/meta\s+name="csrf-token"\s+content="([^"]+)"/i)?.[1]
}

async function req(url: string, jar: CookieJar, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers as HeadersInit)
  const cookie = jar.header()
  if (cookie) headers.set('Cookie', cookie)
  const res = await fetch(url, { ...init, headers, redirect: 'manual' })
  jar.absorb(res.headers)
  return res
}

async function followRedirects(res: Response, jar: CookieJar, max = 5): Promise<Response> {
  let cur = res
  for (let i = 0; i < max && isRedirect(cur.status); i++) {
    const loc = cur.headers.get('location')
    if (!loc) break
    cur = await req(new URL(loc, SAE_LOGIN_URL).toString(), jar, {
      method: 'GET',
      headers: { Accept: HTML_ACCEPT },
    })
  }
  return cur
}

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function apiHeaders(session: SaeSession): Headers {
  const h = new Headers({
    Accept: JSON_ACCEPT,
    'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
    'User-Agent': BROWSER_UA,
    Origin: 'https://consultaexpedientes.justucuman.gov.ar',
    Referer: 'https://consultaexpedientes.justucuman.gov.ar/',
  })
  if (session.cookies.length) h.set('Cookie', session.cookies.join('; '))
  if (session.headers?.Authorization) h.set('Authorization', session.headers.Authorization)
  return h
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function authenticateWithSae(creds: SaeCredentials): Promise<SaeSession> {
  const jar = new CookieJar()

  const loginPage = await req(SAE_LOGIN_URL, jar, { method: 'GET', headers: { Accept: HTML_ACCEPT } })
  const csrf = extractCsrf(await loginPage.text())
  if (!csrf) throw new SaeError('SAE_AUTH_CSRF_MISSING', 'No se pudo extraer el CSRF del formulario de login SAE.')

  const body = new URLSearchParams({ _token: csrf, username: creds.username, password: creds.password })
  const loginRes = await req(SAE_LOGIN_URL, jar, {
    method: 'POST',
    headers: {
      Accept: HTML_ACCEPT,
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: 'https://login.justucuman.gov.ar',
      Referer: SAE_LOGIN_URL,
    },
    body: body.toString(),
  })

  const settled = await followRedirects(loginRes, jar)
  const settledHtml = await settled.text()

  if (settled.status >= 400) throw new SaeError('SAE_AUTH_REJECTED', 'SAE rechazó el intento de autenticación.', settled.status)
  if (/form-signin/i.test(settledHtml) && /name="password"/i.test(settledHtml)) {
    throw new SaeError('SAE_AUTH_INVALID_CREDENTIALS', 'Credenciales SAE incorrectas.')
  }

  // Visit consulta home to capture saeToken cookie
  const consultaRes = await req(SAE_CONSULTA_URL, jar, { method: 'GET', headers: { Accept: HTML_ACCEPT, Referer: SAE_LOGIN_URL } })
  await followRedirects(consultaRes, jar)

  const saeToken = jar.get('saeToken')
  const session: SaeSession = {
    cookies: jar.toArray(),
    headers: saeToken ? { Authorization: `Bearer ${saeToken}` } : undefined,
  }

  // Validate session
  const probe = await fetch(`${SAE_API_URL}/user`, { method: 'GET', headers: apiHeaders(session) })
  if (!probe.ok) throw new SaeError('SAE_AUTH_SESSION_REJECTED', 'La sesión SAE no fue aceptada por la API.', probe.status)

  return session
}

// ─── Case lookup ──────────────────────────────────────────────────────────────

export interface SaeCase {
  procid: string
  jurisdictionId: number
  caseNumber: string
  caption: string
  /** Entry crudo del API /user/proceedings — útil para extraer campos extra
   *  como estado de trámite, situación, fecha de cambio, etc. */
  rawEntry?: Record<string, unknown>
}

// Scrapea el estado de trámite desde la página HTML del SAE.
// Endpoint: https://consultaexpedientes.justucuman.gov.ar/{fuero}/expediente/{numero}/historia
// La sesión ya autenticada (cookies) sirve para esta página también.
// Retorna ej. { estado: "NO EN LETRA (PARA RESOLVER)", desde: "2026-05-27" }
const SAE_HTML_BASE = 'https://consultaexpedientes.justucuman.gov.ar'

// Detectores de fuero → path. Si el fuero no matchea, probamos varios.
const FUERO_TO_PATH: Record<string, string> = {
  civil: 'civil',
  comercial: 'comercial',
  'civil_y_comercial': 'civil',
  'civil y comercial': 'civil',
  laboral: 'laboral',
  trabajo: 'laboral',
  penal: 'penal',
  familia: 'familia',
  administrativo: 'administrativo',
  contencioso: 'administrativo',
  previsional: 'previsional',
}

export async function fetchEstadoOrganismoFromHistoria(
  numeroSae: string,
  fuero: string | null,
  session: SaeSession,
): Promise<{ estado: string; desde: string | null; via_fuero: string } | null> {
  const encoded = encodeURIComponent(numeroSae)
  // Lista ordenada de fueros a probar. Si tenemos hint, ese va primero.
  const fueroHint = fuero ? FUERO_TO_PATH[fuero.toLowerCase()] : null
  const ordered = [fueroHint, 'civil', 'laboral', 'comercial', 'familia', 'penal', 'administrativo', 'previsional']
    .filter((v, i, arr) => v && arr.indexOf(v) === i) as string[]

  const baseHeaders = new Headers({
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Referer: `${SAE_HTML_BASE}/`,
  })
  if (session.cookies.length) baseHeaders.set('Cookie', session.cookies.join('; '))
  if (session.headers?.Authorization) baseHeaders.set('Authorization', session.headers.Authorization)

  for (const f of ordered) {
    const url = `${SAE_HTML_BASE}/${f}/expediente/${encoded}/historia`
    try {
      const res = await fetch(url, { headers: baseHeaders, redirect: 'follow' })
      console.log('[scrape-estado]', f, '→', res.status, 'final-url:', res.url, 'len:', res.headers.get('content-length'))
      if (!res.ok) continue
      const html = await res.text()
      // Buscar "NO EN LETRA" / "EN LETRA" / "EN ACUERDO" / "PARA RESOLVER" / etc
      // en el HTML para diagnóstico: si está, hay match seguro.
      const hasEnLetraText = /EN LETRA|PARA RESOLVER|EN ACUERDO|EN DESPACHO|EN CASILLERO/i.test(html)
      console.log('[scrape-estado]', f, 'tiene marcador estado:', hasEnLetraText, 'html_size:', html.length)

      // Patrón 1: "EN LETRA (PARA RESOLVER) Desde el 27/05/2026"
      const m = html.match(/([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s()]{3,80}?)\s+Desde\s+el\s+(\d{2}\/\d{2}\/\d{4})/i)
      if (m) {
        const [, estadoRaw, fechaStr] = m
        const fechaMatch = fechaStr.match(/(\d{2})\/(\d{2})\/(\d{4})/)
        const desde = fechaMatch ? `${fechaMatch[3]}-${fechaMatch[2]}-${fechaMatch[1]}` : null
        console.log('[scrape-estado] MATCH', f, '→', estadoRaw.trim(), 'desde', desde)
        return { estado: estadoRaw.trim(), desde, via_fuero: f }
      }
      // Patrón 2: sin "Desde el" — solo el texto en un div/span con clase
      if (hasEnLetraText) {
        const m2 = html.match(/>\s*((?:NO\s+)?EN\s+(?:LETRA|ACUERDO|DESPACHO|CASILLERO|RESOLVER|TRAMITE)(?:\s*\([^)]+\))?)\s*</i)
        if (m2) {
          console.log('[scrape-estado] MATCH-2', f, '→', m2[1].trim())
          return { estado: m2[1].trim(), desde: null, via_fuero: f }
        }
      }
      // Diagnóstico: logueo un sample del HTML alrededor de "Letra" o "Resolver"
      if (hasEnLetraText) {
        const idx = html.search(/EN LETRA|PARA RESOLVER|EN ACUERDO/i)
        const sample = html.slice(Math.max(0, idx - 150), idx + 300).replace(/\s+/g, ' ')
        console.log('[scrape-estado] HTML sample:', sample)
      } else {
        // Si no hay marcador, ver si es login page
        const isLogin = /<form[^>]*action[^>]*(?:login|auth)/i.test(html) || /password/i.test(html.slice(0, 5000))
        console.log('[scrape-estado] sin marcador. parece login?', isLogin, 'first 200:', html.slice(0, 200))
      }
    } catch (e) {
      console.error('[scrape-estado] err en', url, e)
      continue
    }
  }
  return null
}

// Texto literal del estado del expediente en el organismo
// (ej "NO EN LETRA (PARA RESOLVER)") + fecha desde la que está así.
// El API real de SAE Tucumán lo expone como `ultimo_tramite` en el campo
// `proceeding` del response de /user/proceedings/history, con formato:
//   "NO EN LETRA (PARA RESOLVER) Desde el 27/05/2026"
// Acá lo parseamos junto con otros nombres por compatibilidad futura.
export function extractEstadoFromEntry(entry: Record<string, unknown>): { estado: string | null; desde: string | null } {
  // 1) Campo combinado "ESTADO Desde el dd/mm/yyyy" (caso real de SAE)
  const ultimoTramite = entry.ultimo_tramite ?? entry.ultimoTramite
  if (typeof ultimoTramite === 'string' && ultimoTramite.trim()) {
    const m = ultimoTramite.match(/^(.+?)\s+Desde\s+el\s+(\d{2})\/(\d{2})\/(\d{4})\s*$/i)
    if (m) {
      return { estado: m[1].trim(), desde: `${m[4]}-${m[3]}-${m[2]}` }
    }
    return { estado: ultimoTramite.trim(), desde: null }
  }

  // 2) Campos separados estado + fecha
  const candidates = [
    entry.state, entry.estado, entry.situacion, entry.cur_state, entry.cur_status,
    entry.estado_actual, entry.tramite, entry.tramite_estado, entry.tramiteEstado,
    entry.statusText, entry.estado_texto, entry.estado_descripcion,
  ]
  let estado: string | null = null
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) { estado = c.trim(); break }
  }
  const fechaCandidates = [
    entry.state_since, entry.estado_desde, entry.estadoDesde,
    entry.tramite_desde, entry.fecha_estado, entry.fechaEstado,
    entry.state_date, entry.cur_state_date,
  ]
  let desde: string | null = null
  for (const c of fechaCandidates) {
    if (typeof c === 'string' && c.trim()) {
      const m = c.match(/(\d{2})\/(\d{2})\/(\d{4})/)
      desde = m ? `${m[3]}-${m[2]}-${m[1]}` : c.trim()
      break
    }
  }
  return { estado, desde }
}

export async function findCaseByNumber(caseNumber: string, session: SaeSession, jurisdictionHint?: string): Promise<SaeCase | null> {
  // Load all centers → jurisdictions (public endpoints, no auth needed)
  const centersRes = await fetch(`${SAE_API_URL}/centers`, { headers: { Accept: JSON_ACCEPT } })
  if (!centersRes.ok) throw new SaeError('SAE_CATALOG', 'No se pudo obtener el catálogo de centros judiciales.', centersRes.status)

  const centersPayload = await tryJson<unknown>(centersRes)
  const centerIds = unwrapArray(centersPayload)
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === 'object')
    .map(e => Number(e.id))
    .filter(id => Number.isFinite(id))

  const jurisdictions: { id: number; description?: string; slug?: string }[] = []
  for (const centerId of centerIds) {
    const res = await fetch(`${SAE_API_URL}/jurisdictions?center=${centerId}&full=1`, { headers: { Accept: JSON_ACCEPT } })
    if (!res.ok) continue
    const payload = await tryJson<unknown>(res)
    for (const entry of unwrapArray(payload)) {
      if (!entry || typeof entry !== 'object') continue
      const e = entry as Record<string, unknown>
      const id = Number(e.id)
      if (Number.isFinite(id)) jurisdictions.push({ id, description: e.description as string | undefined, slug: e.slug as string | undefined })
    }
  }

  // Sort with hint first
  if (jurisdictionHint) {
    const hint = jurisdictionHint.trim().toLowerCase()
    jurisdictions.sort((a, b) => {
      const aScore = Number(a.description?.toLowerCase().includes(hint)) * 2 + Number(a.slug?.toLowerCase().includes(hint))
      const bScore = Number(b.description?.toLowerCase().includes(hint)) * 2 + Number(b.slug?.toLowerCase().includes(hint))
      return bScore - aScore
    })
  }

  for (const j of jurisdictions) {
    const url = new URL(`${SAE_API_URL}/user/proceedings`)
    url.searchParams.set('jurisdiction', String(j.id))
    url.searchParams.set('page', '1')
    url.searchParams.set('unit', '')
    url.searchParams.set('number', caseNumber)
    url.searchParams.set('actor', '')
    url.searchParams.set('accused', '')

    const res = await fetch(url.toString(), { method: 'GET', headers: apiHeaders(session) })
    if (res.status >= 500) throw new SaeError('SAE_SEARCH_SESSION_REJECTED', 'La sesión SAE fue rechazada en el endpoint de búsqueda.', res.status)
    if (!res.ok) continue

    const payload = await tryJson<unknown>(res)
    const entries = unwrapArray(payload).filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === 'object')
    if (!entries.length) continue

    const entry = entries[0]
    const procid = String(entry.procid ?? entry.id ?? '')
    if (!procid) continue

    return {
      procid,
      jurisdictionId: j.id,
      caseNumber: String(entry.nro_expediente ?? entry.number ?? caseNumber),
      caption: String(entry.cover ?? entry.caratula ?? entry.caption ?? ''),
      rawEntry: entry,
    }
  }

  return null
}

// ─── History ──────────────────────────────────────────────────────────────────

export interface SaeStory {
  histid: string
  fecha: string
  dscr: string
  archivos?: unknown[]
  vinculos?: unknown[]
}

export interface SaeStoryWithBody extends SaeStory {
  body?: string
}

export async function fetchCaseHistory(procid: string, jurisdictionId: number, session: SaeSession): Promise<SaeStory[]> {
  const url = new URL(`${SAE_API_URL}/user/proceedings/history`)
  url.searchParams.set('jurisdiction', String(jurisdictionId))
  url.searchParams.set('proceeding', procid)

  const res = await fetch(url.toString(), { method: 'GET', headers: apiHeaders(session) })
  if (!res.ok) throw new SaeError('SAE_HISTORY_ERROR', `Error al obtener el historial del expediente (${res.status}).`, res.status)

  const payload = await tryJson<unknown>(res)
  if (!payload || typeof payload !== 'object') return []

  const p = payload as Record<string, unknown>
  const dataObj = p.data && typeof p.data === 'object' ? p.data as Record<string, unknown> : p
  const stories = Array.isArray(dataObj.stories) ? dataObj.stories : unwrapArray(payload)

  return stories
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
    .map(s => ({
      histid: String(s.histid ?? s.id ?? crypto.randomUUID()),
      fecha: String(s.fechaDeposito ?? s.fecha ?? ''),
      dscr: String(s.dscr ?? s.title ?? s.titulo ?? ''),
      archivos: Array.isArray(s.archivos) ? s.archivos : undefined,
      vinculos: Array.isArray(s.vinculos) ? s.vinculos : undefined,
    }))
}

// Variante de fetchCaseHistory que también devuelve el ROOT del payload
// (no solo el array de stories). El estado de trámite (NO EN LETRA, etc)
// suele venir como property del root al lado de stories.
export async function fetchProceedingHistoryWithMeta(
  procid: string,
  jurisdictionId: number,
  session: SaeSession,
): Promise<{ root: Record<string, unknown>; stories: SaeStory[] } | null> {
  const url = new URL(`${SAE_API_URL}/user/proceedings/history`)
  url.searchParams.set('jurisdiction', String(jurisdictionId))
  url.searchParams.set('proceeding', procid)

  const res = await fetch(url.toString(), { method: 'GET', headers: apiHeaders(session) })
  if (!res.ok) return null

  const payload = await tryJson<unknown>(res)
  if (!payload || typeof payload !== 'object') return null

  const p = payload as Record<string, unknown>
  const dataObj = (p.data && typeof p.data === 'object' ? p.data : p) as Record<string, unknown>
  const stories = Array.isArray(dataObj.stories) ? dataObj.stories : unwrapArray(payload)

  const mapped: SaeStory[] = stories
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
    .map(s => ({
      histid: String(s.histid ?? s.id ?? crypto.randomUUID()),
      fecha: String(s.fechaDeposito ?? s.fecha ?? ''),
      dscr: String(s.dscr ?? s.title ?? s.titulo ?? ''),
      archivos: Array.isArray(s.archivos) ? s.archivos : undefined,
      vinculos: Array.isArray(s.vinculos) ? s.vinculos : undefined,
    }))

  return { root: dataObj, stories: mapped }
}

export async function fetchStoryBody(procid: string, jurisdictionId: number, histid: string, session: SaeSession): Promise<string | undefined> {
  const url = new URL(`${SAE_API_URL}/user/proceedings/history/text`)
  url.searchParams.set('jurisdiction', String(jurisdictionId))
  url.searchParams.set('proceeding', procid)
  url.searchParams.set('history', histid)

  const res = await fetch(url.toString(), { method: 'GET', headers: apiHeaders(session) })
  if (!res.ok) return undefined

  const payload = await tryJson<unknown>(res)
  if (!payload || typeof payload !== 'object') return undefined

  const p = payload as Record<string, unknown>
  const data = p.data && typeof p.data === 'object' ? p.data as Record<string, unknown> : p
  const history = data.history && typeof data.history === 'object' ? data.history as Record<string, unknown> : data
  const raw = history.texto ?? history.text ?? history.body ?? ''
  const text = typeof raw === 'string' ? raw : ''

  // Strip HTML
  return text
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s{2,}/g, ' ')
    .trim() || undefined
}

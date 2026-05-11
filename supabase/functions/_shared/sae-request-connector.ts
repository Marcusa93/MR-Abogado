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

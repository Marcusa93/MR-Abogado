import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { authenticateWithSae, SaeError, type SaeSession } from '../_shared/sae-request-connector.ts'

const SAE_API_URL = 'https://conexpbe.justucuman.gov.ar/api'
const JSON_ACCEPT = 'application/json, text/plain, */*'

interface ProceedingEntry {
  procid: string
  jurisdictionId: number
  numero_sae: string
  caratula: string
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

async function tryJson<T>(res: Response): Promise<T | null> {
  const text = await res.text()
  if (!text.trim()) return null
  try { return JSON.parse(text) as T } catch { return null }
}

function unwrapArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === 'object') {
    const d = (payload as Record<string, unknown>).data
    if (Array.isArray(d)) return d
  }
  return []
}

function extractProceedingsFromPayload(payload: unknown, jurisdictionId = 0): ProceedingEntry[] {
  const entries = unwrapArray(payload)
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === 'object')
  const results: ProceedingEntry[] = []
  for (const entry of entries) {
    const procid = String(entry.procid ?? entry.id ?? '').trim()
    if (!procid) continue
    const jid = typeof entry.jurisdictionId === 'number' ? entry.jurisdictionId
      : typeof entry.jurisdiction_id === 'number' ? entry.jurisdiction_id
      : jurisdictionId
    results.push({
      procid,
      jurisdictionId: jid,
      numero_sae: String(entry.nro_expediente ?? entry.number ?? entry.numero ?? '').trim(),
      caratula: String(entry.cover ?? entry.caratula ?? entry.caption ?? entry.caratura ?? '').trim(),
    })
  }
  return results
}

function extractMyProceedings(payload: unknown): ProceedingEntry[] {
  const root = payload && typeof payload === 'object'
    ? ((payload as Record<string, unknown>).data && typeof (payload as Record<string, unknown>).data === 'object'
        ? (payload as Record<string, unknown>).data as Record<string, unknown>
        : payload as Record<string, unknown>)
    : null

  if (!root) return []

  const proceedings =
    root.proceedings ??
    root.expedientes ??
    root.cases ??
    (payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>).proceedings ??
        (payload as Record<string, unknown>).expedientes ??
        (payload as Record<string, unknown>).cases
      : undefined)

  return Array.isArray(proceedings) ? extractProceedingsFromPayload(proceedings) : []
}

async function fetchMyProceedings(session: SaeSession): Promise<ProceedingEntry[]> {
  // Step 1: call /api/user — the SAE portal populates "mis-expedientes" from this response
  // (the Redux store sets auth.proceedings from the login response payload which comes from /api/user)
  const userRes = await fetch(`${SAE_API_URL}/user`, {
    method: 'GET',
    headers: apiHeaders(session),
  })
  if (!userRes.ok) {
    throw new SaeError('SAE_AUTH_SESSION_REJECTED', 'La sesión SAE fue rechazada al obtener datos del usuario.', userRes.status)
  }
  const userPayload = await tryJson<unknown>(userRes)
  console.log('[sae-list] /api/user keys:', userPayload && typeof userPayload === 'object' ? Object.keys(userPayload as object) : typeof userPayload)

  const directProceedings = extractMyProceedings(userPayload)
  if (directProceedings.length > 0) {
    console.log('[sae-list] found', directProceedings.length, 'proceedings in /api/user')
    return directProceedings
  }

  // Step 2: try /api/user/proceedings with no jurisdiction filter
  const allProcRes = await fetch(`${SAE_API_URL}/user/proceedings?page=1&unit=&number=&actor=&accused=`, {
    method: 'GET',
    headers: apiHeaders(session),
  })
  if (allProcRes.ok) {
    const allProcPayload = await tryJson<unknown>(allProcRes)
    console.log('[sae-list] /api/user/proceedings (no jurisdiction) payload:', JSON.stringify(allProcPayload)?.slice(0, 300))
    const allEntries = extractProceedingsFromPayload(allProcPayload)
    if (allEntries.length > 0) {
      console.log('[sae-list] found', allEntries.length, 'proceedings in /api/user/proceedings (no filter)')
      return allEntries
    }
  }

  // Step 3: fallback — get user's jurisdictions then fetch per-jurisdiction
  const jurisdRes = await fetch(`${SAE_API_URL}/user/jurisdictions`, {
    method: 'GET',
    headers: apiHeaders(session),
  })
  if (!jurisdRes.ok) return []

  const jurisdPayload = await tryJson<unknown>(jurisdRes)
  console.log('[sae-list] /api/user/jurisdictions payload:', JSON.stringify(jurisdPayload)?.slice(0, 300))
  const jurisdictionIds = unwrapArray(jurisdPayload)
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === 'object')
    .map(e => Number(e.id ?? e.jurisdictionId))
    .filter(id => Number.isFinite(id) && id > 0)

  if (!jurisdictionIds.length) return []

  const perJurisdiction = await Promise.all(jurisdictionIds.map(async jurisdictionId => {
    const results: ProceedingEntry[] = []
    let page = 1
    while (true) {
      const url = new URL(`${SAE_API_URL}/user/proceedings`)
      url.searchParams.set('jurisdiction', String(jurisdictionId))
      url.searchParams.set('page', String(page))
      url.searchParams.set('unit', '')
      url.searchParams.set('number', '')
      url.searchParams.set('actor', '')
      url.searchParams.set('accused', '')

      const res = await fetch(url.toString(), { method: 'GET', headers: apiHeaders(session) })
      if (!res.ok) break

      const entries = unwrapArray(await tryJson<unknown>(res))
        .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === 'object')
      if (!entries.length) break

      results.push(...extractProceedingsFromPayload(entries, jurisdictionId))
      if (entries.length < 20) break
      page++
    }
    return results
  }))

  const seen = new Set<string>()
  const results: ProceedingEntry[] = []
  for (const entries of perJurisdiction) {
    for (const entry of entries) {
      if (!seen.has(entry.procid)) {
        seen.add(entry.procid)
        results.push(entry)
      }
    }
  }
  return results
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) return json({ error: 'No autorizado' }, 401)

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: cred, error: credError } = await serviceClient
      .from('sae_credentials')
      .select('id, username, encrypted_secret, status')
      .eq('profile_id', user.id)
      .eq('provider', 'justucuman')
      .maybeSingle()
    if (credError) throw credError
    if (!cred) return json({ error: 'No tenés credenciales SAE. Configurálas en Ajustes.' }, 400)
    if (cred.status === 'desactivado') return json({ error: 'Las credenciales SAE están desactivadas.' }, 400)

    const password = cred.encrypted_secret ? atob(cred.encrypted_secret) : null
    if (!password) {
      return json({ error: 'No se pudo recuperar la contraseña SAE. Reingresá tus credenciales.' }, 500)
    }

    const session = await authenticateWithSae({
      username: cred.username,
      password,
    })

    await serviceClient
      .from('sae_credentials')
      .update({ status: 'activo', last_login_at: new Date().toISOString(), last_error: null })
      .eq('id', cred.id)

    const proceedings = await fetchMyProceedings(session)

    const numerosSae = proceedings.map(p => p.numero_sae).filter(Boolean)
    let importedMap: Record<string, string> = {}
    if (numerosSae.length > 0) {
      const { data: existingExps } = await serviceClient
        .from('expedientes')
        .select('id, numero_sae')
        .in('numero_sae', numerosSae)
      if (existingExps) {
        for (const exp of existingExps) {
          if (exp.numero_sae) importedMap[exp.numero_sae] = exp.id
        }
      }
    }

    const cases = proceedings.map(p => ({
      procid: p.procid,
      jurisdictionId: p.jurisdictionId,
      numero_sae: p.numero_sae,
      caratula: p.caratula,
      ya_importado: p.numero_sae in importedMap,
      expediente_id: importedMap[p.numero_sae] ?? undefined,
    }))

    return json({ cases })

  } catch (err) {
    console.error('[sae-list]', err)
    const errMsg = err instanceof SaeError ? err.message : err instanceof Error ? err.message : 'Error interno'
    const errCode = err instanceof SaeError ? err.code : 'UNKNOWN'
    const authCodes = ['SAE_AUTH_INVALID_CREDENTIALS', 'SAE_AUTH_REJECTED', 'SAE_AUTH_CSRF_MISSING', 'SAE_AUTH_SESSION_REJECTED']
    const status = err instanceof SaeError && authCodes.includes(err.code) ? 400 : 500
    return json({ error: errMsg, error_code: errCode }, status)
  }
})

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

function apiHeaders(session: SaeSession): Headers {
  const h = new Headers({ Accept: JSON_ACCEPT })
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

async function fetchMyProceedings(session: SaeSession): Promise<ProceedingEntry[]> {
  const seen = new Set<string>()
  const results: ProceedingEntry[] = []
  let page = 1

  while (true) {
    const url = new URL(`${SAE_API_URL}/user/proceedings`)
    url.searchParams.set('page', String(page))

    const res = await fetch(url.toString(), { method: 'GET', headers: apiHeaders(session) })

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new SaeError('SAE_AUTH_SESSION_REJECTED', 'La sesión SAE fue rechazada al obtener expedientes.', res.status)
      }
      break
    }

    const payload = await tryJson<unknown>(res)
    const entries = unwrapArray(payload)
      .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === 'object')

    if (!entries.length) break

    for (const entry of entries) {
      const procid = String(entry.procid ?? entry.id ?? '').trim()
      if (!procid || seen.has(procid)) continue
      seen.add(procid)

      results.push({
        procid,
        jurisdictionId: Number(entry.jurisdictionId ?? entry.jurisdiction_id ?? 0),
        numero_sae: String(entry.nro_expediente ?? entry.number ?? entry.numero ?? '').trim(),
        caratula: String(entry.cover ?? entry.caratula ?? entry.caption ?? entry.caratura ?? '').trim(),
      })
    }

    if (entries.length < 20) break
    page++
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

    const { data: vaultData, error: vaultError } = await serviceClient
      .schema('vault')
      .from('decrypted_secrets')
      .select('decrypted_secret')
      .eq('id', cred.encrypted_secret)
      .single()
    if (vaultError || !vaultData?.decrypted_secret) {
      return json({ error: 'No se pudo recuperar la contraseña SAE. Reingresá tus credenciales.' }, 500)
    }

    const session = await authenticateWithSae({
      username: cred.username,
      password: vaultData.decrypted_secret,
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

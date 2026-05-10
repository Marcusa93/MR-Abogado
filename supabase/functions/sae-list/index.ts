import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import {
  authenticateWithSae,
  SaeError,
  type SaeSession,
} from '../_shared/sae-request-connector.ts'

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
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const d = (payload as Record<string, unknown>).data
    if (Array.isArray(d)) return d
  }
  return []
}

async function fetchAllProceedings(session: SaeSession): Promise<ProceedingEntry[]> {
  // Step 1: Get all centers
  const centersRes = await fetch(`${SAE_API_URL}/centers`, { headers: { Accept: JSON_ACCEPT } })
  if (!centersRes.ok) {
    throw new SaeError('SAE_CATALOG', 'No se pudo obtener el catálogo de centros judiciales.', centersRes.status)
  }
  const centersPayload = await tryJson<unknown>(centersRes)
  const centerIds = unwrapArray(centersPayload)
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === 'object')
    .map(e => Number(e.id))
    .filter(id => Number.isFinite(id))

  // Step 2: Get all jurisdictions across all centers
  const jurisdictions: { id: number }[] = []
  for (const centerId of centerIds) {
    const res = await fetch(`${SAE_API_URL}/jurisdictions?center=${centerId}&full=1`, {
      headers: { Accept: JSON_ACCEPT },
    })
    if (!res.ok) continue
    const payload = await tryJson<unknown>(res)
    for (const entry of unwrapArray(payload)) {
      if (!entry || typeof entry !== 'object') continue
      const e = entry as Record<string, unknown>
      const id = Number(e.id)
      if (Number.isFinite(id)) jurisdictions.push({ id })
    }
  }

  // Step 3: For each jurisdiction, paginate /api/user/proceedings until empty
  const seen = new Set<string>()
  const results: ProceedingEntry[] = []

  for (const jurisdiction of jurisdictions) {
    let page = 1
    while (true) {
      const url = new URL(`${SAE_API_URL}/user/proceedings`)
      url.searchParams.set('jurisdiction', String(jurisdiction.id))
      url.searchParams.set('page', String(page))
      url.searchParams.set('unit', '')
      url.searchParams.set('number', '')
      url.searchParams.set('actor', '')
      url.searchParams.set('accused', '')

      const res = await fetch(url.toString(), { method: 'GET', headers: apiHeaders(session) })
      if (res.status >= 500) {
        // Session may be expired or jurisdiction doesn't support this endpoint
        break
      }
      if (!res.ok) break

      const payload = await tryJson<unknown>(res)
      const entries = unwrapArray(payload)
        .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === 'object')

      if (!entries.length) break

      for (const entry of entries) {
        const procid = String(entry.procid ?? entry.id ?? '').trim()
        if (!procid || seen.has(procid)) continue
        seen.add(procid)

        const numero_sae = String(
          entry.nro_expediente ?? entry.number ?? entry.numero ?? ''
        ).trim()
        const caratula = String(
          entry.cover ?? entry.caratula ?? entry.caption ?? entry.caratura ?? ''
        ).trim()

        results.push({
          procid,
          jurisdictionId: jurisdiction.id,
          numero_sae,
          caratula,
        })
      }

      // If we got fewer results than a typical page size (20), assume last page
      if (entries.length < 20) break
      page++
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
    // ── Auth ─────────────────────────────────────────────────────────────────
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

    // ── Credenciales SAE ──────────────────────────────────────────────────────
    const { data: cred, error: credError } = await serviceClient
      .from('sae_credentials')
      .select('id, username, encrypted_secret, status')
      .eq('profile_id', user.id)
      .eq('provider', 'justucuman')
      .maybeSingle()
    if (credError) throw credError
    if (!cred) return json({ error: 'No tenés credenciales SAE. Configurálas en Ajustes.' }, 400)
    if (cred.status === 'desactivado') return json({ error: 'Las credenciales SAE están desactivadas.' }, 400)

    // ── Descifrar contraseña del Vault ────────────────────────────────────────
    const { data: vaultData, error: vaultError } = await serviceClient
      .schema('vault')
      .from('decrypted_secrets')
      .select('decrypted_secret')
      .eq('id', cred.encrypted_secret)
      .single()
    if (vaultError || !vaultData?.decrypted_secret) {
      return json({ error: 'No se pudo recuperar la contraseña SAE. Reingresá tus credenciales.' }, 500)
    }

    // ── Autenticar en SAE ─────────────────────────────────────────────────────
    const session = await authenticateWithSae({
      username: cred.username,
      password: vaultData.decrypted_secret,
    })

    // Marcar credencial como activa
    await serviceClient
      .from('sae_credentials')
      .update({ status: 'activo', last_login_at: new Date().toISOString(), last_error: null })
      .eq('id', cred.id)

    // ── Obtener todos los expedientes de SAE ──────────────────────────────────
    const proceedings = await fetchAllProceedings(session)

    // ── Verificar cuáles ya están importados ──────────────────────────────────
    const numerosSae = proceedings.map(p => p.numero_sae).filter(Boolean)

    let importedMap: Record<string, string> = {}
    if (numerosSae.length > 0) {
      const { data: existingExps } = await serviceClient
        .from('expedientes')
        .select('id, numero_sae')
        .in('numero_sae', numerosSae)

      if (existingExps) {
        for (const exp of existingExps) {
          if (exp.numero_sae) {
            importedMap[exp.numero_sae] = exp.id
          }
        }
      }
    }

    // ── Construir respuesta ───────────────────────────────────────────────────
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
    return json({ error: errMsg, error_code: errCode }, 500)
  }
})

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { readSaePassword } from '../_shared/sae-credentials.ts'
import {
  authenticateWithSae,
  findCaseByNumber,
  fetchCaseHistory,
  fetchProceedingHistoryWithMeta,
  fetchStoryBody,
  extractEstadoFromEntry,
  fetchEstadoOrganismoFromHistoria,
  SaeError,
  type SaeSession,
} from '../_shared/sae-request-connector.ts'

const SAE_API_URL = 'https://conexpbe.justucuman.gov.ar/api'
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function apiHeaders(session: SaeSession): Headers {
  const h = new Headers({
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
    'User-Agent': BROWSER_UA,
    Origin: 'https://consultaexpedientes.justucuman.gov.ar',
    Referer: 'https://consultaexpedientes.justucuman.gov.ar/',
  })
  if (session.cookies.length) h.set('Cookie', session.cookies.join('; '))
  if (session.headers?.Authorization) h.set('Authorization', session.headers.Authorization)
  return h
}

async function findCaseInUserProceedings(
  numeroSae: string,
  session: SaeSession,
): Promise<{ procid: string; jurisdictionId: number; entry: Record<string, unknown> } | null> {
  const res = await fetch(`${SAE_API_URL}/user`, { method: 'GET', headers: apiHeaders(session) })
  if (!res.ok) return null
  const payload = await res.json().catch(() => null) as unknown
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Record<string, unknown>
  const proceedingsSrc = root.proceedings ?? (root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>).proceedings : null)
  if (!Array.isArray(proceedingsSrc)) return null
  for (const entry of proceedingsSrc) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const num = String(e.nro_expediente ?? e.number ?? e.numero ?? '').trim()
    if (num !== numeroSae) continue
    const procid = String(e.procid ?? e.id ?? '').trim()
    const jurisdictionId = Number(e.jurisdictionId ?? e.jurisdiction_id ?? 0)
    if (procid && jurisdictionId > 0) return { procid, jurisdictionId, entry: e }
  }
  return null
}

type MovementType =
  | 'sentencia' | 'traslado' | 'audiencia' | 'prueba' | 'embargo'
  | 'cedula' | 'oficio' | 'intimacion' | 'planilla' | 'informe'
  | 'decreto' | 'escrito_parte' | 'otro'

function classifyMovement(titulo: string): MovementType {
  const t = titulo.toLowerCase()
  if (t.includes('sentencia')) return 'sentencia'
  if (t.includes('traslado')) return 'traslado'
  if (t.includes('audiencia')) return 'audiencia'
  if (t.includes('prueba')) return 'prueba'
  if (t.includes('embargo')) return 'embargo'
  if (t.includes('cédula') || t.includes('cedula')) return 'cedula'
  if (t.includes('oficio')) return 'oficio'
  if (t.includes('intimac')) return 'intimacion'
  if (t.includes('planilla')) return 'planilla'
  if (t.includes('informe')) return 'informe'
  if (t.includes('decreto')) return 'decreto'
  if (t.includes('escrito')) return 'escrito_parte'
  return 'otro'
}

async function sha256(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function buildFingerprint(caseNumber: string, fecha: string, titulo: string, body?: string): Promise<string> {
  const key = [caseNumber, fecha, titulo, body ?? ''].map(s => s.trim().toLowerCase()).join('|')
  return sha256(key)
}

function parseDate(value: string): string | null {
  if (!value?.trim()) return null
  const normalized = value.trim()
  const match = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (match) {
    const [, d, m, y] = match
    const year = y.length === 2 ? `20${y}` : y
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return normalized.slice(0, 10)
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

async function canSyncExpedienteSae(
  anonClient: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> },
  expedienteId: string,
): Promise<boolean> {
  const { data, error } = await anonClient.rpc('can_sync_expediente_sae', {
    p_expediente_id: expedienteId,
  })
  if (!error) return Boolean(data)

  // Hotfix de compatibilidad: la migración multiabogado puede no estar aplicada
  // todavía en producción. En ese caso conservamos el comportamiento anterior.
  const message = error.message ?? ''
  if (error.code === 'PGRST202' || message.includes('can_sync_expediente_sae')) {
    console.warn('[sae-sync] can_sync_expediente_sae unavailable; using legacy sync permission')
    return true
  }

  throw error
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const startedAt = new Date().toISOString()

  try {
    // ── Parse body + auth ────────────────────────────────────────────────────
    // Acepta JWT de usuario (UI) o service_role + on_behalf_of_user_id (cron batch).
    let bodyParsed: { expediente_id?: string; on_behalf_of_user_id?: string }
    try { bodyParsed = await req.json() } catch { bodyParsed = {} }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = req.headers.get('Authorization') ?? ''
    const isServiceRole = authHeader.replace(/^Bearer\s+/i, '').trim() === supabaseServiceKey

    let userId: string
    let pushAuth: string
    let anonClient: ReturnType<typeof createClient> | null = null

    if (isServiceRole) {
      if (!bodyParsed.on_behalf_of_user_id) {
        return json(req, { error: 'on_behalf_of_user_id requerido para service_role' }, 400)
      }
      userId = bodyParsed.on_behalf_of_user_id
      pushAuth = `Bearer ${supabaseServiceKey}`
    } else {
      anonClient = createClient(
        supabaseUrl,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      )
      const { data: { user }, error: authError } = await anonClient.auth.getUser()
      if (authError || !user) return json(req, { error: 'No autorizado' }, 401)
      userId = user.id
      pushAuth = authHeader
    }

    const { expediente_id } = bodyParsed
    if (!expediente_id) return json(req, { error: 'expediente_id requerido' }, 400)

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

    // ── Expediente ──────────────────────────────────────────────────────────
    const { data: exp, error: expError } = await serviceClient
      .from('expedientes')
      .select('id, numero_sae, estado_sae, fuero, caratula')
      .eq('id', expediente_id)
      .single()
    if (expError || !exp) return json(req, { error: 'Expediente no encontrado' }, 404)
    if (!exp.numero_sae) return json(req, { error: 'El expediente no tiene número SAE configurado' }, 400)

    if (anonClient) {
      const canSync = await canSyncExpedienteSae(anonClient, expediente_id)
      if (!canSync) return json(req, { error: 'Sin permisos para sincronizar este expediente SAE' }, 403)
    }

    // ── Credenciales SAE ────────────────────────────────────────────────────
    const { data: cred, error: credError } = await serviceClient
      .from('sae_credentials')
      .select('id, username, encrypted_secret, status')
      .eq('profile_id', userId)
      .eq('provider', 'justucuman')
      .maybeSingle()
    if (credError) throw credError
    if (!cred) return json(req, { error: 'No tenés credenciales SAE. Configurálas en Ajustes.' }, 400)
    if (cred.status === 'desactivado') return json(req, { error: 'Las credenciales SAE están desactivadas' }, 400)

    const password = await readSaePassword(cred.encrypted_secret, {
      serviceClient,
      userId,
    })
    if (!password) {
      return json(req, { error: 'No se pudo recuperar la contraseña SAE. Reingresá tus credenciales.' }, 500)
    }

    // ── Crear log de sincronización ──────────────────────────────────────────
    const { data: logEntry } = await serviceClient
      .from('sae_sync_logs')
      .insert({ expediente_id, profile_id: userId, status: 'iniciado', started_at: startedAt })
      .select('id')
      .single()

    const logId = logEntry?.id

    try {
      // ── Autenticar en SAE ──────────────────────────────────────────────────
      const session = await authenticateWithSae({
        username: cred.username,
        password,
      })

      // Marcar credencial como activa
      await serviceClient
        .from('sae_credentials')
        .update({ status: 'activo', last_login_at: new Date().toISOString(), last_error: null })
        .eq('id', cred.id)

      // ── Obtener procid + jurisdictionId ──────────────────────────────────
      let procid: string | null = null
      let jurisdictionId: number | null = null

      // Usar primero el vínculo SAE propio del usuario si ya existe. Esto
      // evita depender de credenciales de otro abogado cuando el expediente
      // local está compartido por numero_sae.
      const { data: ownLink } = await serviceClient
        .from('expediente_sae_links')
        .select('procid, jurisdiction_id')
        .eq('profile_id', userId)
        .eq('provider', 'justucuman')
        .eq('expediente_id', expediente_id)
        .maybeSingle()

      if (ownLink?.procid && ownLink.jurisdiction_id != null) {
        procid = ownLink.procid
        jurisdictionId = ownLink.jurisdiction_id
      }

      // Buscar en movimientos existentes primero
      if (!procid || !jurisdictionId) {
        const { data: existingMovements } = await serviceClient
          .from('sae_movements')
          .select('sae_case_id, raw_payload')
          .eq('expediente_id', expediente_id)
          .not('sae_case_id', 'is', null)
          .limit(1)

        if (existingMovements?.length) {
          procid = existingMovements[0].sae_case_id
          const rp = existingMovements[0].raw_payload as Record<string, unknown>
          const rawJurisdictionId = rp?.jurisdiction_id
          jurisdictionId = typeof rawJurisdictionId === 'number' ? rawJurisdictionId
            : typeof rawJurisdictionId === 'string' ? Number(rawJurisdictionId) || null
            : null
        }
      }

      // Buscar siempre en /api/user (rápido, una sola llamada) para
      // capturar el entry actual con su estado de trámite, incluso si
      // ya tenemos procid+jurisdictionId. Eso permite refrescar estado_organismo.
      let proceedingEntry: Record<string, unknown> | null = null
      const fromUserList = await findCaseInUserProceedings(exp.numero_sae, session)
      if (fromUserList) {
        if (!procid || !jurisdictionId) {
          procid = fromUserList.procid
          jurisdictionId = fromUserList.jurisdictionId
        }
        proceedingEntry = fromUserList.entry
      }

      // Fallback: escanear por jurisdicción (lento, sólo si /api/user no lo trae)
      if (!procid || !jurisdictionId) {
        const found = await findCaseByNumber(exp.numero_sae, session)
        if (!found) {
          return json(req, { error: `No se encontró el expediente ${exp.numero_sae} en SAE. Verificá el número.` }, 404)
        }
        procid = found.procid
        jurisdictionId = found.jurisdictionId
        proceedingEntry = found.rawEntry ?? null
      }

      // Refrescar estado del expediente desde el entry crudo del SAE
      let estadoOrganismo: string | null = null
      let estadoOrganismoDesde: string | null = null
      if (proceedingEntry) {
        const { estado, desde } = extractEstadoFromEntry(proceedingEntry)
        estadoOrganismo = estado
        estadoOrganismoDesde = desde
      }

      // El estado viene en root.proceeding.ultimo_tramite del response de
      // /user/proceedings/history (confirmado empíricamente).
      let historyRoot: Record<string, unknown> | null = null
      if (!estadoOrganismo && procid && jurisdictionId) {
        const historyMeta = await fetchProceedingHistoryWithMeta(procid, jurisdictionId, session)
        if (historyMeta) {
          historyRoot = historyMeta.root
          const proceeding = (historyMeta.root.proceeding && typeof historyMeta.root.proceeding === 'object')
            ? historyMeta.root.proceeding as Record<string, unknown>
            : historyMeta.root
          const { estado, desde } = extractEstadoFromEntry(proceeding)
          if (estado) {
            estadoOrganismo = estado
            estadoOrganismoDesde = desde
          }
        }
      }

      // Fallback: scrape de la página HTML pública del SAE
      if (!estadoOrganismo) {
        const scraped = await fetchEstadoOrganismoFromHistoria(
          exp.numero_sae,
          (exp as { fuero?: string | null }).fuero ?? null,
          session,
        )
        if (scraped) {
          estadoOrganismo = scraped.estado
          estadoOrganismoDesde = scraped.desde
        }
      }

      if (estadoOrganismo || proceedingEntry || historyRoot) {
        await serviceClient
          .from('expedientes')
          .update({
            estado_organismo: estadoOrganismo,
            estado_organismo_desde: estadoOrganismoDesde,
            // Guardamos el root del history (con TODAS las keys del API) — mejor
            // material para diagnóstico que el entry de /user/proceedings que
            // solo trae id/unit/cover/number/procid/jurisdiction.
            sae_proceeding_entry: historyRoot ?? proceedingEntry,
            updated_at: new Date().toISOString(),
          } as never)
          .eq('id', expediente_id)
      }

      await serviceClient
        .from('expediente_sae_links')
        .upsert({
          expediente_id,
          profile_id: userId,
          provider: 'justucuman',
          numero_sae: exp.numero_sae,
          procid,
          jurisdiction_id: jurisdictionId,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as never, { onConflict: 'profile_id,provider,numero_sae' } as never)

      // ── Obtener historial ─────────────────────────────────────────────────
      const stories = await fetchCaseHistory(procid, jurisdictionId, session)

      if (!stories.length) {
        const syncedAt = new Date().toISOString()
        await serviceClient
          .from('sae_sync_logs')
          .update({ status: 'exitoso', finished_at: syncedAt, nuevas_actuaciones: 0, duplicadas: 0 })
          .eq('id', logId)
        await serviceClient
          .from('expediente_sae_links')
          .update({ last_sync_at: syncedAt, updated_at: syncedAt } as never)
          .eq('profile_id', userId)
          .eq('provider', 'justucuman')
          .eq('expediente_id', expediente_id)
        return json(req, { success: true, nuevas: 0, duplicadas: 0, message: 'El expediente no tiene actuaciones registradas en SAE.' })
      }

      // Ordenar por fecha desc, tomar las más recientes
      const sorted = [...stories].sort((a, b) => {
        const da = parseDate(a.fecha) ?? ''
        const db = parseDate(b.fecha) ?? ''
        return db.localeCompare(da)
      })

      // Fetch body text para las primeras 30 (cap razonable de tiempo de sync;
      // el resto se baja on-demand al generar el PDF y se cachea en DB).
      const withBody = await Promise.all(
        sorted.map(async (story, idx) => {
          const body = idx < 30
            ? await fetchStoryBody(procid!, jurisdictionId!, story.histid, session)
            : undefined
          return { ...story, body }
        })
      )

      // ── Upsert en sae_movements ───────────────────────────────────────────
      // Build movements + fingerprints first so we can check existence in one query
      const built = await Promise.all(withBody.map(async (story) => {
        const fecha = parseDate(story.fecha) ?? story.fecha.slice(0, 10)
        const fingerprint = await buildFingerprint(exp.numero_sae, fecha, story.dscr, story.body)
        const tipo = classifyMovement(story.dscr)
        return {
          fingerprint,
          movement: {
            expediente_id,
            external_id: story.histid,
            sae_case_id: procid,
            fecha,
            titulo: story.dscr,
            cuerpo: story.body ?? null,
            tipo_movimiento: tipo,
            fingerprint,
            tiene_documentos: Boolean(story.archivos?.length || story.vinculos?.length),
            raw_payload: {
              jurisdiction_id: jurisdictionId,
              archivos: story.archivos,
              vinculos: story.vinculos,
            },
            synced_at: new Date().toISOString(),
          },
        }
      }))

      // Find which fingerprints already exist
      const fingerprints = built.map(b => b.fingerprint)
      const { data: existingFps } = await serviceClient
        .from('sae_movements')
        .select('fingerprint')
        .eq('expediente_id', expediente_id)
        .in('fingerprint', fingerprints)
      const existingSet = new Set((existingFps ?? []).map((r: { fingerprint: string }) => r.fingerprint))

      const newOnes = built.filter(b => !existingSet.has(b.fingerprint))
      const duplicadas = built.length - newOnes.length

      // Insert only the new ones, returning IDs so we can attach AI analysis
      let nuevas = 0
      const insertedRows: { id: string; movement: typeof built[0]['movement'] }[] = []

      if (newOnes.length > 0) {
        const { data: inserted, error: insertError } = await serviceClient
          .from('sae_movements')
          .insert(newOnes.map(b => b.movement))
          .select('id, fingerprint')
        if (insertError) {
          console.error('[sae-sync] insert error', insertError)
        } else if (inserted) {
          nuevas = inserted.length
          for (const row of inserted) {
            const match = newOnes.find(b => b.fingerprint === row.fingerprint)
            if (match) insertedRows.push({ id: row.id, movement: match.movement })
          }
        }
      }

      // (El análisis IA es on-demand vía la edge function sae-analyze-movement
      //  para no quemar tokens en cada sync. El usuario decide qué analizar.)

      // ── Push notification al owner cuando hay nuevas actuaciones ────────
      // Skip si era la primera sync (existingSet.size === 0) — sería ruido
      // post-import. Solo avisamos cuando ya había historial previo.
      if (nuevas > 0 && existingSet.size > 0) {
        try {
          const importantTypes = new Set(['sentencia', 'audiencia', 'intimacion', 'embargo'])
          const importantNew = insertedRows.filter(r => importantTypes.has(r.movement.tipo_movimiento))
          const emoji = importantNew.length > 0 ? '⚠️' : '📬'
          const caratula = (exp as { caratula?: string | null }).caratula
          const label = caratula ? caratula.slice(0, 45) : (exp.numero_sae ?? 'expediente')
          const title = `${emoji} ${label}`
          const reciente = insertedRows[0]?.movement.titulo ?? ''
          const pushBody = nuevas === 1
            ? reciente.slice(0, 100)
            : `${nuevas} actuaciones · ${reciente.slice(0, 70)}`

          await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: pushAuth,
            },
            body: JSON.stringify({
              user_ids: [userId],
              payload: {
                title,
                body: pushBody,
                url: `/expedientes/${expediente_id}`,
                tag: `sae-sync-${expediente_id}`,
              },
            }),
          })
        } catch (pushErr) {
          console.error('[sae-sync] push error', pushErr)
        }
      }

      // ── Actualizar expediente ─────────────────────────────────────────────
      await serviceClient
        .from('expedientes')
        .update({ ultima_sincronizacion_sae: new Date().toISOString() })
        .eq('id', expediente_id)

      // ── Actualizar credential last_sync_at ─────────────────────────────────
      await serviceClient
        .from('sae_credentials')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', cred.id)

      await serviceClient
        .from('expediente_sae_links')
        .update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() } as never)
        .eq('profile_id', userId)
        .eq('provider', 'justucuman')
        .eq('expediente_id', expediente_id)

      // ── Finalizar log ────────────────────────────────────────────────────
      await serviceClient
        .from('sae_sync_logs')
        .update({ status: 'exitoso', finished_at: new Date().toISOString(), nuevas_actuaciones: nuevas, duplicadas })
        .eq('id', logId)

      return json(req, { success: true, nuevas, duplicadas, total: stories.length })

    } catch (innerErr) {
      const errMsg = innerErr instanceof SaeError
        ? innerErr.message
        : innerErr instanceof Error ? innerErr.message : 'Error interno'
      const errCode = innerErr instanceof SaeError ? innerErr.code : 'UNKNOWN'

      // Marcar credencial con error si es de auth
      if (errCode.includes('AUTH') || errCode.includes('CREDENTIALS')) {
        await serviceClient
          .from('sae_credentials')
          .update({ status: 'error', last_error: errMsg })
          .eq('id', cred.id)
      }

      if (logId) {
        await serviceClient
          .from('sae_sync_logs')
          .update({ status: 'error', finished_at: new Date().toISOString(), error_code: errCode, error_message: errMsg })
          .eq('id', logId)
      }

      return json(req, { error: errMsg, error_code: errCode }, 500)
    }

  } catch (err) {
    console.error('[sae-sync]', err)
    return json(req, { error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

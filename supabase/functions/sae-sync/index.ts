import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import {
  authenticateWithSae,
  findCaseByNumber,
  fetchCaseHistory,
  fetchStoryBody,
  SaeError,
  type SaeSession,
} from '../_shared/sae-request-connector.ts'
import { analyzeMovementWithAI, shouldAnalyzeMovement } from '../_shared/sae-ai-analyzer.ts'

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
): Promise<{ procid: string; jurisdictionId: number } | null> {
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
    if (procid && jurisdictionId > 0) return { procid, jurisdictionId }
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const startedAt = new Date().toISOString()

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
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

    const { expediente_id } = await req.json()
    if (!expediente_id) return json({ error: 'expediente_id requerido' }, 400)

    // ── Expediente ──────────────────────────────────────────────────────────
    const { data: exp, error: expError } = await serviceClient
      .from('expedientes')
      .select('id, numero_sae, estado_sae')
      .eq('id', expediente_id)
      .single()
    if (expError || !exp) return json({ error: 'Expediente no encontrado' }, 404)
    if (!exp.numero_sae) return json({ error: 'El expediente no tiene número SAE configurado' }, 400)

    // ── Credenciales SAE ────────────────────────────────────────────────────
    const { data: cred, error: credError } = await serviceClient
      .from('sae_credentials')
      .select('id, username, encrypted_secret, status')
      .eq('profile_id', user.id)
      .eq('provider', 'justucuman')
      .maybeSingle()
    if (credError) throw credError
    if (!cred) return json({ error: 'No tenés credenciales SAE. Configurálas en Ajustes.' }, 400)
    if (cred.status === 'desactivado') return json({ error: 'Las credenciales SAE están desactivadas' }, 400)

    const password = cred.encrypted_secret ? atob(cred.encrypted_secret) : null
    if (!password) {
      return json({ error: 'No se pudo recuperar la contraseña SAE. Reingresá tus credenciales.' }, 500)
    }

    // ── Crear log de sincronización ──────────────────────────────────────────
    const { data: logEntry } = await serviceClient
      .from('sae_sync_logs')
      .insert({ expediente_id, profile_id: user.id, status: 'iniciado', started_at: startedAt })
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

      // Buscar en movimientos existentes primero
      const { data: existingMovements } = await serviceClient
        .from('sae_movements')
        .select('sae_case_id, raw_payload')
        .eq('expediente_id', expediente_id)
        .not('sae_case_id', 'is', null)
        .limit(1)

      if (existingMovements?.length) {
        procid = existingMovements[0].sae_case_id
        const rp = existingMovements[0].raw_payload as Record<string, unknown>
        jurisdictionId = typeof rp?.jurisdiction_id === 'number' ? rp.jurisdiction_id : null
      }

      // Si no hay movimientos previos, buscar primero en /api/user (rápido, una sola llamada)
      if (!procid || !jurisdictionId) {
        const fromUserList = await findCaseInUserProceedings(exp.numero_sae, session)
        if (fromUserList) {
          procid = fromUserList.procid
          jurisdictionId = fromUserList.jurisdictionId
        }
      }

      // Fallback: escanear por jurisdicción (lento, sólo si /api/user no lo trae)
      if (!procid || !jurisdictionId) {
        const found = await findCaseByNumber(exp.numero_sae, session)
        if (!found) {
          return json({ error: `No se encontró el expediente ${exp.numero_sae} en SAE. Verificá el número.` }, 404)
        }
        procid = found.procid
        jurisdictionId = found.jurisdictionId
      }

      // ── Obtener historial ─────────────────────────────────────────────────
      const stories = await fetchCaseHistory(procid, jurisdictionId, session)

      if (!stories.length) {
        await serviceClient
          .from('sae_sync_logs')
          .update({ status: 'exitoso', finished_at: new Date().toISOString(), nuevas_actuaciones: 0, duplicadas: 0 })
          .eq('id', logId)
        return json({ success: true, nuevas: 0, duplicadas: 0, message: 'El expediente no tiene actuaciones registradas en SAE.' })
      }

      // Ordenar por fecha desc, tomar las más recientes
      const sorted = [...stories].sort((a, b) => {
        const da = parseDate(a.fecha) ?? ''
        const db = parseDate(b.fecha) ?? ''
        return db.localeCompare(da)
      })

      // Fetch body text para las primeras 10
      const withBody = await Promise.all(
        sorted.map(async (story, idx) => {
          const body = idx < 10
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

      // ── Análisis IA en paralelo (sólo nuevas e importantes) ─────────────
      const apiKey = Deno.env.get('OPENROUTER_API_KEY')
      if (apiKey && insertedRows.length > 0) {
        const toAnalyze = insertedRows.filter(({ movement: m }) =>
          shouldAnalyzeMovement(m.tipo_movimiento, m.titulo, m.cuerpo)
        )
        await Promise.all(toAnalyze.map(async ({ id, movement: m }) => {
          try {
            const analysis = await analyzeMovementWithAI({
              titulo: m.titulo,
              cuerpo: m.cuerpo,
              tipo_movimiento: m.tipo_movimiento,
              fecha: m.fecha,
              apiKey,
            })
            await serviceClient
              .from('sae_movements')
              .update({
                ai_summary: analysis.summary,
                ai_extracted: analysis.extracted,
                ai_suggested_action: analysis.suggested_action,
                ai_model: analysis.model,
                ai_analyzed_at: new Date().toISOString(),
                ai_error: null,
              })
              .eq('id', id)
          } catch (aiErr) {
            const msg = aiErr instanceof Error ? aiErr.message : 'Error IA desconocido'
            console.error('[sae-sync][ai]', id, msg)
            await serviceClient
              .from('sae_movements')
              .update({ ai_error: msg.slice(0, 500), ai_analyzed_at: new Date().toISOString() })
              .eq('id', id)
          }
        }))
      }

      // ── Backfill IA: analizar hasta 5 actuaciones viejas sin análisis ────
      // Permite que actuaciones pre-existentes a esta feature también ganen
      // resumen + acción sugerida sin que el usuario tenga que esperar
      // a que llegue una nueva.
      if (apiKey) {
        const { data: pending } = await serviceClient
          .from('sae_movements')
          .select('id, titulo, cuerpo, tipo_movimiento, fecha')
          .eq('expediente_id', expediente_id)
          .is('ai_analyzed_at', null)
          .order('fecha', { ascending: false })
          .limit(5)

        const pendingImportant = (pending ?? []).filter((m: { titulo: string; cuerpo: string | null; tipo_movimiento: string }) =>
          shouldAnalyzeMovement(m.tipo_movimiento, m.titulo, m.cuerpo)
        ) as { id: string; titulo: string; cuerpo: string | null; tipo_movimiento: string; fecha: string }[]

        await Promise.all(pendingImportant.map(async (m) => {
          try {
            const analysis = await analyzeMovementWithAI({
              titulo: m.titulo,
              cuerpo: m.cuerpo,
              tipo_movimiento: m.tipo_movimiento,
              fecha: m.fecha,
              apiKey,
            })
            await serviceClient
              .from('sae_movements')
              .update({
                ai_summary: analysis.summary,
                ai_extracted: analysis.extracted,
                ai_suggested_action: analysis.suggested_action,
                ai_model: analysis.model,
                ai_analyzed_at: new Date().toISOString(),
                ai_error: null,
              })
              .eq('id', m.id)
          } catch (aiErr) {
            const msg = aiErr instanceof Error ? aiErr.message : 'Error IA desconocido'
            console.error('[sae-sync][ai-backfill]', m.id, msg)
            await serviceClient
              .from('sae_movements')
              .update({ ai_error: msg.slice(0, 500), ai_analyzed_at: new Date().toISOString() })
              .eq('id', m.id)
          }
        }))
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

      // ── Finalizar log ────────────────────────────────────────────────────
      await serviceClient
        .from('sae_sync_logs')
        .update({ status: 'exitoso', finished_at: new Date().toISOString(), nuevas_actuaciones: nuevas, duplicadas })
        .eq('id', logId)

      return json({ success: true, nuevas, duplicadas, total: stories.length })

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

      return json({ error: errMsg, error_code: errCode }, 500)
    }

  } catch (err) {
    console.error('[sae-sync]', err)
    return json({ error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

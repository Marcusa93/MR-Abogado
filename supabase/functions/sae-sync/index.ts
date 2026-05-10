import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import {
  authenticateWithSae,
  findCaseByNumber,
  fetchCaseHistory,
  fetchStoryBody,
  SaeError,
} from '../_shared/sae-request-connector.ts'

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

      // Si no hay movimientos previos, buscar por numero_sae
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
      let nuevas = 0
      let duplicadas = 0

      for (const story of withBody) {
        const fecha = parseDate(story.fecha) ?? story.fecha.slice(0, 10)
        const fingerprint = await buildFingerprint(exp.numero_sae, fecha, story.dscr, story.body)
        const tipo = classifyMovement(story.dscr)

        const movement = {
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
        }

        const { error: upsertError } = await serviceClient
          .from('sae_movements')
          .upsert(movement, { onConflict: 'expediente_id,fingerprint', ignoreDuplicates: true })

        if (upsertError) {
          // fingerprint conflict = duplicate
          duplicadas++
        } else {
          nuevas++
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

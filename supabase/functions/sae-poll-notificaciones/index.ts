// ─────────────────────────────────────────────────────────────────────────────
// Edge function: sae-poll-notificaciones
//
// Invocada por pg_cron 2x al día (00:15 y 08:30 AR). Autenticación
// por header x-cron-secret. Sin JWT de usuario.
//
// Flujo por cada usuario con sae_notif_enabled=true:
//   1. Login al SAE (reusa _shared/sae-request-connector).
//   2. GET al endpoint de notificaciones digitales del portal.
//      TODO(cURL): URL y formato del payload se ajustan con el cURL real.
//   3. Diff contra sae_notificaciones por (profile_id, sae_notif_id).
//   4. Inserta nuevas, intenta vincular con expedientes locales por
//      numero_sae.
//   5. Por cada nueva:
//      - Si profile.sae_notif_push: dispara push (difiere si quiet hours).
//      - Si profile.sae_notif_email: manda email vía Resend.
//
// Body opcional: { dry_run?: boolean, only_profile_id?: string }
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { authenticateWithSae, SaeError, type SaeSession } from '../_shared/sae-request-connector.ts'
import { sendEmail, escapeHtml } from '../_shared/resend.ts'

const PORTAL_BASE = 'https://portaldelsae.justucuman.gov.ar'
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface ProfileRow {
  id: string
  email: string | null
  nombre: string | null
  apellido: string | null
  sae_notif_enabled: boolean
  sae_notif_push: boolean
  sae_notif_email: boolean
  sae_notif_email_addresses: string[]
  sae_notif_push_quiet: boolean
  sae_notif_weekend: boolean
}

interface PortalNotificacion {
  sae_notif_id: string             // id único en el portal
  numero_expediente: string | null
  caratula: string | null
  oficina: string | null
  tipo: string | null
  titulo: string | null
  fecha_emision: string | null     // ISO
  raw: Record<string, unknown>
}

// ─── Fetch de notificaciones del portal ─────────────────────────────────────

async function fetchNotificacionesFromPortal(session: SaeSession): Promise<PortalNotificacion[]> {
  // TODO(cURL): URL y headers reales se ajustan cuando tengamos el cURL del
  // request que hace la página /inicializando?module=notificaciones-digitales.
  // Las opciones más probables:
  //   - GET https://portaldelsae.justucuman.gov.ar/api/notificaciones
  //   - GET https://portaldelsae.justucuman.gov.ar/notificaciones-digitales/list
  //   - POST /api/notificaciones con paginación
  const candidateUrls = [
    `${PORTAL_BASE}/notificaciones-digitales/data`,
    `${PORTAL_BASE}/api/notificaciones-digitales`,
    `${PORTAL_BASE}/api/notificaciones`,
  ]

  const headers = new Headers({
    Accept: 'application/json, text/plain, */*',
    'User-Agent': BROWSER_UA,
    Referer: `${PORTAL_BASE}/inicializando?module=notificaciones-digitales`,
    Origin: PORTAL_BASE,
    Cookie: session.cookies.join('; '),
    ...(session.headers?.Authorization ? { Authorization: session.headers.Authorization } : {}),
  })

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, { headers })
      if (!res.ok) continue
      const payload = await res.json().catch(() => null)
      const list = extractList(payload)
      if (list.length > 0 || res.headers.get('content-type')?.includes('json')) {
        return list.map(normalizeEntry).filter((n): n is PortalNotificacion => n !== null)
      }
    } catch {
      // siguiente candidato
    }
  }
  return []
}

function extractList(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[]
  if (payload && typeof payload === 'object') {
    const root = payload as Record<string, unknown>
    for (const k of ['data', 'items', 'notificaciones', 'rows', 'list']) {
      const v = root[k]
      if (Array.isArray(v)) return v as Record<string, unknown>[]
    }
  }
  return []
}

function normalizeEntry(raw: Record<string, unknown>): PortalNotificacion | null {
  // TODO(cURL): nombres reales de los campos se completan con el payload concreto.
  // Por ahora intentamos varias variantes comunes para que la primera prueba
  // detecte la mayoría de las notificaciones aunque no sepamos el shape exacto.
  const id = String(raw.id ?? raw.notif_id ?? raw.codigo ?? raw.uuid ?? '').trim()
  if (!id) return null
  return {
    sae_notif_id: id,
    numero_expediente: pickString(raw, ['numero_expediente', 'nro_expediente', 'expediente', 'numero']),
    caratula: pickString(raw, ['caratula', 'caption', 'titulo_expediente']),
    oficina: pickString(raw, ['oficina', 'office', 'dependencia']),
    tipo: pickString(raw, ['tipo', 'tipo_notificacion', 'type', 'categoria']),
    titulo: pickString(raw, ['titulo', 'asunto', 'description', 'descripcion']),
    fecha_emision: pickIsoDate(raw, ['fecha_emision', 'fecha', 'emitted_at', 'created_at']),
    raw,
  }
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

function pickIsoDate(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) {
      const d = new Date(v)
      if (!isNaN(d.getTime())) return d.toISOString()
    }
  }
  return null
}

// ─── Quiet hours: ¿push ahora o diferido? ───────────────────────────────────

// Devuelve null si se puede mandar ya. Si está en quiet hours, devuelve el ISO
// de las 08:00 AR del próximo día (o de hoy si todavía no llegaron las 8).
function computePushDelay(quietEnabled: boolean): string | null {
  if (!quietEnabled) return null
  const now = new Date()
  // Convertir a hora AR (UTC-3)
  const utcHour = now.getUTCHours()
  const arHour = (utcHour - 3 + 24) % 24
  if (arHour >= 8 && arHour < 22) return null  // horario activo

  // Calcular las 08:00 AR del momento más cercano (puede ser hoy o mañana)
  const target = new Date(now)
  // Trabajar en UTC: 08:00 AR = 11:00 UTC
  target.setUTCHours(11, 0, 0, 0)
  if (target.getTime() <= now.getTime()) {
    target.setUTCDate(target.getUTCDate() + 1)
  }
  return target.toISOString()
}

// ─── Push: reusa la edge function send-push-notification ────────────────────

async function triggerPush(profileId: string, title: string, body: string, url: string): Promise<boolean> {
  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        user_ids: [profileId],
        payload: { title, body, url, tag: 'sae-notif' },
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

// ─── Email: HTML básico legible ─────────────────────────────────────────────

function renderEmailHtml(profile: ProfileRow, notif: PortalNotificacion, expedienteUrl: string | null): string {
  const nombre = `${profile.nombre ?? ''} ${profile.apellido ?? ''}`.trim() || 'Dr./Dra.'
  const fecha = notif.fecha_emision
    ? new Date(notif.fecha_emision).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })
    : 'fecha no informada'

  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#0f1015;color:#e4e4e7;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#18181b;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:24px;">
        <tr><td>
          <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.1em;color:#a1a1aa;text-transform:uppercase;">MR Abogado · Notificación SAE</p>
          <h1 style="margin:0 0 16px;font-size:20px;color:#fafafa;">Nueva notificación digital</h1>
          <p style="margin:0 0 4px;font-size:14px;color:#d4d4d8;">${escapeHtml(nombre)},</p>
          <p style="margin:0 0 20px;font-size:14px;color:#a1a1aa;">Te llegó una notificación nueva en el portal del SAE Tucumán:</p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f12;border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:16px;margin-bottom:20px;">
            ${notif.titulo ? `<tr><td style="padding-bottom:8px;"><strong style="color:#fafafa;font-size:15px;">${escapeHtml(notif.titulo)}</strong></td></tr>` : ''}
            ${notif.tipo ? `<tr><td style="padding-bottom:4px;font-size:11px;color:#a78bfa;text-transform:uppercase;letter-spacing:0.06em;">${escapeHtml(notif.tipo)}</td></tr>` : ''}
            ${notif.numero_expediente ? `<tr><td style="padding-bottom:4px;font-size:13px;color:#d4d4d8;">Expediente: <span style="font-family:monospace;">${escapeHtml(notif.numero_expediente)}</span></td></tr>` : ''}
            ${notif.caratula ? `<tr><td style="padding-bottom:4px;font-size:12px;color:#a1a1aa;">${escapeHtml(notif.caratula)}</td></tr>` : ''}
            ${notif.oficina ? `<tr><td style="padding-bottom:4px;font-size:12px;color:#a1a1aa;">${escapeHtml(notif.oficina)}</td></tr>` : ''}
            <tr><td style="font-size:11px;color:#71717a;padding-top:6px;">${escapeHtml(fecha)}</td></tr>
          </table>

          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:linear-gradient(135deg,#8b5cf6,#06b6d4);border-radius:8px;">
                <a href="${PORTAL_BASE}/inicializando?module=notificaciones-digitales" style="display:inline-block;padding:10px 18px;font-size:13px;font-weight:600;color:#fafafa;text-decoration:none;">Ver en el portal del SAE</a>
              </td>
              ${expedienteUrl ? `<td style="padding-left:8px;"><a href="${expedienteUrl}" style="display:inline-block;padding:10px 18px;font-size:13px;font-weight:600;color:#d4d4d8;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;text-decoration:none;">Abrir expediente en MR</a></td>` : ''}
            </tr>
          </table>

          <p style="margin:24px 0 0;font-size:11px;color:#71717a;">Este email lo generó el sistema MR Abogado a partir del polling de notificaciones del SAE.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

// ─── HTTP handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Auth: x-cron-secret (sin JWT)
  const cronSecret = Deno.env.get('CRON_SECRET')
  const headerSecret = req.headers.get('x-cron-secret')
  if (!cronSecret || headerSecret !== cronSecret) {
    return json({ error: 'No autorizado' }, 401)
  }

  const body = await req.json().catch(() => ({})) as { dry_run?: boolean; only_profile_id?: string }
  const dryRun = Boolean(body.dry_run)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Filtro de fin de semana: 0=domingo, 6=sábado (UTC-3 AR)
  const arDay = (new Date(Date.now() - 3 * 3600_000)).getUTCDay()
  const isWeekend = arDay === 0 || arDay === 6

  // 1) Traer usuarios con opt-in
  let profilesQuery = admin
    .from('profiles')
    .select('id, email, nombre, apellido, sae_notif_enabled, sae_notif_push, sae_notif_email, sae_notif_email_addresses, sae_notif_push_quiet, sae_notif_weekend')
    .eq('sae_notif_enabled', true)
  if (body.only_profile_id) {
    profilesQuery = profilesQuery.eq('id', body.only_profile_id)
  }
  if (isWeekend) {
    profilesQuery = profilesQuery.eq('sae_notif_weekend', true)
  }
  const { data: profiles, error: profErr } = await profilesQuery
  if (profErr) return json({ error: profErr.message }, 500)

  const stats = {
    profiles_checked: 0,
    profiles_skipped: 0,
    notifs_nuevas: 0,
    push_enviados: 0,
    push_diferidos: 0,
    emails_enviados: 0,
    errores: [] as { profile_id: string; error: string }[],
  }

  for (const p of (profiles ?? []) as ProfileRow[]) {
    stats.profiles_checked++

    // 2) Traer credenciales SAE
    const { data: credRow } = await admin
      .from('sae_credentials')
      .select('username, encrypted_secret, status')
      .eq('profile_id', p.id)
      .maybeSingle()
    const cred = credRow as { username: string; encrypted_secret: string | null; status: string } | null
    if (!cred?.encrypted_secret || cred.status !== 'active') {
      stats.profiles_skipped++
      continue
    }
    const password = atob(cred.encrypted_secret)

    // 3) Login al SAE
    let session: SaeSession
    try {
      session = await authenticateWithSae({ username: cred.username, password })
    } catch (e) {
      const code = e instanceof SaeError ? e.code : 'AUTH_UNKNOWN'
      stats.errores.push({ profile_id: p.id, error: `Login: ${code}` })
      continue
    }

    // 4) Fetch notificaciones del portal
    const portalNotifs = await fetchNotificacionesFromPortal(session)
    if (portalNotifs.length === 0) continue

    // 5) Cargar las ya conocidas para diff
    const ids = portalNotifs.map(n => n.sae_notif_id)
    const { data: existing } = await admin
      .from('sae_notificaciones')
      .select('sae_notif_id')
      .eq('profile_id', p.id)
      .in('sae_notif_id', ids)
    const existingIds = new Set((existing ?? []).map(r => (r as { sae_notif_id: string }).sae_notif_id))
    const nuevas = portalNotifs.filter(n => !existingIds.has(n.sae_notif_id))

    if (nuevas.length === 0) continue

    // 6) Vincular cada nueva con expediente local por numero_sae
    const numerosExp = nuevas.map(n => n.numero_expediente).filter((x): x is string => Boolean(x))
    const expByNumero = new Map<string, string>()
    if (numerosExp.length > 0) {
      const { data: exps } = await admin
        .from('expedientes')
        .select('id, numero_sae')
        .in('numero_sae', numerosExp)
        .eq('created_by', p.id)
      for (const e of (exps ?? []) as { id: string; numero_sae: string | null }[]) {
        if (e.numero_sae) expByNumero.set(e.numero_sae, e.id)
      }
    }

    // 7) Insertar nuevas
    const pushDelay = computePushDelay(p.sae_notif_push_quiet)
    const insertRows = nuevas.map(n => ({
      profile_id: p.id,
      sae_notif_id: n.sae_notif_id,
      expediente_id: n.numero_expediente ? expByNumero.get(n.numero_expediente) ?? null : null,
      numero_expediente: n.numero_expediente,
      caratula: n.caratula,
      oficina: n.oficina,
      tipo: n.tipo,
      titulo: n.titulo,
      fecha_emision: n.fecha_emision,
      push_diferido_hasta: p.sae_notif_push ? pushDelay : null,
      raw_payload: n.raw,
    }))

    if (!dryRun) {
      const { error: insErr } = await admin.from('sae_notificaciones').insert(insertRows)
      if (insErr) {
        stats.errores.push({ profile_id: p.id, error: `Insert: ${insErr.message}` })
        continue
      }
    }
    stats.notifs_nuevas += nuevas.length

    if (dryRun) continue

    // 8) Disparar push + email por cada nueva
    for (const n of nuevas) {
      const expedienteId = n.numero_expediente ? expByNumero.get(n.numero_expediente) : null
      const expedienteUrl = expedienteId ? `https://app.marcorossi.com.ar/expedientes/${expedienteId}` : null

      // Push (si habilitado y no diferido)
      if (p.sae_notif_push && !pushDelay) {
        const ok = await triggerPush(
          p.id,
          `📬 ${n.tipo ?? 'Notificación SAE'}`,
          `${n.numero_expediente ? `Exp. ${n.numero_expediente} · ` : ''}${n.titulo ?? n.caratula ?? 'Nueva notificación'}`,
          expedienteUrl ?? '/notificaciones-sae',
        )
        if (ok) {
          stats.push_enviados++
          await admin.from('sae_notificaciones')
            .update({ notified_push_at: new Date().toISOString() } as never)
            .eq('profile_id', p.id).eq('sae_notif_id', n.sae_notif_id)
        }
      } else if (p.sae_notif_push && pushDelay) {
        stats.push_diferidos++
      }

      // Email — soporta múltiples destinatarios. Si la lista está vacía, fallback al email del perfil.
      if (p.sae_notif_email) {
        const recipients = (p.sae_notif_email_addresses?.length
          ? p.sae_notif_email_addresses
          : [p.email].filter((x): x is string => Boolean(x))
        ).map(s => s.trim()).filter(Boolean)
        if (recipients.length > 0) {
          const html = renderEmailHtml(p, n, expedienteUrl)
          const subject = `📬 ${n.tipo ?? 'Notificación SAE'}${n.numero_expediente ? ` · Exp. ${n.numero_expediente}` : ''}`
          const result = await sendEmail({ to: recipients, subject, html, tags: [{ name: 'tipo', value: 'sae_notif' }] })
          if (result.ok) {
            stats.emails_enviados += recipients.length
            await admin.from('sae_notificaciones')
              .update({ notified_email_at: new Date().toISOString() } as never)
              .eq('profile_id', p.id).eq('sae_notif_id', n.sae_notif_id)
          } else {
            stats.errores.push({ profile_id: p.id, error: `Email: ${result.error}` })
          }
        }
      }
    }
  }

  // 9) Procesar push diferidos vencidos (los que pasaron la quiet hour)
  if (!dryRun) {
    const { data: pendientes } = await admin
      .from('sae_notificaciones')
      .select('id, profile_id, sae_notif_id, tipo, titulo, caratula, numero_expediente, expediente_id, push_diferido_hasta')
      .is('notified_push_at', null)
      .not('push_diferido_hasta', 'is', null)
      .lte('push_diferido_hasta', new Date().toISOString())
      .limit(200)

    for (const n of (pendientes ?? []) as {
      id: string; profile_id: string; sae_notif_id: string;
      tipo: string | null; titulo: string | null; caratula: string | null;
      numero_expediente: string | null; expediente_id: string | null
    }[]) {
      const url = n.expediente_id ? `https://app.marcorossi.com.ar/expedientes/${n.expediente_id}` : '/notificaciones-sae'
      const ok = await triggerPush(
        n.profile_id,
        `📬 ${n.tipo ?? 'Notificación SAE'}`,
        `${n.numero_expediente ? `Exp. ${n.numero_expediente} · ` : ''}${n.titulo ?? n.caratula ?? 'Notificación pendiente'}`,
        url,
      )
      if (ok) {
        stats.push_enviados++
        await admin.from('sae_notificaciones')
          .update({ notified_push_at: new Date().toISOString() } as never)
          .eq('id', n.id)
      }
    }
  }

  return json({ ok: true, dry_run: dryRun, ...stats })
})

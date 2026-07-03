// ---------------------------------------------------------------------------
// send-reminders — invocada por pg_cron diariamente.
//
// Busca tareas/audiencias/plazos IA por vencer y manda push notifications a
// los owners. No requiere JWT del usuario (verify_jwt = false). Se autentica
// vía header X-Cron-Secret comparado contra CRON_SECRET en env.
//
// Body opcional: { dry_run?: boolean }
// ---------------------------------------------------------------------------

import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

interface PushPayload {
  title: string
  body: string
  url: string
  tag?: string
}

interface PushSubscription {
  endpoint: string
  p256dh_key: string
  auth_key: string
  user_id: string
}

// "Mañana" según hora Argentina (UTC-3). El cron corre a las 11:00 UTC = 8 AM AR.
function getTomorrowDateAR(): string {
  const now = new Date()
  // Sumamos 24h y nos quedamos con la fecha en AR
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  // Trick: convertir a string ISO en zona AR aproximada (-3h)
  const ar = new Date(tomorrow.getTime() - 3 * 60 * 60 * 1000)
  return ar.toISOString().slice(0, 10)
}

function getTodayDateAR(): string {
  const now = new Date()
  const ar = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  return ar.toISOString().slice(0, 10)
}

function inDays(days: number): string {
  const target = new Date(Date.now() + days * 24 * 60 * 60 * 1000 - 3 * 60 * 60 * 1000)
  return target.toISOString().slice(0, 10)
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

interface Reminder {
  user_id: string
  kind: 'tarea' | 'turno' | 'plazo' | 'contenido' | 'caja'
  title: string
  url: string
  itemId: string
  itemTable?: 'tareas' | 'audiencias'
}

const MESES_NOM = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const fmtMonto = (n: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(n))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  try {
    // ── Auth ────────────────────────────────────────────────────────────
    const cronSecret = Deno.env.get('CRON_SECRET')
    if (!cronSecret) return json(req, { error: 'CRON_SECRET no configurado' }, 500)

    const auth = req.headers.get('x-cron-secret') ?? ''
    if (auth !== cronSecret) return json(req, { error: 'No autorizado' }, 401)

    const body = await req.json().catch(() => ({})) as { dry_run?: boolean }
    const dryRun = body?.dry_run === true

    // VAPID solo es necesario para enviar real (no para dry-run)
    if (!dryRun) {
      const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
      const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
      const subject = Deno.env.get('VAPID_SUBJECT')
      if (!publicKey || !privateKey || !subject) {
        return json(req, { error: 'VAPID no configurado' }, 500)
      }
      webpush.setVapidDetails(subject, publicKey, privateKey)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceRoleKey)

    const tomorrow = getTomorrowDateAR()
    const today = getTodayDateAR()
    const in3days = inDays(3)
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const reminders: Reminder[] = []

    // ── Tareas que vencen mañana ────────────────────────────────────────
    const { data: tareas } = await admin
      .from('tareas')
      .select('id, titulo, expediente_id, asignado_a, last_reminder_at, estado')
      .eq('fecha_vencimiento', tomorrow)
      .neq('estado', 'COMPLETADA')
      .or(`last_reminder_at.is.null,last_reminder_at.lt.${last24h}`)

    for (const t of (tareas ?? []) as { id: string; titulo: string; expediente_id: string; asignado_a: string | null; last_reminder_at: string | null }[]) {
      if (!t.asignado_a) continue
      reminders.push({
        user_id: t.asignado_a,
        kind: 'tarea',
        title: t.titulo,
        url: `/expedientes/${t.expediente_id}`,
        itemId: t.id,
        itemTable: 'tareas',
      })
    }

    // ── Audiencias mañana ──────────────────────────────────────────────
    const { data: audiencias } = await admin
      .from('audiencias')
      .select('id, fecha, hora, expediente_id, created_by, last_reminder_at, estado')
      .eq('fecha', tomorrow)
      .not('estado', 'in', '(CANCELADA,POSTERGADA,REALIZADA)')
      .or(`last_reminder_at.is.null,last_reminder_at.lt.${last24h}`)

    for (const a of (audiencias ?? []) as { id: string; fecha: string; hora: string | null; expediente_id: string; created_by: string; last_reminder_at: string | null }[]) {
      reminders.push({
        user_id: a.created_by,
        kind: 'turno',
        title: `Audiencia mañana${a.hora ? ` a las ${a.hora.slice(0, 5)}` : ''}`,
        url: `/expedientes/${a.expediente_id}`,
        itemId: a.id,
        itemTable: 'audiencias',
      })
    }

    // ── Plazos IA por vencer en próximos 3 días ────────────────────────
    // Filtramos en memoria porque vence_aprox vive dentro del jsonb ai_extracted
    const { data: movsConPlazos } = await admin
      .from('sae_movements')
      .select('id, expediente_id, ai_extracted, expedientes!inner(created_by)')
      .not('ai_extracted', 'is', null)

    for (const m of (movsConPlazos ?? []) as { id: string; expediente_id: string; ai_extracted: { plazos?: { vence_aprox: string | null; descripcion: string }[] } | null; expedientes: { created_by: string } | { created_by: string }[] }[]) {
      const exp = Array.isArray(m.expedientes) ? m.expedientes[0] : m.expedientes
      if (!exp?.created_by) continue
      const plazos = m.ai_extracted?.plazos ?? []
      for (const p of plazos) {
        if (!p.vence_aprox) continue
        if (p.vence_aprox < today || p.vence_aprox > in3days) continue
        reminders.push({
          user_id: exp.created_by,
          kind: 'plazo',
          title: p.descripcion || `Plazo vence ${p.vence_aprox}`,
          url: `/expedientes/${m.expediente_id}`,
          itemId: m.id,
        })
      }
    }

    // ── Contenidos a publicar hoy o mañana ─────────────────────────────
    // Avisa a la(s) secretaria(s) y al creador, con una alerta in-app (CUSTOM)
    // y push. Dedupe de la alerta por marcador [contenido:<id>].
    const { data: contenidosDue } = await admin
      .from('contenidos')
      .select('id, titulo, publicar_el, created_by, estado')
      .in('publicar_el', [today, tomorrow])
      .is('deleted_at', null)
      .not('estado', 'in', '(publicado,archivado)')

    if (contenidosDue && contenidosDue.length > 0) {
      const { data: secres } = await admin
        .from('profiles').select('id').eq('rol', 'SECRETARIA').eq('activo', true)
      const secreIds = (secres ?? []).map((s: { id: string }) => s.id)

      for (const c of contenidosDue as { id: string; titulo: string; publicar_el: string; created_by: string }[]) {
        const cuando = c.publicar_el === today ? 'hoy' : 'mañana'
        const recipients = new Set<string>([...secreIds, c.created_by].filter(Boolean))
        for (const uid of recipients) {
          if (!dryRun) {
            const { data: existing } = await admin
              .from('alertas').select('id')
              .eq('destinatario_id', uid).eq('estado', 'ACTIVA')
              .ilike('mensaje', `%[contenido:${c.id}]%`).limit(1).maybeSingle()
            if (!existing) {
              await admin.from('alertas').insert({
                tipo: 'CUSTOM',
                titulo: `Contenido para publicar ${cuando}: ${c.titulo}`,
                mensaje: `El contenido "${c.titulo}" está agendado para publicar ${cuando}. [contenido:${c.id}]`,
                destinatario_id: uid,
                prioridad: 'MEDIA',
                origen: 'AUTOMATICA',
                fecha_vencimiento: c.publicar_el,
              })
            }
          }
          reminders.push({ user_id: uid, kind: 'contenido', title: `Publicar ${cuando}: ${c.titulo}`, url: '/contenidos', itemId: c.id })
        }
      }
    }

    // ── Caja: pagos pendientes (lunes) + resumen mensual (día 1) ───────
    // Va a la gente de caja: quienes tienen el flag o son DIRECTOR.
    const { data: cajaPeople } = await admin
      .from('profiles').select('id')
      .or('tiene_acceso_caja.eq.true,rol.eq.DIRECTOR').eq('activo', true)
    const cajaIds = (cajaPeople ?? []).map((p: { id: string }) => p.id)

    if (cajaIds.length > 0) {
      const nowAr = new Date(Date.now() - 3 * 60 * 60 * 1000)
      const dom = nowAr.getUTCDate()
      const dow = nowAr.getUTCDay() // 0=domingo, 1=lunes
      const Y = nowAr.getUTCFullYear()
      const Mn = nowAr.getUTCMonth() + 1
      const cajaMsgs: { title: string; body: string; dedupe: string }[] = []

      // Resumen del mes anterior, el día 1.
      if (dom === 1) {
        const py = Mn === 1 ? Y - 1 : Y
        const pm = Mn === 1 ? 12 : Mn - 1
        const ini = `${py}-${String(pm).padStart(2, '0')}-01`
        const fin = `${Y}-${String(Mn).padStart(2, '0')}-01`
        const [ing, gas] = await Promise.all([
          admin.from('ingresos').select('monto, moneda').gte('fecha', ini).lt('fecha', fin).is('deleted_at', null),
          admin.from('gastos').select('monto, moneda').gte('fecha', ini).lt('fecha', fin).is('deleted_at', null),
        ])
        const sumArs = (rows: { monto: number; moneda: string }[] | null) =>
          (rows ?? []).filter((r) => r.moneda === 'ARS').reduce((s, r) => s + Number(r.monto), 0)
        const ti = sumArs(ing.data), tg = sumArs(gas.data), bal = ti - tg
        cajaMsgs.push({
          title: `Resumen de caja — ${MESES_NOM[pm - 1]}`,
          body: `Ingresos $${fmtMonto(ti)} · Gastos $${fmtMonto(tg)} · Balance $${fmtMonto(bal)}`,
          dedupe: `caja-resumen-${py}-${pm}`,
        })
      }

      // Abonos sin cobrar este mes, los lunes.
      if (dow === 1) {
        const [abonos, ingPeriodo] = await Promise.all([
          admin.from('clientes_abono_mensual').select('id, monto').eq('activo', true),
          admin.from('ingresos').select('abono_id').eq('periodo_year', Y).eq('periodo_month', Mn).not('abono_id', 'is', null).is('deleted_at', null),
        ])
        const cobrados = new Set((ingPeriodo.data ?? []).map((i: { abono_id: string }) => i.abono_id))
        const pend = (abonos.data ?? []).filter((a: { id: string }) => !cobrados.has(a.id))
        if (pend.length > 0) {
          const total = pend.reduce((s: number, a: { monto: number }) => s + Number(a.monto), 0)
          cajaMsgs.push({
            title: `${pend.length} abono${pend.length !== 1 ? 's' : ''} sin cobrar`,
            body: `Quedan $${fmtMonto(total)} por cobrar este mes. Revisá la caja.`,
            dedupe: `caja-pendientes-${Y}-${Mn}-s${Math.ceil(dom / 7)}`,
          })
        }
      }

      for (const m of cajaMsgs) {
        for (const uid of cajaIds) {
          if (!dryRun) {
            const { data: ex } = await admin.from('alertas').select('id')
              .eq('destinatario_id', uid).eq('estado', 'ACTIVA')
              .ilike('mensaje', `%[${m.dedupe}]%`).limit(1).maybeSingle()
            if (!ex) {
              await admin.from('alertas').insert({
                tipo: 'CUSTOM', titulo: m.title, mensaje: `${m.body} [${m.dedupe}]`,
                destinatario_id: uid, prioridad: 'MEDIA', origen: 'AUTOMATICA',
              })
            }
          }
          reminders.push({ user_id: uid, kind: 'caja', title: m.title, url: '/caja', itemId: m.dedupe })
        }
      }
    }

    if (reminders.length === 0) {
      return json(req, { ok: true, reminders: 0, sent: 0, dryRun })
    }

    // ── Agrupar por user_id ─────────────────────────────────────────────
    const byUser = new Map<string, Reminder[]>()
    for (const r of reminders) {
      const arr = byUser.get(r.user_id)
      if (arr) arr.push(r)
      else byUser.set(r.user_id, [r])
    }

    if (dryRun) {
      return json(req, {
        ok: true,
        dryRun: true,
        reminders: reminders.length,
        users: byUser.size,
        breakdown: [...byUser.entries()].map(([uid, rs]) => ({ user_id: uid, count: rs.length, items: rs })),
      })
    }

    // ── Enviar push por usuario ─────────────────────────────────────────
    let sent = 0
    const removedEndpoints: string[] = []

    for (const [userId, userReminders] of byUser) {
      const { data: subs } = await admin
        .from('push_subscriptions')
        .select('endpoint, p256dh_key, auth_key, user_id')
        .eq('user_id', userId)

      if (!subs || subs.length === 0) continue

      const tareas = userReminders.filter(r => r.kind === 'tarea').length
      const turnos = userReminders.filter(r => r.kind === 'turno').length
      const plazos = userReminders.filter(r => r.kind === 'plazo').length
      const contenidosN = userReminders.filter(r => r.kind === 'contenido').length
      const cajaN = userReminders.filter(r => r.kind === 'caja').length

      const parts: string[] = []
      if (tareas > 0) parts.push(`${tareas} tarea${tareas !== 1 ? 's' : ''}`)
      if (turnos > 0) parts.push(`${turnos} audiencia${turnos !== 1 ? 's' : ''}`)
      if (plazos > 0) parts.push(`${plazos} plazo${plazos !== 1 ? 's' : ''}`)
      if (contenidosN > 0) parts.push(`${contenidosN} contenido${contenidosN !== 1 ? 's' : ''}`)
      if (cajaN > 0) parts.push(`${cajaN} de caja`)

      const payload: PushPayload = {
        title: userReminders.length === 1
          ? userReminders[0].title
          : `Tenés ${parts.join(' · ')} para esta semana`,
        body: userReminders.length === 1
          ? userReminders[0].title
          : userReminders.slice(0, 3).map(r => `• ${r.title}`).join('\n'),
        url: userReminders.length === 1 ? userReminders[0].url : '/dashboard',
        tag: 'daily-reminders',
      }

      const payloadStr = JSON.stringify(payload)

      await Promise.all((subs as PushSubscription[]).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh_key, auth: s.auth_key } },
            payloadStr,
          )
          sent++
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode
          if (statusCode === 404 || statusCode === 410) removedEndpoints.push(s.endpoint)
          else console.error('[send-reminders] push error', statusCode, err)
        }
      }))

      // Marcar last_reminder_at para no spamear las próximas 24h
      const tareaIds = userReminders.filter(r => r.itemTable === 'tareas').map(r => r.itemId)
      const audienciaIds = userReminders.filter(r => r.itemTable === 'audiencias').map(r => r.itemId)
      if (tareaIds.length > 0) {
        await admin.from('tareas').update({ last_reminder_at: new Date().toISOString() }).in('id', tareaIds)
      }
      if (audienciaIds.length > 0) {
        await admin.from('audiencias').update({ last_reminder_at: new Date().toISOString() }).in('id', audienciaIds)
      }
    }

    if (removedEndpoints.length > 0) {
      await admin.from('push_subscriptions').delete().in('endpoint', removedEndpoints)
    }

    return json(req, {
      ok: true,
      reminders: reminders.length,
      users: byUser.size,
      sent,
      removed: removedEndpoints.length,
    })
  } catch (err) {
    console.error('[send-reminders]', err)
    return json(req, { error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

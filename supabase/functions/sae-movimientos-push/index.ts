// Cron: 30 9 * * * (09:30 UTC = 06:30 Argentina, UTC-3 fijo)
// Mejoras:
//   1. Un solo push por usuario (digest) en vez de uno por expediente
//   2. Ordena por urgencia: sentencia/embargo/intimacion primero
//   3. Notifica al abogado responsable + todos los miembros activos del expediente

import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

// 1 = más urgente, mayor número = menos urgente
const PRIORIDAD: Record<string, number> = {
  sentencia: 1, embargo: 1, intimacion: 1,
  traslado: 2, cedula: 2, audiencia: 2,
  prueba: 3, oficio: 3,
  decreto: 4, informe: 4, planilla: 4, escrito_parte: 4, otro: 4,
}

function prio(tipo: string): number {
  return PRIORIDAD[tipo] ?? 4
}

const TIPO_LABEL: Record<string, string> = {
  sentencia: 'Sentencia', embargo: 'Embargo', intimacion: 'Intimación',
  traslado: 'Traslado', cedula: 'Cédula', audiencia: 'Audiencia',
  prueba: 'Prueba', oficio: 'Oficio',
  decreto: 'Decreto', informe: 'Informe', planilla: 'Planilla',
  escrito_parte: 'Escrito', otro: 'Otro',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  try {
    const cronSecret = Deno.env.get('CRON_SECRET')
    if (!cronSecret) return json(req, { error: 'CRON_SECRET no configurado' }, 500)
    if ((req.headers.get('x-cron-secret') ?? '') !== cronSecret) {
      return json(req, { error: 'No autorizado' }, 401)
    }

    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? Deno.env.get('VITE_VAPID_PUBLIC_KEY')
    const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
    const subject = Deno.env.get('VAPID_SUBJECT')
    if (!publicKey || !privateKey || !subject) {
      return json(req, { error: 'VAPID no configurado' }, 500)
    }
    webpush.setVapidDetails(subject, publicKey, privateKey)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    // ── Movimientos de las últimas 24h ────────────────────────────────────────
    type MovRow = {
      expediente_id: string
      titulo: string
      tipo_movimiento: string
      expedientes: {
        caratula: string | null
        numero: string | null
        abogado_responsable_id: string | null
        deleted_at: string | null
      } | null
    }

    const { data: movements, error: movErr } = await admin
      .from('sae_movements')
      .select(`
        expediente_id, titulo, tipo_movimiento,
        expedientes!inner(caratula, numero, abogado_responsable_id, deleted_at)
      `)
      .gte('created_at', since)
      .order('expediente_id')

    if (movErr) return json(req, { error: movErr.message }, 500)
    if (!movements?.length) {
      return json(req, { ok: true, movimientos: 0, usuarios: 0, pushSent: 0 })
    }

    // ── Agrupar por expediente ────────────────────────────────────────────────
    type ExpEntry = {
      caratula: string
      responsableId: string | null
      movs: { titulo: string; tipo: string }[]
      topPrio: number
    }
    const byExp = new Map<string, ExpEntry>()

    for (const m of movements as MovRow[]) {
      const exp = m.expedientes
      if (!exp || exp.deleted_at) continue
      const entry = byExp.get(m.expediente_id)
      const mov = { titulo: m.titulo, tipo: m.tipo_movimiento }
      if (entry) {
        entry.movs.push(mov)
        entry.topPrio = Math.min(entry.topPrio, prio(m.tipo_movimiento))
      } else {
        byExp.set(m.expediente_id, {
          caratula: exp.caratula ?? exp.numero ?? 'Expediente',
          responsableId: exp.abogado_responsable_id,
          movs: [mov],
          topPrio: prio(m.tipo_movimiento),
        })
      }
    }

    if (!byExp.size) {
      return json(req, { ok: true, movimientos: movements.length, usuarios: 0, pushSent: 0 })
    }

    // ── Miembros activos de cada expediente (mejora 3) ────────────────────────
    const expIds = [...byExp.keys()]
    const { data: membros } = await admin
      .from('expediente_miembros')
      .select('expediente_id, profile_id')
      .in('expediente_id', expIds)
      .eq('activo', true)

    // ── Construir mapa usuario → expedientes (mejora 1 + 3) ──────────────────
    type UserEntry = { expId: string; caratula: string; movs: { titulo: string; tipo: string }[]; topPrio: number }[]
    const byUser = new Map<string, UserEntry>()

    function addToUser(uid: string, expId: string, entry: ExpEntry) {
      const list = byUser.get(uid) ?? []
      if (!list.find((e) => e.expId === expId)) {
        list.push({ expId, caratula: entry.caratula, movs: entry.movs, topPrio: entry.topPrio })
        byUser.set(uid, list)
      }
    }

    for (const [expId, entry] of byExp) {
      if (entry.responsableId) addToUser(entry.responsableId, expId, entry)
    }
    for (const m of (membros ?? [])) {
      const entry = byExp.get(m.expediente_id)
      if (entry) addToUser(m.profile_id, m.expediente_id, entry)
    }

    // ── Supervisores: ADMIN y DIRECTOR reciben todos los expedientes ──────────
    const { data: supervisores } = await admin
      .from('profiles')
      .select('id')
      .in('rol', ['ADMIN', 'DIRECTOR'])
      .eq('activo', true)

    for (const sup of (supervisores ?? [])) {
      for (const [expId, entry] of byExp) {
        addToUser(sup.id, expId, entry)
      }
    }

    if (!byUser.size) {
      return json(req, { ok: true, movimientos: movements.length, usuarios: 0, pushSent: 0 })
    }

    // ── Suscripciones push ────────────────────────────────────────────────────
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('user_id, endpoint, p256dh_key, auth_key')
      .in('user_id', [...byUser.keys()])

    if (!subs?.length) {
      return json(req, { ok: true, movimientos: movements.length, usuarios: byUser.size, pushSent: 0 })
    }

    const subsByUser = new Map<string, typeof subs>()
    for (const s of subs) {
      const list = subsByUser.get(s.user_id) ?? []
      list.push(s)
      subsByUser.set(s.user_id, list)
    }

    const toRemove: string[] = []
    let pushSent = 0

    // ── Un push por usuario (mejoras 1 + 2) ──────────────────────────────────
    for (const [uid, exps] of byUser) {
      const userSubs = subsByUser.get(uid)
      if (!userSubs?.length) continue

      // Ordenar expedientes por urgencia (mejora 2)
      const sorted = [...exps].sort((a, b) => a.topPrio - b.topPrio)

      const totalMovs = sorted.reduce((s, e) => s + e.movs.length, 0)
      const nExps = sorted.length

      // Título del push
      const title = nExps === 1
        ? `${totalMovs} movimiento${totalMovs > 1 ? 's' : ''} SAE — ${sorted[0].caratula.slice(0, 50)}`
        : `${totalMovs} movimientos SAE en ${nExps} expedientes`

      // Cuerpo: listar expedientes ordenados por urgencia, marcando los urgentes
      const bodyLines = sorted.slice(0, 6).map((e) => {
        const urgente = e.topPrio === 1
        const topMov = [...e.movs].sort((a, b) => prio(a.tipo) - prio(b.tipo))[0]
        const tipoLabel = TIPO_LABEL[topMov.tipo] ?? topMov.tipo
        const prefix = urgente ? '⚠ ' : '· '
        const extra = e.movs.length > 1 ? ` (+${e.movs.length - 1})` : ''
        return `${prefix}${tipoLabel}: ${e.caratula.slice(0, 45)}${extra}`
      })
      if (sorted.length > 6) bodyLines.push(`… y ${sorted.length - 6} expedientes más`)

      // URL: expediente directo si es uno solo, notificaciones SAE si son varios
      const url = nExps === 1 ? `/expedientes/${sorted[0].expId}` : '/notificaciones-sae'

      const payload = JSON.stringify({
        title,
        body: bodyLines.join('\n'),
        url,
        tag: 'sae-movimientos-diarios',
      })

      for (const s of userSubs) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh_key, auth: s.auth_key } },
            payload,
          )
          pushSent++
        } catch (err: unknown) {
          const code = (err as { statusCode?: number })?.statusCode
          if (code === 404 || code === 410) toRemove.push(s.endpoint)
        }
      }
    }

    if (toRemove.length) {
      await admin.from('push_subscriptions').delete().in('endpoint', toRemove)
    }

    console.log(`[sae-movimientos-push] ${movements.length} movs, ${byUser.size} usuarios, ${pushSent} push enviados`)

    // Notificación Telegram a Marco — informe por notificación SAE con resumen IA
    const marcoChat = Number(Deno.env.get('TELEGRAM_MARCO_CHAT_ID'))
    const tgToken = Deno.env.get('TELEGRAM_ESCRITO_BOT_TOKEN')
    if (marcoChat && tgToken && expIds.length > 0) {
      type SaeNotif = {
        titulo: string | null
        ia_resumen: string | null
        prioridad: string | null
        fecha_emision: string | null
        expediente_id: string | null
        raw_payload: { ver_url?: string } | null
        expediente: { caratula: string | null; numero: string | null } | null
      }
      const { data: saeNotifs } = await admin
        .from('sae_notificaciones')
        .select('titulo, ia_resumen, prioridad, fecha_emision, expediente_id, raw_payload, expediente:expedientes(caratula, numero)')
        .in('expediente_id', expIds)
        .gte('fecha_captura', since)
        .order('fecha_emision', { ascending: false })
        .limit(30)

      if (saeNotifs?.length) {
        const esc = (s: string | null | undefined) =>
          (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

        const PRIO_ORDER_TG: Record<string, number> = { urgente: 0, normal: 1, info: 2 }
        const notifsSorted = [...(saeNotifs as SaeNotif[])].sort(
          (a, b) =>
            (PRIO_ORDER_TG[a.prioridad ?? 'normal'] ?? 1) -
            (PRIO_ORDER_TG[b.prioridad ?? 'normal'] ?? 1),
        )

        const fechaHoy = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        const header = `<b>SAE — ${notifsSorted.length} notificación${notifsSorted.length > 1 ? 'es' : ''} · ${fechaHoy}</b>`

        const APP = 'https://app.marcorossi.com.ar'
        const blocks = notifsSorted.map(n => {
          const badge =
            n.prioridad === 'urgente' ? '⚠️' :
            n.prioridad === 'info'    ? 'ℹ️' : '▸'
          const exp = n.expediente?.caratula ?? n.expediente?.numero ?? ''
          const fecha = n.fecha_emision ? n.fecha_emision.slice(0, 10) : ''
          const titulo = esc(n.titulo ?? 'Sin título').toUpperCase()
          const resumen = n.ia_resumen ? `\n<i>${esc(n.ia_resumen)}</i>` : ''
          const meta = [fecha, exp ? esc(exp) : ''].filter(Boolean).join(' · ')
          const verUrl = n.raw_payload?.ver_url
          const appUrl = n.expediente_id ? `${APP}/expedientes/${n.expediente_id}` : `${APP}/notificaciones-sae`
          const linkParts: string[] = []
          if (verUrl) linkParts.push(`<a href="${verUrl}">Ver en SAE</a>`)
          linkParts.push(`<a href="${appUrl}">Ver en app</a>`)
          return `${badge} <b>${titulo}</b>\n${meta}${resumen}\n${linkParts.join('  ·  ')}`
        })

        // Telegram: máx 4096 chars por mensaje — partir en chunks si hace falta
        const chunks: string[] = []
        let current = header
        for (const block of blocks) {
          const sep = current === header ? '\n\n' : '\n\n'
          if (current.length + sep.length + block.length > 4000) {
            chunks.push(current.trimEnd())
            current = block
          } else {
            current += sep + block
          }
        }
        if (current.trim()) chunks.push(current.trimEnd())

        for (const chunk of chunks) {
          await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: marcoChat, text: chunk, parse_mode: 'HTML', disable_web_page_preview: true }),
          }).catch(e => console.warn('[sae-push] telegram error:', e))
        }
      }
    }

    return json(req, {
      ok: true,
      movimientos: movements.length,
      expedientes: byExp.size,
      usuarios: byUser.size,
      pushSent,
      removed: toRemove.length,
    })
  } catch (err) {
    return json(req, { error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

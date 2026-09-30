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

      // URL: expediente directo si es uno solo, inicio si son varios
      const url = nExps === 1 ? `/expedientes/${sorted[0].expId}` : '/hoy'

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

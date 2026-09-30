// Cron: 30 9 * * * (09:30 UTC = 06:30 Argentina, UTC-3 fijo)
// Envía un push por expediente al abogado responsable con los movimientos
// SAE importados en las últimas 24 horas.

import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
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

    // Movimientos SAE de las últimas 24 h con expediente y abogado responsable
    const { data: movements, error: movErr } = await admin
      .from('sae_movements')
      .select(`
        id, titulo, tipo_movimiento,
        expediente_id,
        expedientes!inner(caratula, numero, abogado_responsable_id, deleted_at)
      `)
      .gte('created_at', since)
      .order('expediente_id')

    if (movErr) return json(req, { error: movErr.message }, 500)
    if (!movements?.length) {
      return json(req, { ok: true, movimientos: 0, expedientes: 0, pushSent: 0 })
    }

    // Agrupar por expediente, filtrar los eliminados
    type MovRow = {
      id: string
      titulo: string
      tipo_movimiento: string
      expediente_id: string
      expedientes: {
        caratula: string | null
        numero: string | null
        abogado_responsable_id: string | null
        deleted_at: string | null
      } | null
    }

    const byExp = new Map<string, { caratula: string; responsableId: string; titulos: string[] }>()

    for (const m of movements as MovRow[]) {
      const exp = m.expedientes
      if (!exp || exp.deleted_at || !exp.abogado_responsable_id) continue
      const entry = byExp.get(m.expediente_id)
      if (entry) {
        entry.titulos.push(m.titulo)
      } else {
        byExp.set(m.expediente_id, {
          caratula: exp.caratula ?? exp.numero ?? 'Expediente',
          responsableId: exp.abogado_responsable_id,
          titulos: [m.titulo],
        })
      }
    }

    if (!byExp.size) {
      return json(req, { ok: true, movimientos: movements.length, expedientes: 0, pushSent: 0, message: 'Ningún expediente tiene abogado responsable asignado' })
    }

    // Obtener suscripciones push de todos los responsables involucrados
    const responsableIds = [...new Set([...byExp.values()].map((e) => e.responsableId))]
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('user_id, endpoint, p256dh_key, auth_key')
      .in('user_id', responsableIds)

    if (!subs?.length) {
      return json(req, { ok: true, movimientos: movements.length, expedientes: byExp.size, pushSent: 0, message: 'Sin suscripciones push activas' })
    }

    const subsByUser = new Map<string, typeof subs>()
    for (const s of subs) {
      const list = subsByUser.get(s.user_id) ?? []
      list.push(s)
      subsByUser.set(s.user_id, list)
    }

    const toRemove: string[] = []
    let pushSent = 0

    for (const [expId, { caratula, responsableId, titulos }] of byExp) {
      const userSubs = subsByUser.get(responsableId)
      if (!userSubs?.length) continue

      const n = titulos.length
      const title = n === 1
        ? `Movimiento SAE — ${caratula.slice(0, 55)}`
        : `${n} movimientos SAE — ${caratula.slice(0, 50)}`
      const body = titulos.slice(0, 5).join('\n') + (n > 5 ? `\n… y ${n - 5} más` : '')

      const payload = JSON.stringify({
        title,
        body,
        url: `/expedientes/${expId}`,
        tag: `sae-mov-${expId}`,
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

    console.log(`[sae-movimientos-push] ${movements.length} movs, ${byExp.size} expedientes, ${pushSent} push enviados`)

    return json(req, {
      ok: true,
      movimientos: movements.length,
      expedientes: byExp.size,
      pushSent,
      removed: toRemove.length,
    })
  } catch (err) {
    return json(req, { error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

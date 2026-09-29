// Cron: 0 10 * * * (10:00 UTC = 07:00 Argentina, UTC-3 fijo sin DST)
// Envía push notification con las audiencias del día a cada abogado/asistente asignado.

import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

function getTodayAR(): string {
  const ar = new Date(Date.now() - 3 * 60 * 60 * 1000)
  return ar.toISOString().slice(0, 10)
}

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
    const auth = req.headers.get('x-cron-secret') ?? ''
    if (auth !== cronSecret) return json(req, { error: 'No autorizado' }, 401)

    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? Deno.env.get('VITE_VAPID_PUBLIC_KEY')
    const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
    const subject = Deno.env.get('VAPID_SUBJECT')
    if (!publicKey || !privateKey || !subject) {
      return json(req, { error: 'VAPID no configurado en secrets' }, 500)
    }
    webpush.setVapidDetails(subject, publicKey, privateKey)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const hoy = getTodayAR()

    // Audiencias de hoy con datos del expediente y asignados
    const { data: audiencias, error: audErr } = await admin
      .from('audiencias')
      .select(`
        id, hora,
        expedientes(caratula, numero, abogado_responsable_id),
        catalogo_tipos_audiencia(nombre),
        organismos(nombre),
        audiencia_asignados(profile_id),
        profesional_asistente_id
      `)
      .eq('fecha', hoy)
      .in('estado', ['PENDIENTE', 'CONFIRMADA'])
      .order('hora')

    if (audErr) return json(req, { error: audErr.message }, 500)
    if (!audiencias?.length) {
      return json(req, { ok: true, hoy, audiencias: 0, usuarios: 0, message: 'Sin audiencias hoy' })
    }

    // Construir mapa userId → lista de items de audiencia para notificar
    type Item = { hora: string | null; caratula: string; tipo: string | null }
    const byUser = new Map<string, Item[]>()

    function add(uid: string, item: Item) {
      const list = byUser.get(uid) ?? []
      list.push(item)
      byUser.set(uid, list)
    }

    for (const a of (audiencias as any[])) {
      const item: Item = {
        hora: a.hora ? String(a.hora).slice(0, 5) : null,
        caratula: a.expedientes?.caratula ?? a.expedientes?.numero ?? 'Expediente',
        tipo: a.catalogo_tipos_audiencia?.nombre ?? null,
      }
      const seen = new Set<string>()

      // Asignados explícitos tienen prioridad
      for (const asig of (a.audiencia_asignados ?? [])) {
        if (!seen.has(asig.profile_id)) {
          seen.add(asig.profile_id)
          add(asig.profile_id, item)
        }
      }
      // Profesional asistente indicado en la audiencia
      if (a.profesional_asistente_id && !seen.has(a.profesional_asistente_id)) {
        seen.add(a.profesional_asistente_id)
        add(a.profesional_asistente_id, item)
      }
      // Si nadie asignado, notificar al responsable del expediente como fallback
      if (seen.size === 0 && a.expedientes?.abogado_responsable_id) {
        add(a.expedientes.abogado_responsable_id, item)
      }
    }

    if (!byUser.size) {
      return json(req, { ok: true, hoy, audiencias: audiencias.length, usuarios: 0, message: 'Sin usuarios asignados a las audiencias de hoy' })
    }

    // Obtener suscripciones push activas
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('user_id, endpoint, p256dh_key, auth_key')
      .in('user_id', [...byUser.keys()])

    if (!subs?.length) {
      return json(req, { ok: true, hoy, audiencias: audiencias.length, usuarios: byUser.size, pushSent: 0, message: 'Sin suscripciones push activas' })
    }

    const subsByUser = new Map<string, typeof subs>()
    for (const s of subs) {
      const list = subsByUser.get(s.user_id) ?? []
      list.push(s)
      subsByUser.set(s.user_id, list)
    }

    const toRemove: string[] = []
    let pushSent = 0

    for (const [uid, items] of byUser) {
      const userSubs = subsByUser.get(uid)
      if (!userSubs?.length) continue

      const count = items.length
      const title = count === 1
        ? `Audiencia hoy — ${items[0].caratula.slice(0, 55)}`
        : `${count} audiencias hoy`
      const body = items
        .map(i => `${i.hora ?? '—'}  ${i.caratula.slice(0, 50)}${i.tipo ? ` (${i.tipo})` : ''}`)
        .join('\n')

      const payload = JSON.stringify({ title, body, url: '/agenda', tag: 'audiencias-diarias' })

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
      console.log(`[audiencias-daily-push] purged ${toRemove.length} expired subs`)
    }

    console.log(`[audiencias-daily-push] ${hoy}: ${audiencias.length} audiencias, ${byUser.size} usuarios, ${pushSent} push enviados`)

    return json(req, {
      ok: true,
      hoy,
      audiencias: audiencias.length,
      usuarios: byUser.size,
      pushSent,
      removed: toRemove.length,
    })
  } catch (err) {
    return json(req, { error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

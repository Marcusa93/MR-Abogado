// Cron diario-hoy:    0 10 * * * (10:00 UTC = 07:00 Argentina)  → body {}
// Cron diario-mañana: 0 21 * * * (21:00 UTC = 18:00 Argentina)  → body {"manana":true}
// Envía push notification a cada abogado/asistente con las audiencias del día (o del día siguiente).
// También envía resumen por Telegram a Marco.

import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const APP_URL = 'https://app.marcorossi.com.ar'
const TG_API = 'https://api.telegram.org'

function getDateAR(offsetDays = 0): string {
  const ar = new Date(Date.now() - 3 * 60 * 60 * 1000 + offsetDays * 86_400_000)
  return ar.toISOString().slice(0, 10)
}

function e(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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

    const body = await req.json().catch(() => ({})) as { manana?: boolean }
    const esManana = body.manana === true
    const fecha = getDateAR(esManana ? 1 : 0)
    const labelDia = esManana ? 'mañana' : 'hoy'

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

    type AudRow = {
      id: string
      hora: string | null
      expediente_id: string | null
      expedientes: { id: string; caratula: string | null; numero: string | null; abogado_responsable_id: string | null } | null
      catalogo_tipos_audiencia: { nombre: string | null } | null
      organismos: { nombre: string | null } | null
      audiencia_asignados: { profile_id: string }[]
      profesional_asistente_id: string | null
    }

    const { data: audiencias, error: audErr } = await admin
      .from('audiencias')
      .select(`
        id, hora, expediente_id,
        expedientes(id, caratula, numero, abogado_responsable_id),
        catalogo_tipos_audiencia(nombre),
        organismos(nombre),
        audiencia_asignados(profile_id),
        profesional_asistente_id
      `)
      .eq('fecha', fecha)
      .in('estado', ['PENDIENTE', 'CONFIRMADA'])
      .order('hora')

    if (audErr) return json(req, { error: audErr.message }, 500)

    // ── Telegram a Marco ──────────────────────────────────────────────────────
    const marcoChat = Number(Deno.env.get('TELEGRAM_MARCO_CHAT_ID'))
    const tgToken = Deno.env.get('TELEGRAM_ESCRITO_BOT_TOKEN')

    if (marcoChat && tgToken) {
      if (!audiencias?.length) {
        const fechaLabel = new Date(fecha + 'T00:00:00-03:00')
          .toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: '2-digit' })
        await fetch(`${TG_API}/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: marcoChat,
            text: `<b>Agenda · sin audiencias ${labelDia}</b>\n<i>${fechaLabel}</i>`,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          }),
        }).catch(err => console.warn('[audiencias-push] tg error:', err))
      } else {
        const fechaLabel = new Date(fecha + 'T00:00:00-03:00')
          .toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
        const header = `<b>Agenda · ${(audiencias as AudRow[]).length} audiencia${(audiencias as AudRow[]).length > 1 ? 's' : ''} ${labelDia} — ${fechaLabel}</b>`

        const blocks = (audiencias as AudRow[]).map(a => {
          const hora = a.hora ? String(a.hora).slice(0, 5) : '—'
          const caratula = a.expedientes?.caratula ?? a.expedientes?.numero ?? 'Sin caratula'
          const tipo = a.catalogo_tipos_audiencia?.nombre ?? ''
          const organismo = a.organismos?.nombre ?? ''
          const expId = a.expedientes?.id ?? a.expediente_id
          const appUrl = expId ? `${APP_URL}/expedientes/${expId}` : `${APP_URL}/agenda`

          const linea1 = `${hora}  <b>${e(caratula)}</b>`
          const linea2 = [tipo, organismo].filter(Boolean).map(e).join(' · ')
          const linea3 = `<a href="${appUrl}">Ver expediente</a>`
          return [linea1, linea2, linea3].filter(Boolean).join('\n')
        })

        const chunks: string[] = []
        let current = header
        for (const block of blocks) {
          if (current.length + 2 + block.length > 4000) {
            chunks.push(current.trimEnd())
            current = block
          } else {
            current += '\n\n' + block
          }
        }
        if (current.trim()) chunks.push(current.trimEnd())

        for (const chunk of chunks) {
          await fetch(`${TG_API}/bot${tgToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: marcoChat, text: chunk, parse_mode: 'HTML', disable_web_page_preview: true }),
          }).catch(err => console.warn('[audiencias-push] tg error:', err))
        }
      }
    }

    if (!audiencias?.length) {
      return json(req, { ok: true, fecha, audiencias: 0, usuarios: 0, message: `Sin audiencias ${labelDia}` })
    }

    // ── Push por usuario ──────────────────────────────────────────────────────
    type Item = { hora: string | null; caratula: string; tipo: string | null }
    const byUser = new Map<string, Item[]>()

    function add(uid: string, item: Item) {
      const list = byUser.get(uid) ?? []
      list.push(item)
      byUser.set(uid, list)
    }

    for (const a of (audiencias as AudRow[])) {
      const item: Item = {
        hora: a.hora ? String(a.hora).slice(0, 5) : null,
        caratula: a.expedientes?.caratula ?? a.expedientes?.numero ?? 'Expediente',
        tipo: a.catalogo_tipos_audiencia?.nombre ?? null,
      }
      const seen = new Set<string>()

      for (const asig of (a.audiencia_asignados ?? [])) {
        if (!seen.has(asig.profile_id)) {
          seen.add(asig.profile_id)
          add(asig.profile_id, item)
        }
      }
      if (a.profesional_asistente_id && !seen.has(a.profesional_asistente_id)) {
        seen.add(a.profesional_asistente_id)
        add(a.profesional_asistente_id, item)
      }
      if (seen.size === 0 && a.expedientes?.abogado_responsable_id) {
        add(a.expedientes.abogado_responsable_id, item)
      }
    }

    if (!byUser.size) {
      return json(req, { ok: true, fecha, audiencias: audiencias.length, usuarios: 0, message: 'Sin usuarios asignados' })
    }

    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('user_id, endpoint, p256dh_key, auth_key')
      .in('user_id', [...byUser.keys()])

    if (!subs?.length) {
      return json(req, { ok: true, fecha, audiencias: audiencias.length, usuarios: byUser.size, pushSent: 0 })
    }

    const subsByUser = new Map<string, typeof subs>()
    for (const s of subs) {
      const list = subsByUser.get(s.user_id) ?? []
      list.push(s)
      subsByUser.set(s.user_id, list)
    }

    const toRemove: string[] = []
    let pushSent = 0
    const pushTag = esManana ? 'audiencias-manana' : 'audiencias-diarias'

    for (const [uid, items] of byUser) {
      const userSubs = subsByUser.get(uid)
      if (!userSubs?.length) continue

      const count = items.length
      const title = count === 1
        ? `Audiencia ${labelDia} — ${items[0].caratula.slice(0, 55)}`
        : `${count} audiencias ${labelDia}`
      const body = items
        .map(i => `${i.hora ?? '—'}  ${i.caratula.slice(0, 50)}${i.tipo ? ` (${i.tipo})` : ''}`)
        .join('\n')

      const payload = JSON.stringify({ title, body, url: '/agenda', tag: pushTag })

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

    console.log(`[audiencias-daily-push] ${fecha} (${labelDia}): ${audiencias.length} audiencias, ${byUser.size} usuarios, ${pushSent} push enviados`)

    return json(req, {
      ok: true,
      fecha,
      manana: esManana,
      audiencias: audiencias.length,
      usuarios: byUser.size,
      pushSent,
      removed: toRemove.length,
    })
  } catch (err) {
    return json(req, { error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

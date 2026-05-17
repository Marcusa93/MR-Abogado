// ---------------------------------------------------------------------------
// Supabase Edge Function: send-push-notification
// Envía una notificación Web Push (VAPID) a uno o varios usuarios.
//
// Secrets requeridos (supabase secrets set ...):
//   VAPID_PUBLIC_KEY    - clave pública VAPID (base64url)
//   VAPID_PRIVATE_KEY   - clave privada VAPID (base64url)
//   VAPID_SUBJECT       - mailto:admin@tu-dominio.com
//
// Body JSON:
//   {
//     "user_ids": ["uuid", ...]    // opcional — si se omite, requiere "endpoint"
//     "endpoint": "https://..."    // opcional — envío puntual a una suscripción
//     "payload": { "title": "...", "body": "...", "url": "/expedientes/123" }
//   }
//
// Suscripciones con endpoint caído (404/410) se eliminan automáticamente.
// ---------------------------------------------------------------------------

import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

interface PushPayload {
  title: string
  body?: string
  url?: string
  tag?: string
  icon?: string
  badge?: string
}

interface Body {
  user_ids?: string[]
  endpoint?: string
  payload: PushPayload
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
    const subject = Deno.env.get('VAPID_SUBJECT')

    if (!publicKey || !privateKey || !subject) {
      return json({ error: 'VAPID no configurado en los secrets' }, 500)
    }

    webpush.setVapidDetails(subject, publicKey, privateKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Aceptamos service_role (invocación inter-function desde dispatch-alert-notification)
    // o JWT de usuario autenticado.
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    const isServiceRole = token === serviceRoleKey
    if (!isServiceRole) {
      const supabaseCaller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: { user } } = await supabaseCaller.auth.getUser()
      if (!user) return json({ error: 'Token inválido' }, 401)
    }

    const body = (await req.json()) as Body
    if (!body?.payload?.title) {
      return json({ error: 'Falta payload.title' }, 400)
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    let query = supabaseAdmin.from('push_subscriptions').select('*')
    if (body.endpoint) {
      query = query.eq('endpoint', body.endpoint)
    } else if (body.user_ids?.length) {
      query = query.in('user_id', body.user_ids)
    } else {
      return json({ error: 'Enviá user_ids o endpoint' }, 400)
    }

    const { data: subs, error } = await query
    if (error) return json({ error: error.message }, 500)
    if (!subs?.length) return json({ sent: 0, removed: 0, subs: 0 }, 200)

    const payloadStr = JSON.stringify(body.payload)
    const toRemove: string[] = []
    const errors: { endpoint: string; statusCode?: number; reason: string }[] = []
    let sent = 0

    await Promise.all(
      subs.map(async (s) => {
        const subscription = {
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh_key, auth: s.auth_key },
        }
        try {
          await webpush.sendNotification(subscription, payloadStr)
          sent++
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode
          const message = (err as { body?: string; message?: string })?.body
            ?? (err as { message?: string })?.message
            ?? 'unknown'
          // 404/410 = suscripción vencida (browser desinstalado, cambio de device,
          // permiso revocado) o endpoint inválido → purgar de la DB.
          if (statusCode === 404 || statusCode === 410) {
            toRemove.push(s.endpoint)
            errors.push({ endpoint: s.endpoint, statusCode, reason: 'expired_subscription' })
          } else {
            console.error('push error', statusCode, message)
            errors.push({ endpoint: s.endpoint, statusCode, reason: message.slice(0, 200) })
          }
        }
      })
    )

    if (toRemove.length) {
      const { error: delErr } = await supabaseAdmin
        .from('push_subscriptions')
        .delete()
        .in('endpoint', toRemove)
      if (delErr) {
        console.error('purge expired subs failed:', delErr.message)
      } else {
        console.log(`purged ${toRemove.length} expired push subscriptions`)
      }
    }

    return json({
      sent,
      removed: toRemove.length,
      subs: subs.length,
      errors: errors.length ? errors : undefined,
    }, 200)
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      500
    )
  }
})

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

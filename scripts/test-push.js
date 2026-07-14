#!/usr/bin/env node
/**
 * test-push.js — envía un push notification de prueba a todos los usuarios con suscripción activa.
 *
 * Uso:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=sbp_... \
 *   VAPID_PUBLIC_KEY=... \
 *   VAPID_PRIVATE_KEY=... \
 *   VAPID_SUBJECT=mailto:... \
 *   node scripts/test-push.js "Mensaje de prueba"
 *
 * Requiere web-push instalado:
 *   npm install web-push --no-save    (desde la raíz del repo)
 */

const webpush = require('web-push')
const { createClient } = require('/root/MR-Abogado/frontend/node_modules/@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT

const message = process.argv[2] ?? 'Prueba de notificación'

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !VAPID_PUBLIC || !VAPID_PRIVATE || !VAPID_SUBJECT) {
  console.error('Faltan variables de entorno. Ver encabezado del archivo.')
  process.exit(1)
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function main() {
  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh_key, auth_key, user_id')

  if (error) {
    console.error('Error al leer suscripciones:', error.message)
    process.exit(1)
  }

  if (!subs || subs.length === 0) {
    console.log('No hay suscripciones push activas.')
    return
  }

  console.log(`Enviando a ${subs.length} suscripción(es)…`)

  const payload = JSON.stringify({
    title: 'Estudio Marco Rossi',
    body: message,
    url: '/dashboard',
    tag: 'test-broadcast',
  })

  const dead = []
  let ok = 0

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh_key, auth: sub.auth_key } },
        payload,
      )
      ok++
      console.log(`  ✓ ${sub.user_id} — ${sub.endpoint.slice(0, 60)}…`)
    } catch (err) {
      const code = err.statusCode
      if (code === 404 || code === 410) {
        dead.push(sub.endpoint)
        console.log(`  ✗ endpoint vencido (${code}) — ${sub.endpoint.slice(0, 60)}…`)
      } else {
        console.error(`  ✗ error ${code} — ${err.message}`)
      }
    }
  }

  if (dead.length > 0) {
    await admin.from('push_subscriptions').delete().in('endpoint', dead)
    console.log(`\nEliminadas ${dead.length} suscripciones vencidas.`)
  }

  console.log(`\nResultado: ${ok}/${subs.length} enviados.`)
}

main().catch(err => {
  console.error('Error fatal:', err.message)
  process.exit(1)
})

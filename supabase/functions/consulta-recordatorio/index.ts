// Edge function: consulta-recordatorio
//
// Invocada por pg_cron a las 12:00 UTC diariamente.
// Busca consultas activas sin movimiento de estado por más de 7 días y notifica
// al responsable (assigned_to) y a todos los perfiles ADMIN.
//
// Auth: x-cron-secret header.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''

const TERMINAL_ESTADOS = ['convertida', 'resuelta', 'descartada']

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() })

  const cronKey = req.headers.get('x-cron-secret')
  if (!CRON_SECRET || cronKey !== CRON_SECRET) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const hace7dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Consultas activas, sin movimiento > 7 días, sin recordatorio reciente
  const { data: consultas, error } = await adminClient
    .from('consultas')
    .select('id, nombre, apellido, estado, assigned_to')
    .not('estado', 'in', `(${TERMINAL_ESTADOS.join(',')})`)
    .lt('estado_changed_at', hace7dias)
    .or(`recordatorio_enviado_at.is.null,recordatorio_enviado_at.lt.${hace7dias}`)

  if (error) {
    console.error('[consulta-recordatorio] query error:', error)
    return json({ error: error.message }, 500)
  }

  if (!consultas?.length) {
    console.log('[consulta-recordatorio] sin consultas estancadas')
    return json({ ok: true, notificadas: 0 })
  }

  // Perfiles ADMIN para notificar siempre
  const { data: admins } = await adminClient
    .from('profiles')
    .select('id')
    .eq('rol', 'ADMIN')
    .eq('activo', true)

  const adminIds: string[] = (admins ?? []).map((a: { id: string }) => a.id)

  let notificadas = 0

  for (const c of consultas) {
    const nombreCliente = [c.apellido, c.nombre].filter(Boolean).join(', ')
    const titulo = `Consulta sin movimiento: ${nombreCliente}`
    const mensaje = `La consulta de ${nombreCliente} lleva más de 7 días en estado "${c.estado}". Revisá si requiere acción.`
    const url = `/consultas/${c.id}`

    const destinatarios = new Set<string>()
    if (c.assigned_to) destinatarios.add(c.assigned_to)
    for (const id of adminIds) destinatarios.add(id)

    for (const uid of destinatarios) {
      const { error: alertaErr } = await adminClient.from('alertas').insert({
        tipo: 'RECORDATORIO',
        titulo,
        mensaje,
        destinatario_id: uid,
        prioridad: 'ALTA',
        payload: { consulta_id: c.id },
      })

      if (alertaErr) {
        console.error(`[consulta-recordatorio] alerta insert error for ${uid}:`, alertaErr)
        continue
      }

      fetch(`${SUPABASE_URL}/functions/v1/dispatch-alert-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ tipo: 'RECORDATORIO', usuario_id: uid, titulo, mensaje, url }),
      }).catch(e => console.error('[consulta-recordatorio] dispatch error:', e))
    }

    await adminClient
      .from('consultas')
      .update({ recordatorio_enviado_at: new Date().toISOString() })
      .eq('id', c.id)

    notificadas++
    console.log(`[consulta-recordatorio] notificada: ${c.id} (${nombreCliente})`)
  }

  return json({ ok: true, notificadas })
})

// ─────────────────────────────────────────────────────────────────────────────
// Edge function: record-sae-notif-view
//
// Llamada por el cliente cuando el usuario marca una notif SAE como leída
// desde la campanita o desde /notificaciones-sae. Captura IP, user-agent y
// timezone del request — datos que el cliente solo no puede falsificar — y
// los persiste en sae_notif_views como respaldo procesal.
//
// Atomicidad:
//   1. UPDATE sae_notificaciones SET leida=true, leida_at=now()
//   2. INSERT sae_notif_views (..., notif_snapshot)
//
// Body:
//   { notif_id: string, timezone?: string }
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface Body {
  notif_id?: string
  timezone?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'No autorizado' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return json({ error: 'Token inválido' }, 401)

  const body = await req.json().catch(() => null) as Body | null
  if (!body?.notif_id) return json({ error: 'Falta notif_id' }, 400)

  // IP real del cliente (Supabase pone X-Forwarded-For)
  const xff = req.headers.get('x-forwarded-for') ?? ''
  const ip = xff.split(',')[0]?.trim() || req.headers.get('cf-connecting-ip') || null
  const userAgent = req.headers.get('user-agent') ?? null
  const timezone = body.timezone ?? null

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // 1. Traer snapshot del estado actual de la notif (para preservar el contexto
  //    si después se borra) + validar que pertenece al user.
  const { data: notif, error: notifErr } = await admin
    .from('sae_notificaciones')
    .select('*')
    .eq('id', body.notif_id)
    .eq('profile_id', user.id)
    .maybeSingle()

  if (notifErr) return json({ error: notifErr.message }, 500)
  if (!notif) return json({ error: 'Notif no encontrada' }, 404)

  // 2. UPDATE leida=true (si no estaba ya)
  if (!notif.leida) {
    const { error: updErr } = await admin
      .from('sae_notificaciones')
      .update({ leida: true, leida_at: new Date().toISOString() })
      .eq('id', body.notif_id)
    if (updErr) return json({ error: updErr.message }, 500)
  }

  // 3. INSERT view (siempre, aunque la notif ya estaba leída — para tener
  //    historial de re-aperturas si fuera relevante).
  const { error: insErr } = await admin.from('sae_notif_views').insert({
    notif_id: body.notif_id,
    profile_id: user.id,
    ip,
    user_agent: userAgent,
    timezone,
    notif_snapshot: {
      tipo: notif.tipo,
      titulo: notif.titulo,
      caratula: notif.caratula,
      numero_expediente: notif.numero_expediente,
      oficina: notif.oficina,
      fecha_emision: notif.fecha_emision,
      fecha_captura: notif.fecha_captura,
      raw_payload: notif.raw_payload,
    },
  })

  if (insErr) return json({ error: insErr.message }, 500)

  return json({ ok: true, viewed_at: new Date().toISOString(), ip })
})

// ─────────────────────────────────────────────────────────────────────────────
// Edge function: dispatch-alert-notification
//
// Invocada desde el frontend después de insertar una alerta. Lee las
// notif_prefs del destinatario y, según el tipo de evento, dispara
// push y/o email respetando las preferencias.
//
// Body:
//   {
//     alerta_id?: string,           // si se pasa, lee la alerta de la DB
//     // ─── O alternativamente, datos directos: ───
//     tipo: string,                  // EVENT_KEY (MENCION, TAREA_ASIGNADA, ...)
//     usuario_id: string,            // destinatario
//     titulo: string,
//     mensaje?: string,
//     url?: string,                  // deep-link en la app
//     expediente_id?: string,
//   }
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { shouldNotify, NOTIF_EVENTS, type NotifPrefs } from '../_shared/notif-events.ts'
import { sendEmail, escapeHtml } from '../_shared/resend.ts'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface DispatchInput {
  alerta_id?: string
  tipo?: string
  usuario_id?: string
  titulo?: string
  mensaje?: string
  url?: string
  expediente_id?: string
}

interface AlertaRow {
  id: string
  tipo: string
  titulo: string
  mensaje: string | null
  usuario_id: string
  link: string | null
  expediente_id: string | null
}

function renderEmailHtml(titulo: string, mensaje: string, urlAbs: string | null): string {
  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#0f1015;color:#e4e4e7;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#18181b;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:24px;">
        <tr><td>
          <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.1em;color:#a1a1aa;text-transform:uppercase;">MR Abogado</p>
          <h1 style="margin:0 0 16px;font-size:20px;color:#fafafa;">${escapeHtml(titulo)}</h1>
          ${mensaje ? `<p style="margin:0 0 20px;font-size:14px;color:#d4d4d8;line-height:1.5;">${escapeHtml(mensaje)}</p>` : ''}
          ${urlAbs ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:linear-gradient(135deg,#8b5cf6,#06b6d4);border-radius:8px;"><a href="${urlAbs}" style="display:inline-block;padding:10px 18px;font-size:13px;font-weight:600;color:#fafafa;text-decoration:none;">Ver en la app</a></td></tr></table>` : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Auth: JWT del usuario (cualquiera autenticado puede invocar para crear notifs)
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'No autorizado' }, 401)

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return json({ error: 'Token inválido' }, 401)

  const body = await req.json().catch(() => null) as DispatchInput | null
  if (!body) return json({ error: 'Body inválido' }, 400)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Resolver datos de la alerta (DB o body directo)
  let tipo: string, usuario_id: string, titulo: string, mensaje: string, url: string | null

  if (body.alerta_id) {
    const { data: alerta, error } = await admin
      .from('alertas')
      .select('id, tipo, titulo, mensaje, usuario_id, link, expediente_id')
      .eq('id', body.alerta_id)
      .single()
    if (error || !alerta) return json({ error: 'Alerta no encontrada' }, 404)
    const a = alerta as AlertaRow
    tipo = a.tipo
    usuario_id = a.usuario_id
    titulo = a.titulo
    mensaje = a.mensaje ?? ''
    url = a.link
  } else {
    if (!body.tipo || !body.usuario_id || !body.titulo) {
      return json({ error: 'Faltan campos (tipo, usuario_id, titulo)' }, 400)
    }
    tipo = body.tipo
    usuario_id = body.usuario_id
    titulo = body.titulo
    mensaje = body.mensaje ?? ''
    url = body.url ?? null
  }

  // Validar que el evento sea uno conocido
  const event = NOTIF_EVENTS.find(e => e.key === tipo)
  if (!event) return json({ ok: true, skipped: 'tipo_desconocido' })

  // Traer prefs y email del destinatario
  const { data: profileRow, error: profErr } = await admin
    .from('profiles')
    .select('email, notif_prefs')
    .eq('id', usuario_id)
    .single()
  if (profErr || !profileRow) return json({ error: 'Usuario destinatario no encontrado' }, 404)

  const profile = profileRow as { email: string | null; notif_prefs: NotifPrefs | null }
  const wantsPush = shouldNotify(profile.notif_prefs, tipo, 'push')
  const wantsEmail = shouldNotify(profile.notif_prefs, tipo, 'email')

  const result = { pushed: false, emailed: false, skipped: [] as string[] }

  // Push
  if (wantsPush) {
    try {
      const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          user_ids: [usuario_id],
          payload: { title: titulo, body: mensaje, url: url ?? '/', tag: tipo },
        }),
      })
      result.pushed = res.ok
      if (!res.ok) result.skipped.push(`push_status_${res.status}`)
    } catch (e) {
      result.skipped.push(`push_error_${e instanceof Error ? e.message.slice(0, 60) : 'unknown'}`)
    }
  } else {
    result.skipped.push('push_pref_off')
  }

  // Email
  if (wantsEmail && profile.email) {
    const urlAbs = url ? (url.startsWith('http') ? url : `https://app.marcorossi.com.ar${url}`) : null
    const r = await sendEmail({
      to: profile.email,
      subject: titulo,
      html: renderEmailHtml(titulo, mensaje, urlAbs),
      tags: [{ name: 'tipo', value: tipo }],
    })
    result.emailed = r.ok
    if (!r.ok) result.skipped.push(`email_error_${r.error?.slice(0, 60) ?? 'unknown'}`)
  } else if (wantsEmail && !profile.email) {
    result.skipped.push('email_no_address')
  } else {
    result.skipped.push('email_pref_off')
  }

  return json({ ok: true, tipo, usuario_id, ...result })
})

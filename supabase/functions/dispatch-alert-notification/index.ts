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

  // Auth: aceptamos dos modos
  //   1. JWT de usuario autenticado (legacy: invocado desde el cliente)
  //   2. Service role key (trigger DB vía pg_net — el camino preferido)
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'No autorizado' }, 401)

  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const isServiceRole = token === serviceKey

  if (!isServiceRole) {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Token inválido' }, 401)
  }

  const body = await req.json().catch(() => null) as DispatchInput | null
  if (!body) return json({ error: 'Body inválido' }, 400)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Resolver datos de la alerta (DB o body directo)
  let tipo: string, usuario_id: string, titulo: string, mensaje: string, url: string | null
  let alertaId: string | null = null

  if (body.alerta_id) {
    const { data: alerta, error } = await admin
      .from('alertas')
      .select('id, tipo, titulo, mensaje, usuario_id, link, expediente_id')
      .eq('id', body.alerta_id)
      .single()
    if (error || !alerta) return json({ error: 'Alerta no encontrada' }, 404)
    const a = alerta as AlertaRow
    alertaId = a.id
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

  // ── Helper: idempotencia + escritura del dispatch ──────────────
  async function hasSuccessfulDispatch(channel: 'push' | 'email'): Promise<boolean> {
    if (!alertaId) return false // dispatches directos sin alerta no se desduplican
    const { data } = await admin
      .from('notif_dispatches')
      .select('id')
      .eq('alerta_id', alertaId)
      .eq('channel', channel)
      .eq('status', 'success')
      .limit(1)
      .maybeSingle()
    return !!data
  }
  async function recordDispatch(
    channel: 'push' | 'email',
    status: 'success' | 'failed' | 'skipped',
    reason: string | null,
    metadata: Record<string, unknown> = {},
  ) {
    await admin.from('notif_dispatches').insert({
      alerta_id: alertaId,
      usuario_id,
      channel,
      status,
      reason,
      metadata,
    })
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
    if (await hasSuccessfulDispatch('push')) {
      result.skipped.push('push_already_dispatched')
      await recordDispatch('push', 'skipped', 'already_dispatched')
    } else {
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
        if (res.ok) {
          const meta = await res.json().catch(() => ({})) as { sent?: number; removed?: number }
          await recordDispatch('push', 'success', null, meta)
          // Si la fn purgó subs vencidas pero no quedó ninguna activa, el `sent`
          // será 0 — degradamos a "failed" para que la UI lo refleje.
          if ((meta?.sent ?? 0) === 0) {
            result.pushed = false
            result.skipped.push('push_no_active_subs')
          }
        } else {
          result.skipped.push(`push_status_${res.status}`)
          await recordDispatch('push', 'failed', `http_${res.status}`)
        }
      } catch (e) {
        const reason = e instanceof Error ? e.message.slice(0, 200) : 'unknown'
        result.skipped.push(`push_error_${reason.slice(0, 60)}`)
        await recordDispatch('push', 'failed', reason)
      }
    }
  } else {
    result.skipped.push('push_pref_off')
    await recordDispatch('push', 'skipped', 'pref_off')
  }

  // Email
  if (wantsEmail && profile.email) {
    if (await hasSuccessfulDispatch('email')) {
      result.skipped.push('email_already_dispatched')
      await recordDispatch('email', 'skipped', 'already_dispatched')
    } else {
      const urlAbs = url ? (url.startsWith('http') ? url : `https://app.marcorossi.com.ar${url}`) : null
      const r = await sendEmail({
        to: profile.email,
        subject: titulo,
        html: renderEmailHtml(titulo, mensaje, urlAbs),
        tags: [{ name: 'tipo', value: tipo }],
      })
      result.emailed = r.ok
      if (r.ok) {
        await recordDispatch('email', 'success', null, { to: profile.email })
      } else {
        const reason = r.error?.slice(0, 200) ?? 'unknown'
        result.skipped.push(`email_error_${reason.slice(0, 60)}`)
        await recordDispatch('email', 'failed', reason)
      }
    }
  } else if (wantsEmail && !profile.email) {
    result.skipped.push('email_no_address')
    await recordDispatch('email', 'skipped', 'no_address')
  } else {
    result.skipped.push('email_pref_off')
    await recordDispatch('email', 'skipped', 'pref_off')
  }

  return json({ ok: true, tipo, usuario_id, ...result })
})

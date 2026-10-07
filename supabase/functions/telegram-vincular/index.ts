// Vinculación del usuario logueado con el bot de Telegram.
//
// POST { accion: 'link' }        → { url } con t.me/<bot>?start=<código> (vence en 30 min)
// POST { accion: 'desvincular' } → borra profiles.telegram_chat_id
//
// El código lo consume telegram-escrito-webhook al recibir "/start <código>".
// Secrets: TELEGRAM_ESCRITO_BOT_TOKEN

import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

function nuevoCodigo(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  // base64url: válido como parámetro de /start (A-Z a-z 0-9 _ -)
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

let botUsername: string | null = null

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'Método no permitido' }, 405)

  try {
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user }, error: authErr } = await anonClient.auth.getUser()
    if (authErr || !user) return json(req, { error: 'No autenticado' }, 401)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = await req.json().catch(() => ({})) as { accion?: string }

    if (body.accion === 'desvincular') {
      const { error } = await admin.from('profiles').update({ telegram_chat_id: null }).eq('id', user.id)
      if (error) return json(req, { error: error.message }, 500)
      return json(req, { ok: true })
    }

    if (body.accion !== 'link') return json(req, { error: 'accion inválida' }, 400)

    const token = Deno.env.get('TELEGRAM_ESCRITO_BOT_TOKEN')
    if (!token) return json(req, { error: 'Bot de Telegram no configurado' }, 500)

    if (!botUsername) {
      const me = await fetch(`https://api.telegram.org/bot${token}/getMe`).then(r => r.json()).catch(() => null) as
        { ok?: boolean; result?: { username?: string } } | null
      botUsername = me?.result?.username ?? null
      if (!botUsername) return json(req, { error: 'No se pudo consultar el bot de Telegram' }, 502)
    }

    // Un código vigente por usuario: se reemplazan los anteriores.
    await admin.from('telegram_link_codes').delete().eq('profile_id', user.id)
    const code = nuevoCodigo()
    const { error } = await admin.from('telegram_link_codes').insert({
      code,
      profile_id: user.id,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    if (error) return json(req, { error: error.message }, 500)

    return json(req, { url: `https://t.me/${botUsername}?start=${code}` })
  } catch (err) {
    console.error('[telegram-vincular]', err)
    return json(req, { error: err instanceof Error ? err.message : 'error interno' }, 500)
  }
})

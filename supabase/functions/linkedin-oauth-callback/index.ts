// OAuth de LinkedIn.
//   POST (con Authorization del usuario) → devuelve { url } para iniciar el flujo.
//   GET  ?code&state                     → callback: canjea el code, guarda el token, redirige.
//
// Deploy con --no-verify-jwt (el GET del callback no trae JWT; la auth del POST
// se valida a mano con el header).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const FRONTEND_URL = Deno.env.get('FRONTEND_URL') ?? 'https://app.marcorossi.com.ar'
const AUTHZ_URL = 'https://www.linkedin.com/oauth/v2/authorization'
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'
const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo'
const SCOPE = 'openid profile email w_member_social'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}
function redirect(to: string) {
  return new Response('', { status: 302, headers: { Location: to } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
  const clientId = Deno.env.get('LINKEDIN_CLIENT_ID')
  const clientSecret = Deno.env.get('LINKEDIN_CLIENT_SECRET')
  const redirectUri = `${SUPABASE_URL}/functions/v1/linkedin-oauth-callback`
  if (!clientId || !clientSecret) {
    return req.method === 'POST'
      ? json(req, { error: 'LinkedIn no configurado en el servidor' }, 500)
      : new Response('LinkedIn no configurado', { status: 500 })
  }

  // ── START: el frontend pide la URL de autorización ──────────────────────────
  if (req.method === 'POST') {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) return json(req, { error: 'No autorizado' }, 401)
    const anon = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await anon.auth.getUser()
    if (!user) return json(req, { error: 'Sesión inválida' }, 401)
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const u = new URL(AUTHZ_URL)
    u.searchParams.set('response_type', 'code')
    u.searchParams.set('client_id', clientId)
    u.searchParams.set('redirect_uri', redirectUri)
    u.searchParams.set('scope', SCOPE)
    u.searchParams.set('state', token)
    return json(req, { url: u.toString() })
  }

  // ── CALLBACK: LinkedIn vuelve con code + state ──────────────────────────────
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  const state = url.searchParams.get('state')
  if (error) return redirect(`${FRONTEND_URL}/contenidos?linkedin_error=${encodeURIComponent(error)}`)
  if (!code || !state) return new Response('Solicitud OAuth inválida', { status: 400 })

  try {
    const anon = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${state}` } } })
    const { data: { user }, error: authErr } = await anon.auth.getUser()
    if (authErr || !user) return new Response('Sesión inválida, volvé a entrar y reintentá.', { status: 401 })

    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })
    if (!tokenRes.ok) throw new Error(`Token exchange ${tokenRes.status}: ${(await tokenRes.text()).slice(0, 150)}`)
    const tok = await tokenRes.json() as { access_token: string; expires_in?: number; scope?: string }

    const uiRes = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${tok.access_token}` } })
    const ui = uiRes.ok ? await uiRes.json() as { sub?: string; name?: string } : {}

    const service = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    await service.from('social_connections').upsert({
      user_id: user.id,
      provider: 'linkedin',
      account_id: ui.sub ?? null,
      account_name: ui.name ?? null,
      access_token: tok.access_token,
      expires_at: new Date(Date.now() + (tok.expires_in ?? 5184000) * 1000).toISOString(),
      scope: tok.scope ?? SCOPE,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' })

    return redirect(`${FRONTEND_URL}/contenidos?linkedin=connected`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    console.error('[linkedin-oauth-callback]', msg)
    return redirect(`${FRONTEND_URL}/contenidos?linkedin_error=${encodeURIComponent(msg)}`)
  }
})

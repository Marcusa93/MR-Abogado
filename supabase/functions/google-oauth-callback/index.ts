// OAuth callback de Google.
// El user vuelve acá desde Google con ?code=... &state=...
// Canjeamos el code por tokens, los guardamos, y redirigimos al frontend.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { exchangeCodeForTokens } from '../_shared/google-drive.ts'

const FRONTEND_URL = Deno.env.get('FRONTEND_URL') ?? 'https://app.marcorossi.com.ar'

function html(body: string, status = 200): Response {
  return new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function redirect(to: string): Response {
  return new Response('', { status: 302, headers: { Location: to } })
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  const state = url.searchParams.get('state') // JWT del usuario que dispara el OAuth

  if (error) {
    return redirect(`${FRONTEND_URL}/configuracion?drive_error=${encodeURIComponent(error)}`)
  }
  if (!code || !state) {
    return html('<h2>Solicitud OAuth inválida</h2><p>Falta code o state.</p>', 400)
  }

  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')
  const redirectUri = `${Deno.env.get('SUPABASE_URL')!}/functions/v1/google-oauth-callback`
  if (!clientId || !clientSecret) {
    return html('<h2>Configuración incompleta</h2><p>Faltan GOOGLE_OAUTH_CLIENT_ID/SECRET en Supabase.</p>', 500)
  }

  try {
    // Autenticar al usuario que originó el flow usando el JWT pasado en state
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${state}` } } },
    )
    const { data: { user }, error: authErr } = await anonClient.auth.getUser()
    if (authErr || !user) {
      return html('<h2>Sesión inválida</h2><p>Volvé a iniciar sesión y reintentá conectar Drive.</p>', 401)
    }

    const { tokens, email } = await exchangeCodeForTokens({
      code, clientId, clientSecret, redirectUri,
    })

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Upsert (si reconectaba pierde el token viejo)
    await serviceClient
      .from('google_drive_credentials')
      .upsert({
        profile_id: user.id,
        google_user_email: email,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        scope: tokens.scope,
        expires_at: tokens.expires_at,
      }, { onConflict: 'profile_id' })

    return redirect(`${FRONTEND_URL}/configuracion?drive=connected`)
  } catch (err) {
    console.error('[google-oauth-callback]', err)
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return redirect(`${FRONTEND_URL}/configuracion?drive_error=${encodeURIComponent(msg)}`)
  }
})

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { authenticateWithSae, SaeError } from '../_shared/sae-request-connector.ts'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) return json({ error: 'No autorizado' }, 401)

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: cred, error: credError } = await serviceClient
      .from('sae_credentials')
      .select('id, username, encrypted_secret')
      .eq('profile_id', user.id)
      .eq('provider', 'justucuman')
      .maybeSingle()
    if (credError) throw credError
    if (!cred) return json({ error: 'No tenés credenciales SAE configuradas.' }, 400)

    const password = cred.encrypted_secret ? atob(cred.encrypted_secret) : null
    if (!password) {
      return json({ error: 'No se pudo recuperar la contraseña. Reingresá tus credenciales.' }, 500)
    }

    try {
      await authenticateWithSae({ username: cred.username, password })

      await serviceClient
        .from('sae_credentials')
        .update({ status: 'activo', last_login_at: new Date().toISOString(), last_error: null })
        .eq('id', cred.id)

      return json({ success: true })

    } catch (saeErr) {
      const msg = saeErr instanceof SaeError ? saeErr.message : 'Error al conectar con SAE'
      const code = saeErr instanceof SaeError ? saeErr.code : 'SAE_UNKNOWN'

      await serviceClient
        .from('sae_credentials')
        .update({ status: 'error', last_error: msg })
        .eq('id', cred.id)

      // Return 400 so the client can read the error body (non-2xx → data=null in supabase-js)
      return json({ error: msg, error_code: code }, 400)
    }

  } catch (err) {
    console.error('[sae-verify]', err)
    return json({ error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

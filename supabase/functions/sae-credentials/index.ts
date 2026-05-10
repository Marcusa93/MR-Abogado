import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

async function encryptPassword(plaintext: string, keyHex: string): Promise<string> {
  const keyBytes = new Uint8Array(keyHex.match(/../g)!.map((h) => parseInt(h, 16)))
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)
  return btoa(String.fromCharCode(...combined))
}

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

    const body = await req.json()
    const { action = 'upsert', username, password, provider = 'justucuman' } = body

    if (action === 'delete') {
      const { error } = await serviceClient
        .from('sae_credentials')
        .delete()
        .eq('profile_id', user.id)
        .eq('provider', provider)
      if (error) throw error
      return json({ success: true })
    }

    if (!username || !password) {
      return json({ error: 'Se requieren usuario y contraseña' }, 400)
    }

    const encryptionKey = Deno.env.get('SAE_ENCRYPTION_KEY')
    if (!encryptionKey || encryptionKey.length !== 64) {
      throw new Error('SAE_ENCRYPTION_KEY no configurada (debe ser 64 caracteres hex)')
    }

    const encrypted_secret = await encryptPassword(password, encryptionKey)

    const { data, error } = await serviceClient
      .from('sae_credentials')
      .upsert(
        { profile_id: user.id, username, encrypted_secret, provider, status: 'pendiente', last_error: null },
        { onConflict: 'profile_id,provider' },
      )
      .select('id, profile_id, username, provider, status, last_login_at, last_sync_at, last_error, created_at, updated_at')
      .single()

    if (error) throw error

    return json({ success: true, credential: data })
  } catch (err) {
    console.error('[sae-credentials]', err)
    return json({ error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

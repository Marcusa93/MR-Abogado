// Publica un texto en LinkedIn como el usuario autenticado.
// Body: { cuerpo, hashtags?, contenido_id? }
// Usa el token guardado en social_connections (provider=linkedin).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const UGC_URL = 'https://api.linkedin.com/v2/ugcPosts'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const anon = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user }, error: authErr } = await anon.auth.getUser()
    if (authErr || !user) return json(req, { error: 'No autorizado' }, 401)

    const { cuerpo, hashtags, contenido_id } = await req.json().catch(() => ({})) as
      { cuerpo?: string; hashtags?: string; contenido_id?: string }
    const texto = [cuerpo, hashtags].map(s => (s ?? '').trim()).filter(Boolean).join('\n\n')
    if (!texto) return json(req, { error: 'No hay texto para publicar' }, 400)

    const service = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: conn } = await service
      .from('social_connections')
      .select('access_token, account_id, expires_at')
      .eq('user_id', user.id)
      .eq('provider', 'linkedin')
      .maybeSingle()
    const c = conn as { access_token: string; account_id: string | null; expires_at: string | null } | null
    if (!c) return json(req, { error: 'Conectá tu cuenta de LinkedIn primero.' }, 400)
    if (!c.account_id) return json(req, { error: 'Falta el id de tu cuenta de LinkedIn. Reconectá.' }, 400)
    if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) {
      return json(req, { error: 'Tu conexión con LinkedIn venció. Reconectá tu cuenta.' }, 401)
    }

    const res = await fetch(UGC_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.access_token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        author: `urn:li:person:${c.account_id}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: texto },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      }),
    })
    if (!res.ok) {
      const t = await res.text()
      return json(req, { error: `LinkedIn rechazó la publicación (${res.status}): ${t.slice(0, 200)}` }, 502)
    }
    const postId = res.headers.get('x-restli-id') ?? res.headers.get('x-linkedin-id')
    const postUrl = postId ? `https://www.linkedin.com/feed/update/${postId}` : null

    if (contenido_id) {
      await service.from('contenidos').update({
        estado: 'publicado',
        publicado_at: new Date().toISOString(),
        publicado_url: postUrl,
        updated_at: new Date().toISOString(),
      }).eq('id', contenido_id)
    }

    return json(req, { ok: true, post_id: postId, url: postUrl })
  } catch (err) {
    console.error('[linkedin-publish]', err)
    return json(req, { error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

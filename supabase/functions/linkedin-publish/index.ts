// Publica texto (y opcionalmente imagen) en LinkedIn como el usuario autenticado.
// Body: { cuerpo, hashtags?, imagen_url?, contenido_id? }
// Usa el token guardado en social_connections (provider=linkedin).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const LI_VERSION = '202412'
const POSTS_URL = 'https://api.linkedin.com/rest/posts'
const IMAGES_INIT_URL = 'https://api.linkedin.com/rest/images?action=initializeUpload'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

function liHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'LinkedIn-Version': LI_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
  }
}

async function subirImagen(token: string, accountId: string, imagenUrl: string): Promise<string> {
  // 1. Inicializar upload: LinkedIn devuelve la URL de subida y el URN de la imagen
  const initRes = await fetch(IMAGES_INIT_URL, {
    method: 'POST',
    headers: liHeaders(token),
    body: JSON.stringify({ initializeUploadRequest: { owner: `urn:li:person:${accountId}` } }),
  })
  if (!initRes.ok) {
    const t = await initRes.text()
    throw new Error(`LinkedIn rechazó el inicio de subida de imagen (${initRes.status}): ${t.slice(0, 200)}`)
  }
  const initData = await initRes.json() as { value?: { uploadUrl?: string; image?: string } }
  const uploadUrl = initData.value?.uploadUrl
  const imageUrn = initData.value?.image
  if (!uploadUrl || !imageUrn) throw new Error('LinkedIn no devolvió uploadUrl o image URN')

  // 2. Descargar los bytes de imagen desde Supabase Storage
  const imgRes = await fetch(imagenUrl)
  if (!imgRes.ok) throw new Error(`No se pudo descargar la imagen (${imgRes.status})`)
  const imageBytes = await imgRes.arrayBuffer()
  const contentType = imgRes.headers.get('Content-Type') ?? 'image/jpeg'

  // 3. Subir los bytes a LinkedIn
  const upRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: imageBytes,
  })
  if (!upRes.ok) {
    const t = await upRes.text()
    throw new Error(`Fallo al subir imagen a LinkedIn (${upRes.status}): ${t.slice(0, 200)}`)
  }

  return imageUrn
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

    const { cuerpo, hashtags, imagen_url, contenido_id } = await req.json().catch(() => ({})) as {
      cuerpo?: string
      hashtags?: string
      imagen_url?: string
      contenido_id?: string
    }
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

    // Si hay imagen: subirla primero y obtener el URN
    let imageUrn: string | null = null
    if (imagen_url) {
      imageUrn = await subirImagen(c.access_token, c.account_id, imagen_url)
    }

    // Armar el body del post
    const postBody: Record<string, unknown> = {
      author: `urn:li:person:${c.account_id}`,
      commentary: texto,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }
    if (imageUrn) {
      postBody.content = { media: { id: imageUrn } }
    }

    const res = await fetch(POSTS_URL, {
      method: 'POST',
      headers: liHeaders(c.access_token),
      body: JSON.stringify(postBody),
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

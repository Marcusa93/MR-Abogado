// ─────────────────────────────────────────────────────────────────────────────
// Edge function: contenido-eliminar
//
// Soft-delete de un contenido (setea deleted_at). Usa service role para
// bypassear RLS — la autorización se valida acá de forma explícita:
//   - ADMIN, DIRECTOR y SECRETARIA pueden borrar cualquier contenido.
//   - El resto del equipo solo puede borrar lo que creó (created_by).
//
// Existe porque el soft-delete vía PATCH directo chocaba con la policy de
// UPDATE de contenidos (WITH CHECK), devolviendo 403 de forma intermitente.
// Centralizar el borrado server-side lo hace determinístico.
//
// Body: { id: string }
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

interface Body {
  id?: string
}

const PUEDE_BORRAR_TODO = new Set(['ADMIN', 'DIRECTOR', 'SECRETARIA'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json(req, { error: 'No autorizado' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return json(req, { error: 'Token inválido' }, 401)

  const body = await req.json().catch(() => null) as Body | null
  if (!body?.id) return json(req, { error: 'Falta id' }, 400)

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Rol del usuario
  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select('rol')
    .eq('id', user.id)
    .maybeSingle()
  if (profErr) return json(req, { error: profErr.message }, 500)
  const rol = profile?.rol ?? ''

  // Traer el contenido para validar existencia y autoría
  const { data: contenido, error: cErr } = await admin
    .from('contenidos')
    .select('id, created_by, deleted_at')
    .eq('id', body.id)
    .maybeSingle()
  if (cErr) return json(req, { error: cErr.message }, 500)
  if (!contenido) return json(req, { error: 'Contenido no encontrado' }, 404)
  if (contenido.deleted_at) return json(req, { ok: true, already: true })

  const autorizado = PUEDE_BORRAR_TODO.has(rol) || contenido.created_by === user.id
  if (!autorizado) {
    return json(req, { error: 'No tenés permiso para eliminar este contenido' }, 403)
  }

  const { error: delErr } = await admin
    .from('contenidos')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', body.id)
  if (delErr) return json(req, { error: delErr.message }, 500)

  return json(req, { ok: true, id: body.id })
})

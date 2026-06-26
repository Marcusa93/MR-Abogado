// ---------------------------------------------------------------------------
// Supabase Edge Function: delete-user
// Elimina un usuario (auth + perfil). Solo ADMIN/DIRECTOR.
// Guardas: no auto-eliminarse, no eliminar al único director, solo un DIRECTOR
// puede eliminar a otro DIRECTOR. Si el usuario tiene datos asociados, el FK
// (created_by RESTRICT) bloquea el borrado y devolvemos un error claro.
// ---------------------------------------------------------------------------

import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json(req, { error: 'No autorizado' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabaseCaller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: callerUser }, error: authError } = await supabaseCaller.auth.getUser()
    if (authError || !callerUser) return json(req, { error: 'Token inválido' }, 401)

    const { data: callerProfile } = await supabaseCaller
      .from('profiles').select('rol').eq('id', callerUser.id).single()
    const callerRol = (callerProfile as { rol?: string } | null)?.rol ?? ''
    if (!['ADMIN', 'DIRECTOR'].includes(callerRol)) {
      return json(req, { error: 'Solo administradores pueden eliminar usuarios' }, 403)
    }

    const { user_id } = await req.json().catch(() => ({})) as { user_id?: string }
    if (!user_id) return json(req, { error: 'Falta user_id' }, 400)
    if (user_id === callerUser.id) return json(req, { error: 'No podés eliminarte a vos mismo' }, 400)

    const admin = createClient(supabaseUrl, serviceRoleKey)

    // Perfil objetivo
    const { data: target } = await admin
      .from('profiles').select('rol, nombre, apellido').eq('id', user_id).maybeSingle()
    const targetRow = target as { rol?: string } | null
    if (!targetRow) return json(req, { error: 'Usuario no encontrado' }, 404)

    if (targetRow.rol === 'DIRECTOR') {
      if (callerRol !== 'DIRECTOR') {
        return json(req, { error: 'Solo un director puede eliminar a otro director' }, 403)
      }
      const { count } = await admin
        .from('profiles').select('id', { count: 'exact', head: true }).eq('rol', 'DIRECTOR')
      if ((count ?? 0) <= 1) {
        return json(req, { error: 'No podés eliminar al único director del estudio' }, 400)
      }
    }

    // Borrado (cascada a profiles; si hay datos con created_by RESTRICT, falla)
    const { error: delErr } = await admin.auth.admin.deleteUser(user_id)
    if (delErr) {
      const m = delErr.message ?? ''
      const fk = /foreign key|violates|constraint|referenced/i.test(m)
      return json(req, {
        error: fk
          ? 'No se puede eliminar: el usuario tiene expedientes o datos asociados. Desactivalo en su lugar.'
          : `No se pudo eliminar: ${m}`,
      }, fk ? 409 : 500)
    }

    return json(req, { success: true })
  } catch (err) {
    return json(req, { error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

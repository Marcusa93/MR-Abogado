// ─────────────────────────────────────────────────────────────────────────────
// Edge function: escritos-revision
//
// Revisión de un escrito entre personas del estudio.
//   { modo: 'pedir', escrito_id, revisor_id, nota? }   → marca el pedido y avisa al revisor por Telegram
//   { modo: 'resolver', escrito_id, resultado: 'aprobado'|'cambios', observaciones? }
//                                                       → solo el revisor; avisa a quien pidió
//   { modo: 'cancelar', escrito_id }                    → quien pidió, mientras esté pendiente
// El acceso al escrito se valida con el cliente del usuario (RLS).
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { avisarPedidoRevision, resolverRevision } from '../_shared/escrito-bot.ts'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json(req, { error: 'No autorizado' }, 401)
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json(req, { error: 'Token inválido' }, 401)

    const body = await req.json().catch(() => null) as {
      modo?: 'pedir' | 'resolver' | 'cancelar'; escrito_id?: string; revisor_id?: string; nota?: string
      resultado?: 'aprobado' | 'cambios'; observaciones?: string
    } | null
    if (!body?.escrito_id) return json(req, { error: 'escrito_id requerido' }, 400)

    // Acceso con RLS
    const { data: visible } = await userClient.from('escritos').select('id').eq('id', body.escrito_id).maybeSingle()
    if (!visible) return json(req, { error: 'Escrito no encontrado o sin permisos' }, 404)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const token = Deno.env.get('TELEGRAM_ESCRITO_BOT_TOKEN') ?? ''
    const { data: actual } = await admin.from('escritos')
      .select('revision_pedida_a, revision_pedida_por, revision_resultado').eq('id', body.escrito_id).single()
    const rev = actual as { revision_pedida_a: string | null; revision_pedida_por: string | null; revision_resultado: string | null }

    if (body.modo === 'pedir') {
      if (!body.revisor_id) return json(req, { error: 'Elegí quién lo revisa' }, 400)
      if (body.revisor_id === user.id) return json(req, { error: 'No podés pedirte la revisión a vos mismo' }, 400)
      const { data: r } = await admin.from('profiles').select('id, rol, activo').eq('id', body.revisor_id).maybeSingle()
      const revisor = r as { id: string; rol: string; activo: boolean } | null
      if (!revisor?.activo || !['DIRECTOR', 'ABOGADO'].includes(revisor.rol)) return json(req, { error: 'Esa persona no puede revisar escritos' }, 400)
      const ahora = new Date().toISOString()
      const { error } = await admin.from('escritos').update({
        revision_pedida_a: revisor.id, revision_pedida_por: user.id, revision_pedida_at: ahora,
        revision_nota: body.nota?.trim().slice(0, 1000) || null,
        revision_resultado: null, revision_observaciones: null, revision_resuelta_at: null,
      }).eq('id', body.escrito_id)
      if (error) return json(req, { error: error.message }, 500)
      const telegram = await avisarPedidoRevision(admin, token, body.escrito_id).catch((e) => { console.error(e); return false })
      return json(req, { ok: true, telegram })
    }

    if (body.modo === 'resolver') {
      if (rev.revision_pedida_a !== user.id) return json(req, { error: 'Solo quien revisa puede aprobar o devolver' }, 403)
      if (body.resultado !== 'aprobado' && body.resultado !== 'cambios') return json(req, { error: 'resultado inválido' }, 400)
      if (body.resultado === 'cambios' && !body.observaciones?.trim()) return json(req, { error: 'Escribí las observaciones' }, 400)
      const r = await resolverRevision(admin, token, body.escrito_id, body.resultado, body.observaciones ?? null)
      return r.ok ? json(req, { ok: true, avisado: r.avisado }) : json(req, { error: r.error }, 400)
    }

    if (body.modo === 'cancelar') {
      if (rev.revision_pedida_por !== user.id) return json(req, { error: 'Solo quien la pidió puede cancelarla' }, 403)
      await admin.from('escritos').update({
        revision_pedida_a: null, revision_pedida_por: null, revision_pedida_at: null, revision_nota: null,
        revision_resultado: null, revision_observaciones: null, revision_resuelta_at: null,
      }).eq('id', body.escrito_id)
      return json(req, { ok: true })
    }

    return json(req, { error: 'modo inválido' }, 400)
  } catch (e) {
    return json(req, { error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

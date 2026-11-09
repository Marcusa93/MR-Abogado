// calendario-judicial — trae los feriados nacionales de la API oficial
// (api.argentinadatos.com, basada en los decretos) y los guarda en dias_inhabiles.
// El navegador no puede llamar a la API (CSP), por eso pasa por acá.
//
// Body: { anios?: number[] }  — por defecto, el año actual y el siguiente.
// Returns: { guardados: { [anio]: number } }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { sincronizarFeriadosNacionales } from '../_shared/judicial-calendar.ts'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  try {
    const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user } } = await anon.auth.getUser()
    if (!user) return json(req, { error: 'No autorizado' }, 401)

    const body = await req.json().catch(() => ({})) as { anios?: number[] }
    const actual = new Date().getUTCFullYear()
    const anios = (Array.isArray(body.anios) && body.anios.length ? body.anios : [actual, actual + 1])
      .filter((y) => Number.isInteger(y) && y >= actual - 2 && y <= actual + 2).slice(0, 3)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const guardados: Record<number, number> = {}
    for (const y of anios) guardados[y] = await sincronizarFeriadosNacionales(admin, y)
    return json(req, { guardados })
  } catch (err) {
    console.error('[calendario-judicial]', err)
    return json(req, { error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

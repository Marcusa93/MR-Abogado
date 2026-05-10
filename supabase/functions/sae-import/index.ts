import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface ImportCase {
  procid: string
  jurisdictionId: number
  numero_sae: string
  caratula: string
  cliente_id?: string
}

interface ImportResult {
  numero_sae: string
  expediente_id?: string
  success: boolean
  error?: string
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
    // ── Auth ─────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? ''
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) return json({ error: 'No autorizado' }, 401)

    // ── Parse body ────────────────────────────────────────────────────────────
    let body: { cases?: ImportCase[] }
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Body JSON inválido' }, 400)
    }

    const cases = body.cases
    if (!Array.isArray(cases) || cases.length === 0) {
      return json({ error: 'Se requiere un array "cases" con al menos un elemento.' }, 400)
    }

    // ── Importar cada expediente ───────────────────────────────────────────────
    const results: ImportResult[] = []

    for (const c of cases) {
      if (!c.numero_sae || !c.caratula) {
        results.push({
          numero_sae: c.numero_sae ?? '',
          success: false,
          error: 'numero_sae y caratula son requeridos.',
        })
        continue
      }

      try {
        const { data, error } = await anonClient.rpc('create_expediente_sae' as never, {
          p_numero_sae: c.numero_sae,
          p_caratula: c.caratula,
          p_cliente_id: c.cliente_id ?? null,
        })

        if (error) {
          results.push({
            numero_sae: c.numero_sae,
            success: false,
            error: error.message,
          })
        } else {
          const expediente_id = typeof data === 'string' ? data : (data as Record<string, unknown>)?.id as string | undefined
          results.push({
            numero_sae: c.numero_sae,
            expediente_id,
            success: true,
          })
        }
      } catch (err) {
        results.push({
          numero_sae: c.numero_sae,
          success: false,
          error: err instanceof Error ? err.message : 'Error inesperado',
        })
      }
    }

    const exitosos = results.filter(r => r.success).length
    const errores = results.filter(r => !r.success).length

    return json({
      results,
      total: results.length,
      exitosos,
      errores,
    })

  } catch (err) {
    console.error('[sae-import]', err)
    return json({ error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

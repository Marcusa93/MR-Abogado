// Baja en lote los cuerpos de actuaciones que aún no tengan texto guardado.
// Pensada para el caso de "generar PDF de expediente largo": llenamos lo que
// falte antes de armar el PDF.
//
// Body: { expediente_id: string, movement_ids?: string[] }
//   Si se omite movement_ids, agarra todas las del expediente con cuerpo NULL.
//   Cap defensivo de 60 por llamada para no excederse del timeout.
//
// Returns: { fetched: number, failed: number, skipped: number, total: number }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { authenticateWithSae, fetchStoryBody, SaeError } from '../_shared/sae-request-connector.ts'

const MAX_PER_CALL = 60

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface MovementRow {
  id: string
  external_id: string | null
  sae_case_id: string | null
  raw_payload: { jurisdiction_id?: number } | null
  cuerpo: string | null
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

    const body = await req.json().catch(() => null) as
      | { expediente_id?: string; movement_ids?: string[] }
      | null
    if (!body?.expediente_id) return json({ error: 'expediente_id requerido' }, 400)

    // Verify expediente ownership via RLS-respecting client
    const { data: ownExp, error: ownErr } = await anonClient
      .from('expedientes')
      .select('id')
      .eq('id', body.expediente_id)
      .maybeSingle()
    if (ownErr || !ownExp) return json({ error: 'Expediente no encontrado o sin permisos' }, 404)

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Get SAE credentials
    const { data: cred, error: credErr } = await serviceClient
      .from('sae_credentials')
      .select('username, encrypted_secret, status')
      .eq('profile_id', user.id)
      .eq('provider', 'justucuman')
      .maybeSingle()
    if (credErr) throw credErr
    if (!cred) return json({ error: 'No tenés credenciales SAE configuradas' }, 400)
    if (cred.status === 'desactivado') return json({ error: 'Credenciales SAE desactivadas' }, 400)

    const password = cred.encrypted_secret ? atob(cred.encrypted_secret) : null
    if (!password) return json({ error: 'No se pudo recuperar la contraseña SAE' }, 500)

    // Fetch movements that need body
    let query = serviceClient
      .from('sae_movements')
      .select('id, external_id, sae_case_id, raw_payload, cuerpo')
      .eq('expediente_id', body.expediente_id)
      .is('cuerpo', null)
      .not('external_id', 'is', null)
      .not('sae_case_id', 'is', null)
      .limit(MAX_PER_CALL)

    if (body.movement_ids && body.movement_ids.length > 0) {
      query = query.in('id', body.movement_ids)
    }

    const { data: movements, error: movsErr } = await query
    if (movsErr) throw movsErr

    const pending = (movements ?? []) as unknown as MovementRow[]
    const total = pending.length

    if (total === 0) {
      return json({ fetched: 0, failed: 0, skipped: 0, total: 0 })
    }

    // Auth to SAE once for the whole batch
    const session = await authenticateWithSae({ username: cred.username, password })

    let fetched = 0
    let failed = 0
    let skipped = 0

    // Fetch in parallel but with a sane concurrency cap to not hammer SAE
    const CONCURRENCY = 4
    for (let i = 0; i < pending.length; i += CONCURRENCY) {
      const batch = pending.slice(i, i + CONCURRENCY)
      await Promise.all(batch.map(async (m) => {
        const jid = typeof m.raw_payload?.jurisdiction_id === 'number' ? m.raw_payload.jurisdiction_id : null
        if (!jid || !m.sae_case_id || !m.external_id) {
          skipped++
          return
        }
        try {
          const text = await fetchStoryBody(m.sae_case_id, jid, m.external_id, session)
          if (text) {
            await serviceClient
              .from('sae_movements')
              .update({ cuerpo: text })
              .eq('id', m.id)
            fetched++
          } else {
            skipped++
          }
        } catch (err) {
          console.error('[sae-fetch-bodies]', m.id, err instanceof Error ? err.message : err)
          failed++
        }
      }))
    }

    return json({ fetched, failed, skipped, total })

  } catch (err) {
    console.error('[sae-fetch-bodies]', err)
    const code = err instanceof SaeError ? err.code : 'UNKNOWN'
    return json({ error: err instanceof Error ? err.message : 'Error interno', error_code: code }, 500)
  }
})

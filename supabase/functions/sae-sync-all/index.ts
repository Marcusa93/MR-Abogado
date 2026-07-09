// Cron batch para sincronización automática de actuaciones SAE.
// Invocado por pg_cron una vez al día a las 09:00 UTC (06:00 Argentina).
// Auth: x-cron-secret header (mismo mecanismo que sae-poll-notificaciones).
//
// Por cada perfil con credenciales activas, llama a sae-sync con service_role
// pasando on_behalf_of_user_id. Los batches de 5 evitan saturar el SAE.
// Saltea expedientes sincronizados en las últimas 20h para no duplicar.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function json(_req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function syncOne(profileId: string, expedienteId: string): Promise<{ ok: boolean; nuevas?: number; error?: string }> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/sae-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        expediente_id: expedienteId,
        on_behalf_of_user_id: profileId,
      }),
    })
    const data = await res.json().catch(() => ({})) as { success?: boolean; nuevas?: number; error?: string }
    if (!res.ok || !data.success) return { ok: false, error: data.error ?? `HTTP ${res.status}` }
    return { ok: true, nuevas: data.nuevas ?? 0 }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error' }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })

  // Auth: x-cron-secret
  const cronSecret = req.headers.get('x-cron-secret')
  const expectedSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret || !expectedSecret || cronSecret !== expectedSecret) {
    return json(req, { error: 'No autorizado' }, 401)
  }

  const serviceClient = createClient(supabaseUrl, serviceKey)

  // Perfíles con credenciales activas
  const { data: activeCreds, error: credsErr } = await serviceClient
    .from('sae_credentials')
    .select('profile_id')
    .eq('provider', 'justucuman')
    .eq('status', 'activo')
  if (credsErr) return json(req, { error: credsErr.message }, 500)
  if (!activeCreds?.length) return json(req, { ok: true, message: 'Sin credenciales activas', synced: 0 })

  const activeProfileIds = new Set((activeCreds as { profile_id: string }[]).map(c => c.profile_id))

  // Todos los vínculos SAE
  const { data: links, error: linksErr } = await serviceClient
    .from('expediente_sae_links')
    .select('profile_id, expediente_id, last_sync_at')
    .eq('provider', 'justucuman')
  if (linksErr) return json(req, { error: linksErr.message }, 500)

  // Filtrar: solo perfiles con credencial activa + no sincronizados en las últimas 20h
  const cutoff = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString()
  const toSync = ((links ?? []) as { profile_id: string; expediente_id: string; last_sync_at: string | null }[])
    .filter(l => activeProfileIds.has(l.profile_id) && (!l.last_sync_at || l.last_sync_at < cutoff))

  if (!toSync.length) {
    return json(req, { ok: true, message: 'Ningún expediente requiere sync', synced: 0 })
  }

  // Sincronizar en batches de 5 para no saturar el SAE ni el edge function pool
  const BATCH = 5
  const results: { expediente_id: string; ok: boolean; nuevas?: number; error?: string }[] = []

  for (let i = 0; i < toSync.length; i += BATCH) {
    const batch = toSync.slice(i, i + BATCH)
    const batchResults = await Promise.all(
      batch.map(link =>
        syncOne(link.profile_id, link.expediente_id)
          .then(r => ({ expediente_id: link.expediente_id, ...r }))
      )
    )
    results.push(...batchResults)
  }

  const exitosos = results.filter(r => r.ok).length
  const errores = results.filter(r => !r.ok)
  const totalNuevas = results.reduce((acc, r) => acc + (r.nuevas ?? 0), 0)

  console.log(`[sae-sync-all] ${exitosos}/${results.length} OK, ${totalNuevas} actuaciones nuevas`)

  return json(req, {
    ok: true,
    total: toSync.length,
    exitosos,
    errores: errores.length > 0 ? errores : undefined,
    nuevas_actuaciones: totalNuevas,
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Edge function: legal-lookup
//
// Router único hacia los conectores jurídicos. Auth + rate limit + cache
// + logging transparente.
//
// Body:
//   {
//     source: 'saij',
//     tool:   'searchJurisprudencia' | 'searchLegislacion' | 'searchDoctrina'
//           | 'getDocument' | 'resolveCitation',
//     args:   { ... }   // input específico de cada tool
//   }
//
// Response:
//   { ok: true, source, tool, cached: boolean, latency_ms, result }
//   { ok: false, error, status }
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { getSource, buildCacheKey, readCache, writeCache, maybeGc, USER_RATE_LIMIT_PER_MIN } from '../_shared/legal-sources/index.ts'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Decodifica el claim `role` del JWT sin validar firma. Lo usamos solo
// para detectar service_role vs user (no para autorizar — eso lo hace
// la validación contra Supabase auth).
function decodeJwtRole(token: string): string | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload?.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

async function logLookup(
  admin: any,
  payload: {
    user_id: string | null
    source: string
    tool: string
    args: unknown
    status: 'ok' | 'cache_hit' | 'error' | 'rate_limited' | 'timeout'
    http_status?: number
    latency_ms?: number
    error_msg?: string
    result_count?: number
  },
) {
  try {
    await admin.from('legal_lookup_logs').insert(payload)
  } catch (_e) { /* best effort */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ ok: false, error: 'No autorizado' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  // Detectamos service_role decodificando el claim del JWT (más robusto que
  // comparar strings, porque el vault puede tener una copia stale).
  const isServiceRole = token === serviceKey || decodeJwtRole(token) === 'service_role'

  const body = await req.json().catch(() => null) as {
    source?: string; tool?: string; args?: unknown; on_behalf_of_user_id?: string
  } | null
  if (!body || !body.source || !body.tool) {
    return json({ ok: false, error: 'Body requiere { source, tool, args }' }, 400)
  }

  let userId: string | null = null
  if (isServiceRole) {
    // Llamado interno (ej. desde bogabot-agent): se requiere identificar
    // al user real para rate-limit y log.
    if (!body.on_behalf_of_user_id) {
      return json({ ok: false, error: 'service_role requiere on_behalf_of_user_id' }, 400)
    }
    userId = body.on_behalf_of_user_id
  } else {
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) return json({ ok: false, error: 'Token inválido' }, 401)
    userId = user.id
  }

  const admin = createClient(supabaseUrl, serviceKey)
  const user = { id: userId! }

  const source = getSource(body.source)
  if (!source) {
    return json({ ok: false, error: `Source desconocido: ${body.source}` }, 400)
  }

  // ── Rate limit por user ────────────────────────────────────────────
  const { data: rl } = await (admin.rpc as any)('legal_lookup_recent_count', { p_user_id: user.id })
  const recent = typeof rl === 'number' ? rl : 0
  if (recent >= USER_RATE_LIMIT_PER_MIN) {
    await logLookup(admin, {
      user_id: user.id, source: body.source, tool: body.tool, args: body.args ?? {},
      status: 'rate_limited',
    })
    return json({ ok: false, error: `Rate limit: máx ${USER_RATE_LIMIT_PER_MIN} requests/min` }, 429)
  }

  // ── Cache lookup ───────────────────────────────────────────────────
  const cacheKey = await buildCacheKey(body.tool, body.args ?? {})
  const cached = await readCache<unknown>(admin, body.source, cacheKey)
  if (cached) {
    const resultCount = countResults(cached)
    await logLookup(admin, {
      user_id: user.id, source: body.source, tool: body.tool, args: body.args ?? {},
      status: 'cache_hit', result_count: resultCount, latency_ms: 0,
    })
    return json({ ok: true, source: body.source, tool: body.tool, cached: true, result: cached })
  }

  // ── Invocar el handler del source ──────────────────────────────────
  const t0 = Date.now()
  let result: unknown
  try {
    const args = (body.args ?? {}) as any
    switch (body.tool) {
      case 'searchJurisprudencia':
        result = await source.searchJurisprudencia(args); break
      case 'searchLegislacion':
        result = await source.searchLegislacion(args); break
      case 'searchDoctrina':
        result = await source.searchDoctrina(args); break
      case 'getDocument':
        if (!args.source_doc_id) throw new Error('args.source_doc_id requerido')
        result = await source.getDocument(args.source_doc_id); break
      case 'resolveCitation':
        if (!args.text) throw new Error('args.text requerido')
        result = await source.resolveCitation(args.text); break
      default:
        return json({ ok: false, error: `Tool desconocida: ${body.tool}` }, 400)
    }
  } catch (e) {
    const latency = Date.now() - t0
    const msg = e instanceof Error ? e.message : 'error desconocido'
    await logLookup(admin, {
      user_id: user.id, source: body.source, tool: body.tool, args: body.args ?? {},
      status: 'error', latency_ms: latency, error_msg: msg.slice(0, 500),
    })
    return json({ ok: false, error: msg }, 502)
  }

  const latency = Date.now() - t0
  const resultCount = countResults(result)

  // Cachear + log
  await Promise.all([
    writeCache(admin, body.source, cacheKey, body.tool, result),
    logLookup(admin, {
      user_id: user.id, source: body.source, tool: body.tool, args: body.args ?? {},
      status: 'ok', latency_ms: latency, result_count: resultCount,
    }),
  ])
  maybeGc(admin)  // opportunistic cleanup

  return json({ ok: true, source: body.source, tool: body.tool, cached: false, latency_ms: latency, result })
})

function countResults(result: unknown): number {
  if (!result || typeof result !== 'object') return 0
  const r = result as any
  if (Array.isArray(r.results)) return r.results.length
  if (typeof r.total === 'number') return r.total
  if (r.source_doc_id) return 1  // single doc
  return 0
}

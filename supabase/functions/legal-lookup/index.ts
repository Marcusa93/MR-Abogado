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
        result = await source.searchJurisprudencia(args)
        // Re-rank semántico opcional: el portal puede ordenar por fecha pero
        // no por relevancia. Pedimos embeddings y reordenamos por similitud.
        if (args.rerank === true && result && typeof result === 'object') {
          const r = result as any
          if (Array.isArray(r.results) && r.results.length > 1) {
            r.results = await rerankBySimilarity(args.query ?? '', r.results)
            if (args.top_n) r.results = r.results.slice(0, Number(args.top_n))
          }
        }
        break
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

// ── Re-rank con embeddings (opcional, costo ~$0.001 por búsqueda) ─────────
// Cuando se pide searchJurisprudencia con rerank: true, el portal puede
// devolver 50 resultados ordenados por fecha pero no por relevancia.
// Acá generamos embedding de la query + de cada sumario, y reordenamos por
// similitud cosine.
async function rerankBySimilarity(
  query: string,
  results: Array<{ resumen: string | null; caratula: string | null; [k: string]: unknown }>,
): Promise<typeof results> {
  if (results.length <= 1) return results
  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!openrouterKey) return results // sin key, mantenemos el orden original

  // Construir corpus a embebedar: query + caratula+sumario de cada resultado
  const inputs = [query.trim()]
  for (const r of results) {
    const text = `${r.caratula ?? ''}\n${r.resumen ?? ''}`.trim() || '(sin texto)'
    inputs.push(text.slice(0, 2000)) // truncado defensivo
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openrouterKey}`,
        'HTTP-Referer': 'https://app.marcorossi.com.ar',
        'X-Title': 'MR Abogado legal-lookup re-rank',
      },
      body: JSON.stringify({ model: 'openai/text-embedding-3-small', input: inputs }),
    })
    if (!res.ok) return results
    const data = await res.json() as { data?: Array<{ embedding: number[]; index: number }> }
    const embeddings = (data.data ?? []).sort((a, b) => a.index - b.index).map(d => d.embedding)
    if (embeddings.length !== inputs.length) return results

    const queryEmb = embeddings[0]
    const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0)
    const norm = (a: number[]) => Math.sqrt(a.reduce((s, x) => s + x * x, 0))
    const queryNorm = norm(queryEmb)

    const scored = results.map((r, i) => {
      const docEmb = embeddings[i + 1]
      const sim = dot(queryEmb, docEmb) / (queryNorm * norm(docEmb) || 1)
      return { ...r, score: Number(sim.toFixed(4)) }
    })
    scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    return scored
  } catch {
    return results
  }
}

function countResults(result: unknown): number {
  if (!result || typeof result !== 'object') return 0
  const r = result as any
  if (Array.isArray(r.results)) return r.results.length
  if (typeof r.total === 'number') return r.total
  if (r.source_doc_id) return 1  // single doc
  return 0
}

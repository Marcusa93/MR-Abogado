// ─────────────────────────────────────────────────────────────────────────
// Edge function: match-jurisprudencia
//
// RAG semántico sobre el corpus propio del usuario. Recibe query libre,
// genera embedding, llama al RPC match_jurisprudencia_chunks y devuelve
// los top-N fragmentos relevantes con score.
//
// Body: { query: string, limit?: number, seccion?: 'considerandos'|'resuelve'|'encabezado'|'cualquiera' }
// Response: { ok: true, results: Array<{...}> }
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1'
const EMBEDDING_MODEL = 'openai/text-embedding-3-small'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const openrouterKey = Deno.env.get('OPENROUTER_API_KEY')!

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function embedQuery(query: string): Promise<number[]> {
  const res = await fetch(`${OPENROUTER_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openrouterKey}`,
      'HTTP-Referer': 'https://app.marcorossi.com.ar',
      'X-Title': 'MR Abogado Jurisprudencia RAG',
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: [query] }),
  })
  if (!res.ok) throw new Error(`embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json() as { data?: Array<{ embedding: number[] }> }
  const emb = data.data?.[0]?.embedding
  if (!emb) throw new Error('embedding vacío')
  return emb
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ ok: false, error: 'No autorizado' }, 401)

  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return json({ ok: false, error: 'Token inválido' }, 401)

  const body = await req.json().catch(() => null) as {
    query?: string; limit?: number; seccion?: string
  } | null
  if (!body || !body.query || body.query.trim().length < 3) {
    return json({ ok: false, error: 'query muy corta (min 3 chars)' }, 400)
  }

  try {
    const admin = createClient(supabaseUrl, serviceKey)
    const limit = Math.min(Math.max(body.limit ?? 5, 1), 20)
    const seccion = body.seccion ?? 'cualquiera'

    const emb = await embedQuery(body.query.trim())
    const { data: chunks, error } = await (admin.rpc as any)('match_jurisprudencia_chunks', {
      query_embedding: emb,
      filter_user_id: user.id,
      match_count: limit * 2,
    })
    if (error) return json({ ok: false, error: `RAG falló: ${error.message}` }, 500)

    let rows = (chunks ?? []) as Array<{
      chunk_id: number; documento_id: string; contenido: string;
      metadata: { seccion?: string; caratula?: string; tribunal?: string; fecha?: string };
      score: number;
    }>
    if (seccion !== 'cualquiera') {
      rows = rows.filter(r => r.metadata?.seccion === seccion)
    }
    rows = rows.slice(0, limit)

    return json({
      ok: true,
      count: rows.length,
      results: rows.map(r => ({
        chunk_id: r.chunk_id,
        documento_id: r.documento_id,
        caratula: r.metadata?.caratula ?? null,
        tribunal: r.metadata?.tribunal ?? null,
        fecha: r.metadata?.fecha ?? null,
        seccion: r.metadata?.seccion ?? 'otro',
        score: Number(r.score.toFixed(4)),
        fragmento: r.contenido,
      })),
    })
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'búsqueda falló' }, 500)
  }
})

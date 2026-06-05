// Búsqueda semántica cross-audiencias.
// Body: { query: string, limit?: number, expediente_id?: string }
// Returns: { results: [{ transcript_id, expediente_id, expediente_caratula,
//             expediente_numero, transcript_at, top_score, snippets: [...] }] }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1'
const EMBEDDING_MODEL = 'openai/text-embedding-3-small'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function embedQuery(input: string, apiKey: string): Promise<number[]> {
  const res = await fetch(`${OPENROUTER_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://app.marcorossi.com.ar',
      'X-Title': 'MR Abogado Audiencias Search',
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: [input] }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`OpenRouter embeddings ${res.status}: ${txt.slice(0, 200)}`)
  }
  const payload = await res.json() as { data: { embedding: number[] }[] }
  return payload.data[0].embedding
}

interface MatchRow {
  chunk_id: number
  transcript_id: string
  expediente_id: string
  chunk_index: number
  content: string
  score: number
}

interface TranscriptHit {
  transcript_id: string
  expediente_id: string
  expediente_caratula: string | null
  expediente_numero: string | null
  transcript_at: string | null
  audio_filename: string | null
  top_score: number
  snippets: { chunk_index: number; content: string; score: number }[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const apiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!apiKey) return json({ error: 'OPENROUTER_API_KEY no configurada' }, 500)

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) return json({ error: 'No autorizado' }, 401)

    const body = await req.json().catch(() => null) as
      | { query?: string; limit?: number; expediente_id?: string }
      | null
    const query = typeof body?.query === 'string' ? body.query.trim() : ''
    if (!query) return json({ error: 'Falta query' }, 400)
    if (query.length > 500) return json({ error: 'Query demasiado larga (máx 500 caracteres).' }, 400)

    const matchCount = Math.min(Math.max(body?.limit ?? 24, 1), 50)
    const filterExpedienteId = body?.expediente_id ?? null

    const queryEmbedding = await embedQuery(query, apiKey)

    const { data: matches, error: rpcErr } = await anonClient.rpc('match_audiencia_transcripts', {
      query_embedding: queryEmbedding,
      match_count: matchCount,
      filter_expediente_id: filterExpedienteId,
    })
    if (rpcErr) throw rpcErr

    const rows = (matches ?? []) as MatchRow[]
    if (rows.length === 0) {
      return json({ results: [] })
    }

    // Enriquezco con metadata de cada transcript (caratula, fecha)
    const transcriptIds = [...new Set(rows.map(r => r.transcript_id))]
    const { data: meta, error: metaErr } = await anonClient
      .from('audiencia_transcripts')
      .select('id, transcript_at, audio_filename, expedientes!inner(numero, caratula)')
      .in('id', transcriptIds)
    if (metaErr) throw metaErr

    const metaMap = new Map<string, {
      transcript_at: string | null
      audio_filename: string | null
      caratula: string | null
      numero: string | null
    }>()
    for (const m of (meta ?? []) as unknown as {
      id: string
      transcript_at: string | null
      audio_filename: string | null
      expedientes: { numero: string | null; caratula: string | null } | { numero: string | null; caratula: string | null }[]
    }[]) {
      const exp = Array.isArray(m.expedientes) ? m.expedientes[0] : m.expedientes
      metaMap.set(m.id, {
        transcript_at: m.transcript_at,
        audio_filename: m.audio_filename,
        caratula: exp?.caratula ?? null,
        numero: exp?.numero ?? null,
      })
    }

    // Agrupo por transcript, ordeno snippets por score desc, cap 3 por transcript
    const byTranscript = new Map<string, TranscriptHit>()
    for (const r of rows) {
      const m = metaMap.get(r.transcript_id)
      if (!byTranscript.has(r.transcript_id)) {
        byTranscript.set(r.transcript_id, {
          transcript_id: r.transcript_id,
          expediente_id: r.expediente_id,
          expediente_caratula: m?.caratula ?? null,
          expediente_numero: m?.numero ?? null,
          transcript_at: m?.transcript_at ?? null,
          audio_filename: m?.audio_filename ?? null,
          top_score: r.score,
          snippets: [],
        })
      }
      const hit = byTranscript.get(r.transcript_id)!
      hit.snippets.push({ chunk_index: r.chunk_index, content: r.content, score: r.score })
      if (r.score > hit.top_score) hit.top_score = r.score
    }

    const results = [...byTranscript.values()]
      .map(h => ({
        ...h,
        snippets: h.snippets.sort((a, b) => b.score - a.score).slice(0, 3),
      }))
      .sort((a, b) => b.top_score - a.top_score)

    return json({ results })

  } catch (err) {
    console.error('[audiencias-transcripts-search]', err)
    return json({ error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

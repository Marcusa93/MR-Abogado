// Búsqueda global unificada (CMD+K).
// Body: { query: string, limit_per_group?: number }
// Returns: { expedientes, clientes, normativa, jurisprudencia, audiencias, adjuntos }
//
// Estrategia:
// - Embed query 1 vez (si tiene ≥4 chars).
// - Lexical en paralelo: expedientes (carátula, número, número_sae), clientes (nombre, apellido, dni, cuil).
// - Semantic en paralelo: 4 RPCs (normativa, jurisprudencia, audiencias, adjuntos).
// - Devuelve hasta N por grupo (default 5). Si el query es muy corto, no corre semantic.

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
      'X-Title': 'MR Abogado Global Search',
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: [input] }),
  })
  if (!res.ok) throw new Error(`OpenRouter embeddings ${res.status}`)
  const payload = await res.json() as { data: { embedding: number[] }[] }
  return payload.data[0].embedding
}

function truncate(s: string, max = 220): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

interface ExpedienteHit { id: string; numero: string | null; caratula: string | null; cliente_label: string | null; estado: string | null }
interface ClienteHit { id: string; nombre: string; apellido: string; dni: string | null; cuil: string | null }
interface ChunkHit { chunk_id: number | string; score: number; snippet: string; meta: Record<string, unknown> }

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

    const body = await req.json().catch(() => null) as { query?: string; limit_per_group?: number } | null
    const query = typeof body?.query === 'string' ? body.query.trim() : ''
    if (!query) return json({ error: 'Falta query' }, 400)
    if (query.length > 300) return json({ error: 'Query demasiado larga' }, 400)

    const limit = Math.min(Math.max(body?.limit_per_group ?? 5, 1), 12)
    const runSemantic = query.length >= 4

    const ilikePattern = `%${query.replace(/[%_]/g, '\\$&')}%`
    const digitsOnly = query.replace(/\D+/g, '')

    // ── Lexical en paralelo ───────────────────────────────────────────────
    const expedientesP = anonClient
      .from('expedientes')
      .select('id, numero, numero_sae, caratula, estado_interno, clientes(nombre, apellido)')
      .or(`caratula.ilike.${ilikePattern},numero.ilike.${ilikePattern}${digitsOnly.length >= 3 ? `,numero_sae.ilike.%${digitsOnly}%` : ''}`)
      .is('deleted_at', null)
      .limit(limit)

    const clientesQuery = (() => {
      const filters = [`nombre.ilike.${ilikePattern}`, `apellido.ilike.${ilikePattern}`]
      if (digitsOnly.length >= 6) {
        filters.push(`dni.ilike.%${digitsOnly}%`, `cuil.ilike.%${digitsOnly}%`)
      }
      return anonClient
        .from('clientes')
        .select('id, nombre, apellido, dni, cuil')
        .or(filters.join(','))
        .is('deleted_at', null)
        .limit(limit)
    })()

    // ── Semantic en paralelo (si vale la pena) ────────────────────────────
    let embedding: number[] | null = null
    if (runSemantic) {
      try {
        embedding = await embedQuery(query, apiKey)
      } catch (err) {
        console.warn('[global-search] embed falló', err)
      }
    }

    const semanticPromises = embedding ? {
      normativa: anonClient.rpc('match_normativa_chunks', {
        query_embedding: embedding,
        filter_user_id: user.id,
        match_count: limit,
      }),
      jurisprudencia: anonClient.rpc('match_jurisprudencia_chunks', {
        query_embedding: embedding,
        filter_user_id: user.id,
        match_count: limit,
      }),
      audiencias: anonClient.rpc('match_audiencia_transcripts', {
        query_embedding: embedding,
        match_count: limit,
        filter_expediente_id: null,
      }),
      adjuntos: anonClient.rpc('match_adjunto_chunks', {
        query_embedding: embedding,
        match_count: limit,
        exclude_expediente_id: null,
        filter_tipos_documento: null,
        min_score: 0.3,
      }),
    } : null

    const [expedientesRes, clientesRes, normRes, jurisRes, audRes, adjRes] = await Promise.all([
      expedientesP,
      clientesQuery,
      semanticPromises?.normativa ?? Promise.resolve({ data: null, error: null }),
      semanticPromises?.jurisprudencia ?? Promise.resolve({ data: null, error: null }),
      semanticPromises?.audiencias ?? Promise.resolve({ data: null, error: null }),
      semanticPromises?.adjuntos ?? Promise.resolve({ data: null, error: null }),
    ])

    // ── Format ───────────────────────────────────────────────────────────
    const expedientes: ExpedienteHit[] = (expedientesRes.data ?? []).map((e: {
      id: string; numero: string | null; caratula: string | null; estado_interno: string | null
      clientes: { nombre: string | null; apellido: string | null } | { nombre: string | null; apellido: string | null }[] | null
    }) => {
      const c = Array.isArray(e.clientes) ? e.clientes[0] : e.clientes
      return {
        id: e.id,
        numero: e.numero,
        caratula: e.caratula,
        cliente_label: c ? [c.apellido, c.nombre].filter(Boolean).join(', ') : null,
        estado: e.estado_interno,
      }
    })

    const clientes: ClienteHit[] = (clientesRes.data ?? []) as ClienteHit[]

    const normativa: ChunkHit[] = (normRes.data ?? []).map((r: {
      chunk_id: number; documento_id: string; contenido: string; metadata: Record<string, unknown>; score: number
    }) => ({
      chunk_id: r.chunk_id,
      score: r.score,
      snippet: truncate(r.contenido),
      meta: { documento_id: r.documento_id, ...r.metadata },
    }))

    const jurisprudencia: ChunkHit[] = (jurisRes.data ?? []).map((r: {
      chunk_id: number; documento_id: string; contenido: string; metadata: Record<string, unknown>; score: number
    }) => ({
      chunk_id: r.chunk_id,
      score: r.score,
      snippet: truncate(r.contenido),
      meta: { documento_id: r.documento_id, ...r.metadata },
    }))

    // Para audiencias y adjuntos hay que enriquecer con metadata de expedientes
    const audRaw = (audRes.data ?? []) as {
      chunk_id: number; transcript_id: string; expediente_id: string; content: string; score: number
    }[]
    const adjRaw = (adjRes.data ?? []) as {
      chunk_id: number; adjunto_id: string; expediente_id: string; content: string; score: number; tipo_documento: string | null
    }[]

    const expIdsToFetch = [...new Set([
      ...audRaw.map(r => r.expediente_id),
      ...adjRaw.map(r => r.expediente_id),
    ])]
    const expMetaMap = new Map<string, { numero: string | null; caratula: string | null }>()
    if (expIdsToFetch.length > 0) {
      const { data: expMeta } = await anonClient
        .from('expedientes')
        .select('id, numero, caratula')
        .in('id', expIdsToFetch)
      for (const e of (expMeta ?? []) as { id: string; numero: string | null; caratula: string | null }[]) {
        expMetaMap.set(e.id, { numero: e.numero, caratula: e.caratula })
      }
    }

    const audiencias: ChunkHit[] = audRaw.map(r => {
      const m = expMetaMap.get(r.expediente_id)
      return {
        chunk_id: r.chunk_id,
        score: r.score,
        snippet: truncate(r.content),
        meta: {
          transcript_id: r.transcript_id,
          expediente_id: r.expediente_id,
          expediente_caratula: m?.caratula ?? null,
          expediente_numero: m?.numero ?? null,
        },
      }
    })

    const adjuntos: ChunkHit[] = adjRaw.map(r => {
      const m = expMetaMap.get(r.expediente_id)
      return {
        chunk_id: r.chunk_id,
        score: r.score,
        snippet: truncate(r.content),
        meta: {
          adjunto_id: r.adjunto_id,
          expediente_id: r.expediente_id,
          tipo_documento: r.tipo_documento,
          expediente_caratula: m?.caratula ?? null,
          expediente_numero: m?.numero ?? null,
        },
      }
    })

    return json({
      query,
      semantic_used: Boolean(embedding),
      expedientes,
      clientes,
      normativa,
      jurisprudencia,
      audiencias,
      adjuntos,
    })

  } catch (err) {
    console.error('[global-search]', err)
    return json({ error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

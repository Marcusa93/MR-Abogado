// Cross-expediente: dado un expediente_id, encuentra otros expedientes del
// corpus del usuario con adjuntos semánticamente similares al de este.
//
// Body: { expediente_id: string, limit?: number, tipos?: string[] }
// Returns: { source_summaries: string[], results: [{ expediente_id, caratula,
//             numero, top_score, snippets: [...], rubros: [...], normativa: [...],
//             jurisprudencia: [...] }] }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1'
const EMBEDDING_MODEL = 'openai/text-embedding-3-small'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

async function embedQuery(input: string, apiKey: string): Promise<number[]> {
  const res = await fetch(`${OPENROUTER_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://app.marcorossi.com.ar',
      'X-Title': 'MR Abogado Expediente Similares',
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
  adjunto_id: string
  expediente_id: string
  tipo_documento: string | null
  categoria: string | null
  chunk_index: number
  content: string
  score: number
}

interface RubroExtracted {
  concepto: string
  monto: number | null
  moneda: 'ARS' | 'USD'
  fundamento?: string | null
}
interface NormaExtracted { norma: string; uso?: string | null }
interface JurisExtracted { cita: string; uso?: string | null }
interface AiExtracted {
  tipo_documento?: string
  rubros_reclamados?: RubroExtracted[]
  normativa_citada?: NormaExtracted[]
  jurisprudencia_citada?: JurisExtracted[]
  resultado?: string | null
}

interface ExpedienteHit {
  expediente_id: string
  caratula: string | null
  numero: string | null
  top_score: number
  matched_adjuntos: { adjunto_id: string; tipo_documento: string | null; ai_summary: string | null; ai_extracted: AiExtracted | null }[]
  snippets: { content: string; score: number }[]
}

// Categorías y tipos jurídicamente útiles para sugerir
const DEFAULT_TIPOS = ['demanda', 'contestacion', 'sentencia', 'resolucion', 'apelacion']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  try {
    const apiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!apiKey) return json(req, { error: 'OPENROUTER_API_KEY no configurada' }, 500)

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) return json(req, { error: 'No autorizado' }, 401)

    const body = await req.json().catch(() => null) as
      | { expediente_id?: string; limit?: number; tipos?: string[] }
      | null
    const expedienteId = body?.expediente_id
    if (!expedienteId) return json(req, { error: 'Falta expediente_id' }, 400)
    const limit = Math.min(Math.max(body?.limit ?? 5, 1), 15)
    const tipos = Array.isArray(body?.tipos) && body!.tipos!.length > 0 ? body!.tipos! : DEFAULT_TIPOS

    // Adjuntos analizados de este expediente con tipo útil
    const { data: sourceAdjuntos, error: sErr } = await anonClient
      .from('adjuntos')
      .select('id, nombre_archivo, categoria, ai_summary, ai_extracted, ai_full_text')
      .eq('expediente_id', expedienteId)
      .is('deleted_at', null)
      .not('ai_summary', 'is', null)
      .order('created_at', { ascending: false })
      .limit(8)
    if (sErr) throw sErr

    interface SourceAdj {
      id: string
      nombre_archivo: string
      categoria: string | null
      ai_summary: string | null
      ai_extracted: AiExtracted | null
      ai_full_text: string | null
    }

    const sources = (sourceAdjuntos ?? []) as SourceAdj[]
    const relevantSources = sources.filter((a) => {
      const tipo = (a.ai_extracted?.tipo_documento ?? '').toLowerCase()
      return tipos.includes(a.categoria ?? '') || tipos.includes(tipo)
    })

    if (relevantSources.length === 0) {
      return json(req, {
        source_summaries: [],
        results: [],
        message: 'Este expediente todavía no tiene adjuntos analizados (demanda/contestación/sentencia). Subí y analizá uno para que el sistema busque expedientes similares.',
      })
    }

    // Armar query desde el adjunto más reciente y relevante. Tomamos su
    // ai_summary + primer párrafo del ai_full_text para enriquecer.
    const seed = relevantSources[0]
    const queryParts: string[] = []
    if (seed.ai_summary?.trim()) queryParts.push(seed.ai_summary.trim())
    const objeto = seed.ai_extracted?.tipo_documento && typeof (seed.ai_extracted as { objeto?: string }).objeto === 'string'
      ? (seed.ai_extracted as { objeto?: string }).objeto
      : null
    if (objeto) queryParts.push(`Objeto: ${objeto}`)
    if (seed.ai_full_text) queryParts.push(seed.ai_full_text.slice(0, 1500))

    const queryText = queryParts.join('\n\n').trim()
    if (!queryText) return json(req, { error: 'No hay texto de referencia en este expediente.' }, 400)

    const queryEmbedding = await embedQuery(queryText, apiKey)

    const { data: matches, error: rpcErr } = await anonClient.rpc('match_adjunto_chunks', {
      query_embedding: queryEmbedding,
      match_count: limit * 6, // overpull para agregar bien por expediente
      exclude_expediente_id: expedienteId,
      filter_tipos_documento: tipos,
      min_score: 0.35,
    })
    if (rpcErr) throw rpcErr

    const rows = (matches ?? []) as MatchRow[]
    if (rows.length === 0) {
      return json(req, {
        source_summaries: relevantSources.slice(0, 3).map(s => s.ai_summary ?? ''),
        results: [],
        message: 'No encontré expedientes similares en tu corpus aún. A medida que subas y analices más demandas/sentencias, esta sección se va a ir poblando.',
      })
    }

    // Metadata de expedientes hit
    const hitExpedienteIds = [...new Set(rows.map(r => r.expediente_id))]
    const { data: expedientesMeta, error: emErr } = await anonClient
      .from('expedientes')
      .select('id, numero, caratula')
      .in('id', hitExpedienteIds)
    if (emErr) throw emErr
    const metaMap = new Map<string, { numero: string | null; caratula: string | null }>()
    for (const e of (expedientesMeta ?? []) as { id: string; numero: string | null; caratula: string | null }[]) {
      metaMap.set(e.id, { numero: e.numero, caratula: e.caratula })
    }

    // Adjuntos hit con ai_extracted
    const hitAdjuntoIds = [...new Set(rows.map(r => r.adjunto_id))]
    const { data: adjuntosMeta, error: amErr } = await anonClient
      .from('adjuntos')
      .select('id, ai_summary, ai_extracted')
      .in('id', hitAdjuntoIds)
    if (amErr) throw amErr
    interface AdjMeta { id: string; ai_summary: string | null; ai_extracted: AiExtracted | null }
    const adjMap = new Map<string, AdjMeta>()
    for (const a of (adjuntosMeta ?? []) as AdjMeta[]) {
      adjMap.set(a.id, a)
    }

    // Agrupo por expediente
    const byExpediente = new Map<string, ExpedienteHit>()
    for (const r of rows) {
      const meta = metaMap.get(r.expediente_id)
      if (!byExpediente.has(r.expediente_id)) {
        byExpediente.set(r.expediente_id, {
          expediente_id: r.expediente_id,
          caratula: meta?.caratula ?? null,
          numero: meta?.numero ?? null,
          top_score: r.score,
          matched_adjuntos: [],
          snippets: [],
        })
      }
      const hit = byExpediente.get(r.expediente_id)!
      if (r.score > hit.top_score) hit.top_score = r.score
      hit.snippets.push({ content: r.content, score: r.score })
      if (!hit.matched_adjuntos.find(m => m.adjunto_id === r.adjunto_id)) {
        const am = adjMap.get(r.adjunto_id)
        hit.matched_adjuntos.push({
          adjunto_id: r.adjunto_id,
          tipo_documento: r.tipo_documento,
          ai_summary: am?.ai_summary ?? null,
          ai_extracted: am?.ai_extracted ?? null,
        })
      }
    }

    const results = [...byExpediente.values()]
      .map(h => ({
        ...h,
        snippets: h.snippets.sort((a, b) => b.score - a.score).slice(0, 2),
      }))
      .sort((a, b) => b.top_score - a.top_score)
      .slice(0, limit)

    return json(req, {
      source_summaries: relevantSources.slice(0, 3).map(s => s.ai_summary ?? ''),
      results,
    })

  } catch (err) {
    console.error('[expediente-similares]', err)
    return json(req, { error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

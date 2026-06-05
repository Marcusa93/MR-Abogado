// Ingest: chunkea ai_full_text de un adjunto y persiste embeddings para
// búsqueda cross-expediente.
// Body: { adjunto_id: string }
// Returns: { success, chunks_created, adjunto_id }
//
// Idempotente: borra chunks viejos antes de reinsertar.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { chunkTranscript } from '../_shared/transcript-chunker.ts'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1'
const EMBEDDING_MODEL = 'openai/text-embedding-3-small'
const EMBEDDING_BATCH = 32

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function createEmbeddings(inputs: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch(`${OPENROUTER_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://app.marcorossi.com.ar',
      'X-Title': 'MR Abogado Adjuntos Ingest',
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: inputs }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`OpenRouter embeddings ${res.status}: ${txt.slice(0, 300)}`)
  }
  const payload = await res.json() as { data: { embedding: number[]; index: number }[] }
  return payload.data.sort((a, b) => a.index - b.index).map(d => d.embedding)
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

    const body = await req.json().catch(() => null) as { adjunto_id?: string } | null
    const adjuntoId = body?.adjunto_id
    if (!adjuntoId) return json({ error: 'Falta adjunto_id' }, 400)

    // RLS-aware fetch via anon client
    const { data: adj, error: adjErr } = await anonClient
      .from('adjuntos')
      .select('id, expediente_id, categoria, ai_full_text, ai_extracted')
      .eq('id', adjuntoId)
      .is('deleted_at', null)
      .maybeSingle()
    if (adjErr) throw adjErr
    if (!adj) return json({ error: 'Adjunto no encontrado o sin permisos.' }, 404)
    if (!adj.ai_full_text?.trim()) {
      return json({ error: 'Adjunto sin ai_full_text — analizalo con IA primero.' }, 400)
    }
    if (!adj.expediente_id) {
      return json({ error: 'Adjunto sin expediente_id — no se puede indexar.' }, 400)
    }

    const tipoDocumento = typeof (adj.ai_extracted as { tipo_documento?: string } | null)?.tipo_documento === 'string'
      ? (adj.ai_extracted as { tipo_documento?: string }).tipo_documento ?? null
      : null

    const chunks = chunkTranscript(adj.ai_full_text)
    if (chunks.length === 0) {
      return json({ success: true, chunks_created: 0, message: 'Texto vacío tras normalización.' })
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Idempotencia
    await serviceClient
      .from('adjunto_chunks')
      .delete()
      .eq('adjunto_id', adjuntoId)

    let inserted = 0
    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH) {
      const batch = chunks.slice(i, i + EMBEDDING_BATCH)
      const embeddings = await createEmbeddings(batch.map(c => c.content), apiKey)

      const rows = batch.map((c, j) => ({
        adjunto_id: adjuntoId,
        expediente_id: adj.expediente_id,
        categoria: adj.categoria,
        tipo_documento: tipoDocumento,
        chunk_index: c.index,
        content: c.content,
        embedding: embeddings[j],
      }))

      const { error: insErr } = await serviceClient
        .from('adjunto_chunks')
        .insert(rows)
      if (insErr) throw insErr
      inserted += rows.length
    }

    return json({ success: true, chunks_created: inserted, adjunto_id: adjuntoId })

  } catch (err) {
    console.error('[adjuntos-ingest]', err)
    return json({ error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

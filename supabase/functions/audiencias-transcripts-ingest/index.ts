// Ingest: chunkea un transcript y genera embeddings para búsqueda semántica.
// Body: { transcript_id: string }
// Returns: { success, chunks_created, transcript_id }
//
// Idempotente: borra chunks viejos antes de reinsertar (transcript modificado
// o reingesta manual).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { chunkTranscript } from '../_shared/transcript-chunker.ts'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1'
const EMBEDDING_MODEL = 'openai/text-embedding-3-small'
const EMBEDDING_BATCH = 32

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

async function createEmbeddings(inputs: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch(`${OPENROUTER_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://app.marcorossi.com.ar',
      'X-Title': 'MR Abogado Audiencias',
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

    const body = await req.json().catch(() => null) as { transcript_id?: string } | null
    const transcriptId = body?.transcript_id
    if (!transcriptId) return json(req, { error: 'Falta transcript_id' }, 400)

    // Autorizo vía anon client (respeta RLS de audiencia_transcripts)
    const { data: transcript, error: tErr } = await anonClient
      .from('audiencia_transcripts')
      .select('id, expediente_id, transcript, status')
      .eq('id', transcriptId)
      .maybeSingle()
    if (tErr) throw tErr
    if (!transcript) return json(req, { error: 'Transcript no encontrado o sin permisos.' }, 404)
    if (transcript.status !== 'completed' || !transcript.transcript?.trim()) {
      return json(req, { error: 'Transcript no completado o vacío.' }, 400)
    }

    const chunks = chunkTranscript(transcript.transcript)
    if (chunks.length === 0) {
      return json(req, { success: true, chunks_created: 0, message: 'Texto vacío tras normalización.' })
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Idempotencia: borro chunks viejos del transcript
    await serviceClient
      .from('audiencia_transcript_chunks')
      .delete()
      .eq('transcript_id', transcriptId)

    // Embeddings en batches
    let inserted = 0
    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH) {
      const batch = chunks.slice(i, i + EMBEDDING_BATCH)
      const embeddings = await createEmbeddings(batch.map(c => c.content), apiKey)

      const rows = batch.map((c, j) => ({
        transcript_id: transcriptId,
        expediente_id: transcript.expediente_id,
        chunk_index: c.index,
        content: c.content,
        embedding: embeddings[j],
      }))

      const { error: insErr } = await serviceClient
        .from('audiencia_transcript_chunks')
        .insert(rows)
      if (insErr) throw insErr
      inserted += rows.length
    }

    return json(req, { success: true, chunks_created: inserted, transcript_id: transcriptId })

  } catch (err) {
    console.error('[audiencias-transcripts-ingest]', err)
    return json(req, { error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

// Análisis IA de un adjunto (PDF subido). Frontend ya extrajo el texto.
// Body: { adjunto_id: string, document_text: string }
// Returns: { success, summary, extracted, model } o { error }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { analyzeAdjuntoWithAI } from '../_shared/adjunto-ai-analyzer.ts'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface AdjuntoRow {
  id: string
  expediente_id: string | null
  cliente_id: string | null
  nombre_archivo: string
  categoria: string | null
  ai_analyzed_at: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const apiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!apiKey) {
      return json({ error: 'OPENROUTER_API_KEY no configurada' }, 500)
    }

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) return json({ error: 'No autorizado' }, 401)

    const body = await req.json().catch(() => null) as
      | { adjunto_id?: string; document_text?: string; force?: boolean }
      | null
    const adjuntoId = body?.adjunto_id
    const documentText = typeof body?.document_text === 'string' ? body.document_text : ''
    if (!adjuntoId) return json({ error: 'Falta adjunto_id' }, 400)
    if (!documentText.trim()) return json({ error: 'Falta document_text (probable PDF escaneado).' }, 400)

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // RLS-aware fetch para autorización (anon client respeta can_view_expediente)
    const { data: ownedRows, error: ownedError } = await anonClient
      .from('adjuntos')
      .select('id, expediente_id, cliente_id, nombre_archivo, categoria, ai_analyzed_at')
      .eq('id', adjuntoId)
      .is('deleted_at', null)
      .maybeSingle()
    if (ownedError) throw ownedError
    if (!ownedRows) return json({ error: 'Adjunto no encontrado o sin permisos.' }, 404)

    const adj = ownedRows as AdjuntoRow

    // Idempotencia: si ya está analizado y no se forzó, devolver lo que hay.
    if (adj.ai_analyzed_at && !body?.force) {
      const { data: existing } = await serviceClient
        .from('adjuntos')
        .select('ai_summary, ai_extracted, ai_model')
        .eq('id', adjuntoId)
        .single()
      return json({
        success: true,
        cached: true,
        summary: existing?.ai_summary ?? '',
        extracted: existing?.ai_extracted ?? null,
        model: existing?.ai_model ?? null,
      })
    }

    try {
      const analysis = await analyzeAdjuntoWithAI({
        documentText,
        fileName: adj.nombre_archivo,
        categoria: adj.categoria,
        apiKey,
      })

      // Guardar texto solo si es manejable (< 500 KB)
      const fullTextToStore = documentText.length <= 500_000 ? documentText : null

      await serviceClient
        .from('adjuntos')
        .update({
          ai_full_text: fullTextToStore,
          ai_summary: analysis.summary,
          ai_extracted: analysis.extracted,
          ai_model: analysis.model,
          ai_token_usage: analysis.token_usage ?? null,
          ai_analyzed_at: new Date().toISOString(),
          ai_error: null,
        })
        .eq('id', adjuntoId)

      // Auto-trigger ingest para búsqueda cross-expediente + extracción de
      // aprendizaje si es sentencia. Fire-and-forget.
      if (fullTextToStore) {
        try {
          const projectUrl = Deno.env.get('SUPABASE_URL')!
          const authHeader = req.headers.get('Authorization') ?? ''
          fetch(`${projectUrl}/functions/v1/adjuntos-ingest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: authHeader },
            body: JSON.stringify({ adjunto_id: adjuntoId }),
          }).catch((err) => console.warn('[analyze-adjunto] ingest trigger falló', err))

          const tipo = (analysis.extracted as { tipo_documento?: string } | undefined)?.tipo_documento
          if (tipo === 'sentencia' || tipo === 'resolucion' || tipo === 'apelacion') {
            fetch(`${projectUrl}/functions/v1/extract-aprendizaje-sentencia`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: authHeader },
              body: JSON.stringify({ source: 'adjunto', source_id: adjuntoId }),
            }).catch((err) => console.warn('[analyze-adjunto] aprendizaje trigger falló', err))

            // Marca brief pendiente — entró documento jurídico clave
            if (adj.expediente_id) {
              serviceClient.rpc('marcar_brief_pendiente', {
                p_expediente_id: adj.expediente_id,
                p_kind: `adjunto_${tipo}`,
                p_ref: adjuntoId,
              }).then(() => undefined).catch((err: unknown) =>
                console.warn('[analyze-adjunto] marcar_brief_pendiente falló', err))
            }
          }
        } catch (err) {
          console.warn('[analyze-adjunto] no se pudieron disparar triggers', err)
        }
      }

      return json({
        success: true,
        cached: false,
        summary: analysis.summary,
        extracted: analysis.extracted,
        model: analysis.model,
        token_usage: analysis.token_usage,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error IA desconocido'
      console.error('[analyze-adjunto]', adjuntoId, msg)
      await serviceClient
        .from('adjuntos')
        .update({
          ai_error: msg.slice(0, 500),
          ai_analyzed_at: new Date().toISOString(),
        })
        .eq('id', adjuntoId)
      return json({ success: false, error: msg }, 502)
    }

  } catch (err) {
    console.error('[analyze-adjunto] fatal', err)
    return json({ error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

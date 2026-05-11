// On-demand AI analysis for one or many SAE movements.
// Body: { movement_ids: string[] }  (or single { movement_id: string })
// Returns: { results: [{ id, success, summary?, error? }], analyzed, failed }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { analyzeMovementWithAI, shouldAnalyzeMovement } from '../_shared/sae-ai-analyzer.ts'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface MovementRow {
  id: string
  expediente_id: string
  titulo: string
  cuerpo: string | null
  tipo_movimiento: string
  fecha: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const apiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!apiKey) {
      return json({ error: 'OPENROUTER_API_KEY no está configurada en Edge Functions secrets.' }, 500)
    }

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) return json({ error: 'No autorizado' }, 401)

    const body = await req.json().catch(() => null) as
      | {
          movement_id?: string
          movement_ids?: string[]
          /** Texto extraído de PDFs adjuntos. Solo aplicable si se manda un movement_id (no múltiples). */
          document_text?: string
          /** Nombres de los archivos para contexto al LLM. */
          document_file_names?: string[]
        }
      | null
    const ids = Array.isArray(body?.movement_ids)
      ? body!.movement_ids
      : body?.movement_id
        ? [body.movement_id]
        : []
    if (!ids.length) return json({ error: 'Especificá movement_id o movement_ids.' }, 400)
    if (ids.length > 25) return json({ error: 'Máximo 25 actuaciones por llamada.' }, 400)

    const documentText = typeof body?.document_text === 'string' ? body.document_text.trim() : undefined
    const documentFileNames = Array.isArray(body?.document_file_names) ? body.document_file_names.filter((s): s is string => typeof s === 'string') : undefined
    if (documentText && ids.length > 1) {
      return json({ error: 'document_text solo se acepta con un único movement_id.' }, 400)
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Fetch movements (RLS-bypassing service role) — verify ownership separately
    const { data: movements, error: fetchError } = await serviceClient
      .from('sae_movements')
      .select('id, expediente_id, titulo, cuerpo, tipo_movimiento, fecha')
      .in('id', ids)
    if (fetchError) throw fetchError
    if (!movements || movements.length === 0) return json({ error: 'No se encontraron las actuaciones.' }, 404)

    // Authorization: ensure the user owns (or is member of) every expediente involved
    const expedienteIds = [...new Set(movements.map((m: MovementRow) => m.expediente_id))]
    const { data: ownedExps, error: ownedError } = await anonClient
      .from('expedientes')
      .select('id')
      .in('id', expedienteIds)
    if (ownedError) throw ownedError
    const ownedSet = new Set((ownedExps ?? []).map((e: { id: string }) => e.id))
    const allowedMovements = (movements as MovementRow[]).filter(m => ownedSet.has(m.expediente_id))
    if (allowedMovements.length !== movements.length) {
      return json({ error: 'No tenés permiso sobre alguna de las actuaciones.' }, 403)
    }

    const results: { id: string; success: boolean; summary?: string; error?: string; skipped?: boolean }[] = []

    await Promise.all(allowedMovements.map(async (m) => {
      // Si el usuario mandó document_text explícito, salteamos el filtro
      // (es un click manual sobre una actuación que sí quiere analizar).
      if (!documentText && !shouldAnalyzeMovement(m.tipo_movimiento, m.titulo, m.cuerpo)) {
        results.push({ id: m.id, success: false, skipped: true, error: 'Tipo de actuación filtrado (puro trámite administrativo).' })
        return
      }
      try {
        const analysis = await analyzeMovementWithAI({
          titulo: m.titulo,
          cuerpo: m.cuerpo,
          tipo_movimiento: m.tipo_movimiento,
          fecha: m.fecha,
          apiKey,
          documentText,
          documentFileNames,
        })
        await serviceClient
          .from('sae_movements')
          .update({
            ai_summary: analysis.summary,
            ai_extracted: analysis.extracted,
            ai_suggested_action: analysis.suggested_action,
            ai_model: analysis.model,
            ai_analyzed_at: new Date().toISOString(),
            ai_error: null,
          })
          .eq('id', m.id)
        results.push({ id: m.id, success: true, summary: analysis.summary })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error IA desconocido'
        console.error('[sae-analyze-movement]', m.id, msg)
        await serviceClient
          .from('sae_movements')
          .update({ ai_error: msg.slice(0, 500), ai_analyzed_at: new Date().toISOString() })
          .eq('id', m.id)
        results.push({ id: m.id, success: false, error: msg })
      }
    }))

    const analyzed = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success && !r.skipped).length
    const skipped = results.filter(r => r.skipped).length

    return json({ results, analyzed, failed, skipped })

  } catch (err) {
    console.error('[sae-analyze-movement]', err)
    return json({ error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

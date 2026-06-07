// Extrae aprendizaje de una sentencia y lo persiste en aprendizajes_rulebook.
// Body: { source: 'adjunto'|'movement', source_id: string }
// Returns: { success, aprendizaje_id, cached?: boolean } o { error }
//
// Idempotente: si ya existe un aprendizaje con la misma fuente, devuelve cached.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { extractAprendizajeSentencia, aprendizajeToContenido } from '../_shared/aprendizaje-sentencia-analyzer.ts'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

interface AdjuntoSource {
  id: string
  nombre_archivo: string
  expediente_id: string | null
  ai_full_text: string | null
  ai_extracted: { tipo_documento?: string } | null
}

interface MovementSource {
  id: string
  titulo: string
  cuerpo: string | null
  tipo_movimiento: string
  expediente_id: string
  fecha: string
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

    const body = await req.json().catch(() => null) as
      | { source?: string; source_id?: string; force?: boolean }
      | null
    const source = body?.source
    const sourceId = body?.source_id
    if (source !== 'adjunto' && source !== 'movement') {
      return json(req, { error: 'source debe ser "adjunto" o "movement"' }, 400)
    }
    if (!sourceId) return json(req, { error: 'Falta source_id' }, 400)

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Idempotencia: ¿ya hay un aprendizaje con esta fuente?
    if (!body?.force) {
      const { data: existing } = await serviceClient
        .from('aprendizajes_rulebook')
        .select('id, contenido_estructurado')
        .eq('owner_id', user.id)
        .eq('is_active', true)
        .filter('contenido_estructurado->source->>type', 'eq', source)
        .filter('contenido_estructurado->source->>id', 'eq', sourceId)
        .maybeSingle()
      if (existing?.id) {
        return json(req, { success: true, cached: true, aprendizaje_id: existing.id })
      }
    }

    // Cargar texto + contexto según fuente
    let documentText = ''
    let contextLabel = ''
    let expedienteId: string | null = null

    if (source === 'adjunto') {
      const { data: adj, error: adjErr } = await anonClient
        .from('adjuntos')
        .select('id, nombre_archivo, expediente_id, ai_full_text, ai_extracted')
        .eq('id', sourceId)
        .is('deleted_at', null)
        .maybeSingle()
      if (adjErr) throw adjErr
      if (!adj) return json(req, { error: 'Adjunto no encontrado o sin permisos' }, 404)
      const a = adj as AdjuntoSource
      if (!a.ai_full_text?.trim()) {
        return json(req, { error: 'Adjunto sin texto. Analizalo con IA primero.' }, 400)
      }
      const tipo = a.ai_extracted?.tipo_documento ?? ''
      if (!['sentencia', 'resolucion', 'apelacion'].includes(tipo)) {
        return json(req, { error: `Tipo "${tipo}" no aplica para extraer aprendizaje (solo sentencia/resolución/apelación).` }, 400)
      }
      documentText = a.ai_full_text
      contextLabel = `${tipo.charAt(0).toUpperCase()}${tipo.slice(1)} — ${a.nombre_archivo}`
      expedienteId = a.expediente_id
    } else {
      const { data: m, error: mErr } = await anonClient
        .from('sae_movements')
        .select('id, titulo, cuerpo, tipo_movimiento, expediente_id, fecha')
        .eq('id', sourceId)
        .maybeSingle()
      if (mErr) throw mErr
      if (!m) return json(req, { error: 'Actuación no encontrada o sin permisos' }, 404)
      const mv = m as MovementSource
      if (!['sentencia', 'decreto'].includes(mv.tipo_movimiento)) {
        return json(req, { error: `Tipo "${mv.tipo_movimiento}" no aplica.` }, 400)
      }
      const cuerpo = mv.cuerpo?.trim() ?? ''
      if (cuerpo.length < 200) {
        return json(req, { error: 'Actuación sin cuerpo suficiente para extraer aprendizaje.' }, 400)
      }
      documentText = `${mv.titulo}\n\n${cuerpo}`
      contextLabel = `${mv.titulo} — ${mv.fecha}`
      expedienteId = mv.expediente_id
    }

    if (!expedienteId) {
      return json(req, { error: 'Fuente sin expediente_id.' }, 400)
    }

    // Llamar al analizador
    const aprendizaje = await extractAprendizajeSentencia({
      documentText,
      contextLabel,
      apiKey,
    })

    if (!aprendizaje.takeaway_para_proximo_caso?.trim() && aprendizaje.hizo_lugar.length === 0 && aprendizaje.rechazo.length === 0) {
      return json(req, { success: false, error: 'No se pudieron extraer aprendizajes accionables del texto.' }, 422)
    }

    // Persistir en aprendizajes_rulebook
    const targetKind = aprendizaje.juez_identificado ? 'juez'
      : aprendizaje.organismo_identificado ? 'organismo'
      : 'general'
    const targetRefText = aprendizaje.juez_identificado || aprendizaje.organismo_identificado || null

    const contenidoNarrativo = aprendizajeToContenido(aprendizaje, contextLabel)

    const { data: inserted, error: insErr } = await serviceClient
      .from('aprendizajes_rulebook')
      .insert({
        scope: 'personal',
        owner_id: user.id,
        target_kind: targetKind,
        target_ref_text: targetRefText,
        contenido: contenidoNarrativo,
        contenido_estructurado: {
          ...aprendizaje,
          source: {
            type: source,
            id: sourceId,
            expediente_id: expedienteId,
            extracted_at: new Date().toISOString(),
            auto: true,
          },
        },
        confidence: aprendizaje.confidence,
        observed_in_cases: 1,
        is_active: true,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (insErr) throw insErr

    return json(req, {
      success: true,
      cached: false,
      aprendizaje_id: inserted.id,
      summary: aprendizaje.resumen_resolucion,
      takeaway: aprendizaje.takeaway_para_proximo_caso,
    })

  } catch (err) {
    console.error('[extract-aprendizaje-sentencia]', err)
    return json(req, { error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

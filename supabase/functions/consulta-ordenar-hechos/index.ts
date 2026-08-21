// Ordena cronológicamente los hechos de una consulta con IA y sugiere preguntas.
// Luego asigna la consulta al usuario CRITERIO (Claudio) para su intervención.
// LLM-guarded, requiere auth.

import { corsHeaders } from '../_shared/cors.ts'
import { checkLlmGuard, logLlmCall, estimateBytes } from '../_shared/llm-guard.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FUNCTION_NAME = 'consulta-ordenar-hechos'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  try {
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) return json(req, { error: 'No autorizado' }, 401)

    const body = await req.json().catch(() => null) as { consulta_id?: string } | null
    if (!body?.consulta_id) return json(req, { error: 'consulta_id requerido' }, 400)

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Obtener consulta (RLS via anonClient para verificar permisos)
    const { data: consulta, error: consultaErr } = await anonClient
      .from('consultas' as any)
      .select('id, nombre, apellido, tipo_asunto, notas_libres, areas_derecho, assigned_to')
      .eq('id', body.consulta_id)
      .single()
    if (consultaErr || !consulta) return json(req, { error: 'Consulta no encontrada o sin permisos' }, 404)

    const notas = (consulta as any).notas_libres ?? ''
    if (!notas.trim()) return json(req, { error: 'No hay hechos del caso para ordenar' }, 400)

    const inputBytes = estimateBytes(notas)
    const guard = await checkLlmGuard(serviceClient, user.id, FUNCTION_NAME, inputBytes)
    if (!guard.ok) return json(req, { error: guard.error }, guard.status)

    const openrouterKey = Deno.env.get('OPENROUTER_API_KEY') ?? ''
    if (!openrouterKey) return json(req, { error: 'Configuración LLM faltante' }, 500)

    const clienteLabel = [(consulta as any).apellido, (consulta as any).nombre].filter(Boolean).join(', ')
    const tipoAsunto = (consulta as any).tipo_asunto ?? 'otro'
    const areas: string[] = (consulta as any).areas_derecho ?? [tipoAsunto]

    // Documentación adjunta analizada — enriquece los hechos con evidencia documental
    let documentalCtx = ''
    const { data: adjuntos } = await serviceClient
      .from('adjuntos' as any)
      .select('nombre_archivo, ai_summary, ai_extracted')
      .eq('consulta_id', body.consulta_id)
      .not('ai_analyzed_at', 'is', null)
      .is('ai_error', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
    if (adjuntos && (adjuntos as any[]).length > 0) {
      const bloques = (adjuntos as any[]).map(adj => {
        const ext = adj.ai_extracted as any
        const lineas: string[] = [`### ${adj.nombre_archivo}${ext?.tipo_documento ? ` (${ext.tipo_documento})` : ''}`]
        if (adj.ai_summary) lineas.push(adj.ai_summary)
        if (ext?.objeto) lineas.push(`Objeto: ${ext.objeto}`)
        if (Array.isArray(ext?.hechos_clave) && ext.hechos_clave.length > 0) {
          lineas.push('Hechos documentados:')
          ext.hechos_clave.forEach((h: string) => lineas.push(`- ${h}`))
        }
        return lineas.join('\n')
      })
      documentalCtx = `\n\n## Documentación adjunta (analizada por IA)\n${bloques.join('\n\n')}`
    }

    const systemPrompt = `Sos un abogado del Estudio Jurídico Dr. Marco Rossi, Tucumán, Argentina.
Tu tarea es analizar los hechos relatados en una consulta inicial y:
1. Reorganizarlos en orden cronológico claro, redactándolos en forma de relato jurídico estructurado.
2. Si hay documentación adjunta analizada, integrar y contrastar con lo relatado: incorporar hechos documentados, señalar inconsistencias o datos adicionales que surjan de los documentos.
3. Identificar y sugerir preguntas adicionales que habría que hacerle al cliente para completar el caso.

Área(s) del derecho involucrada(s): ${areas.join(', ')}.
Foro: Tucumán, Argentina.

Devolvé ÚNICAMENTE un objeto JSON válido (sin markdown, sin texto extra) con esta estructura:
{
  "hechos_ordenados": "string — relato cronológico y jurídicamente estructurado de los hechos, integrando relato del cliente y evidencia documental. Máximo 1500 palabras.",
  "preguntas_sugeridas": ["string", "string", ...] — lista de 3 a 8 preguntas concretas que quedan sin responder y son relevantes para el caso
}`

    const userPrompt = `Cliente: ${clienteLabel}
Tipo de asunto: ${tipoAsunto}

HECHOS RELATADOS POR EL CLIENTE:
${notas}${documentalCtx}`

    const llmRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://mrabogado.com.ar',
        'X-Title': 'MR Abogado',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 2000,
        temperature: 0.3,
      }),
    })

    if (!llmRes.ok) {
      const errText = await llmRes.text()
      console.error('[consulta-ordenar-hechos] LLM error:', llmRes.status, errText)
      return json(req, { error: 'Error al llamar al LLM' }, 502)
    }

    const llmData = await llmRes.json()
    const content = llmData.choices?.[0]?.message?.content ?? ''

    let parsed: { hechos_ordenados: string; preguntas_sugeridas: string[] }
    try {
      let cleaned = content.trim()
      // Estrategia 1: extraer el bloque ```json ... ``` si existe (en cualquier posición)
      const codeBlock = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
      if (codeBlock) {
        cleaned = codeBlock[1].trim()
      } else {
        // Estrategia 2: buscar el primer objeto JSON { ... } en la respuesta
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
        if (jsonMatch) cleaned = jsonMatch[0]
      }
      parsed = JSON.parse(cleaned)
    } catch {
      console.error('[consulta-ordenar-hechos] parse error, len:', content.length, 'preview:', content.slice(0, 300))
      return json(req, { error: 'No se pudo interpretar la respuesta del LLM. Intentá de nuevo.' }, 502)
    }

    if (!parsed.hechos_ordenados || !Array.isArray(parsed.preguntas_sugeridas)) {
      return json(req, { error: 'Respuesta del LLM con estructura incorrecta' }, 502)
    }

    // Buscar usuario con rol CRITERIO para asignar
    const { data: criterioUser } = await serviceClient
      .from('profiles' as any)
      .select('id')
      .eq('rol', 'CRITERIO')
      .eq('activo', true)
      .limit(1)
      .maybeSingle()

    const now = new Date().toISOString()
    const updatePayload: Record<string, unknown> = {
      hechos_ordenados: parsed.hechos_ordenados,
      preguntas_sugeridas: parsed.preguntas_sugeridas,
      hechos_ordenados_at: now,
      estado: 'con_claudio',
      estado_changed_at: now,
      updated_at: now,
    }

    if (criterioUser) {
      updatePayload.assigned_to = (criterioUser as any).id
    }

    const { error: updateErr } = await serviceClient
      .from('consultas' as any)
      .update(updatePayload)
      .eq('id', body.consulta_id)

    if (updateErr) throw updateErr

    // Crear alerta TAREA_ASIGNADA para el usuario CRITERIO
    if (criterioUser) {
      await serviceClient.from('alertas' as any).insert({
        tipo: 'TAREA_ASIGNADA',
        titulo: `Consulta de ${clienteLabel} para revisión`,
        mensaje: `La consulta fue analizada con IA. Hay hechos ordenados y preguntas sugeridas para que revises y completes la documentación necesaria.`,
        destinatario_id: (criterioUser as any).id,
        prioridad: 'ALTA',
        payload: { consulta_id: body.consulta_id },
      })

      // Disparar push/email según preferencias del destinatario (fire-and-forget)
      fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/dispatch-alert-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          tipo: 'TAREA_ASIGNADA',
          usuario_id: (criterioUser as any).id,
          titulo: `Consulta de ${clienteLabel} para revisión`,
          mensaje: 'La consulta fue analizada con IA. Hay hechos ordenados y preguntas sugeridas para que revises y completes la documentación necesaria.',
          url: `/consultas/${body.consulta_id}`,
        }),
      }).catch((e) => console.error('[consulta-ordenar-hechos] dispatch error:', e))
    }

    logLlmCall(serviceClient, user.id, FUNCTION_NAME, inputBytes)

    return json(req, {
      ok: true,
      hechos_ordenados: parsed.hechos_ordenados,
      preguntas_sugeridas: parsed.preguntas_sugeridas,
      assigned_to: criterioUser ? (criterioUser as any).id : null,
    })

  } catch (err) {
    console.error('[consulta-ordenar-hechos]', err)
    return json(req, { error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

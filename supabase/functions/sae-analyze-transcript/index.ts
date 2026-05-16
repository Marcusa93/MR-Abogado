// Procesa un transcript de audiencia con LLM y guarda análisis estructurado.
//
// Body: { transcript_id: string }
// Returns: { analysis }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_MODEL = 'anthropic/claude-3.5-haiku'

const SYSTEM_PROMPT = `Sos un asistente jurídico. Analizás transcripciones de audiencias judiciales argentinas y extraés información estructurada.

Devolvé SIEMPRE un JSON con esta estructura exacta:

{
  "resumen": "Resumen narrativo en 2-4 párrafos cortos: qué tipo de audiencia, qué se discutió, qué se resolvió.",
  "partes_presentes": ["nombres de las personas/representantes que hablaron"],
  "decisiones": ["decisiones tomadas durante la audiencia, una por línea"],
  "proximos_pasos": ["acciones a realizar tras la audiencia, una por línea"],
  "puntos_clave": ["3-7 puntos más importantes en orden de relevancia"]
}

REGLAS:
- Sos extremadamente conservador: solo mencionás cosas que están EXPLÍCITAMENTE en la transcripción.
- Si la transcripción es ininteligible o incompleta, decilo en "resumen" y dejá los arrays vacíos.
- Arrays vacíos [] cuando no hay datos.
- Sin markdown, sin headers, JSON puro.`

interface AiAnalysis {
  resumen: string
  partes_presentes: string[]
  decisiones: string[]
  proximos_pasos: string[]
  puntos_clave: string[]
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function validateAnalysis(obj: unknown): AiAnalysis {
  const o = obj as Record<string, unknown>
  return {
    resumen: typeof o.resumen === 'string' ? o.resumen.trim() : '',
    partes_presentes: Array.isArray(o.partes_presentes) ? o.partes_presentes.filter((x): x is string => typeof x === 'string') : [],
    decisiones: Array.isArray(o.decisiones) ? o.decisiones.filter((x): x is string => typeof x === 'string') : [],
    proximos_pasos: Array.isArray(o.proximos_pasos) ? o.proximos_pasos.filter((x): x is string => typeof x === 'string') : [],
    puntos_clave: Array.isArray(o.puntos_clave) ? o.puntos_clave.filter((x): x is string => typeof x === 'string') : [],
  }
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

    const body = await req.json().catch(() => null) as { transcript_id?: string } | null
    if (!body?.transcript_id) return json({ error: 'transcript_id requerido' }, 400)

    // Read via RLS to verify ownership
    const { data: t, error: tErr } = await anonClient
      .from('audiencia_transcripts')
      .select('id, transcript, expediente_id')
      .eq('id', body.transcript_id)
      .maybeSingle()
    if (tErr || !t) return json({ error: 'Transcripción no encontrada o sin permisos' }, 404)
    const tRow = t as unknown as { id: string; transcript: string | null; expediente_id: string }
    if (!tRow.transcript?.trim()) return json({ error: 'La transcripción está vacía' }, 400)

    const aiRes = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://app.marcorossi.com.ar',
        'X-Title': 'MR Abogado Audiencia Analyzer',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Transcripción:\n\n${tRow.transcript}` },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 1500,
      }),
    })

    if (!aiRes.ok) {
      const text = await aiRes.text()
      return json({ error: `OpenRouter ${aiRes.status}: ${text.slice(0, 200)}` }, 502)
    }

    const payload = await aiRes.json() as { choices?: { message?: { content?: string } }[] }
    const content = payload.choices?.[0]?.message?.content
    if (!content) return json({ error: 'OpenRouter no devolvió contenido' }, 502)

    const parsed = JSON.parse(content)
    const analysis = validateAnalysis(parsed)

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    await serviceClient
      .from('audiencia_transcripts')
      .update({
        ai_analysis: analysis,
        ai_analyzed_at: new Date().toISOString(),
        ai_analysis_model: DEFAULT_MODEL,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tRow.id)

    return json({ analysis })

  } catch (err) {
    console.error('[sae-analyze-transcript]', err)
    return json({ error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

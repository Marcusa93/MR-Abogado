// ─────────────────────────────────────────────────────────────────────────
// Edge function: escrito-extraer-aprendizajes
//
// Compara escritos.contenido_original (IA) vs escritos.contenido (final
// con correcciones del abogado). Si hay cambios significativos, pide al
// LLM que extraiga patrones reusables (preferencias de estilo, citas que
// agregó/quitó, fórmulas que prefiere) y los guarda en aprendizajes_rulebook
// con proposed=true para que el abogado revise.
//
// Body:
//   { escrito_id: string }   o   { trigger: 'firmar'|'presentar' }
//
// Auth: user JWT o service_role + on_behalf_of_user_id (igual patrón que
// legal-lookup y jurisprudencia-ingest).
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'anthropic/claude-sonnet-4'
const MIN_DIFF_CHARS = 80  // ignorar correcciones triviales (1-2 palabras)

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const openrouterKey = Deno.env.get('OPENROUTER_API_KEY')!

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

function decodeJwtRole(token: string): string | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload?.role === 'string' ? payload.role : null
  } catch { return null }
}

// ─── Aplanado de contenido jsonb del escrito a texto plano ──────────────
function flattenEscrito(c: unknown): string {
  if (!c || typeof c !== 'object') return ''
  const obj = c as Record<string, unknown>
  const parts: string[] = []
  if (typeof obj.encabezado_juez === 'string') parts.push(`ENCABEZADO: ${obj.encabezado_juez}`)
  if (typeof obj.caratula === 'string') parts.push(`CARÁTULA: ${obj.caratula}`)
  if (Array.isArray(obj.secciones)) {
    for (const s of obj.secciones as Array<{ titulo?: string; parrafos?: string[] }>) {
      if (s.titulo) parts.push(`\n## ${s.titulo}`)
      if (Array.isArray(s.parrafos)) for (const p of s.parrafos) if (p?.trim()) parts.push(p.trim())
    }
  }
  return parts.join('\n')
}

// ─── Extrae los títulos de secciones de un contenido jsonb de escrito ──
function getSeccionesTitulos(c: unknown): string[] {
  if (!c || typeof c !== 'object') return []
  const obj = c as Record<string, unknown>
  if (!Array.isArray(obj.secciones)) return []
  return (obj.secciones as Array<{ titulo?: string }>).map(s => s.titulo ?? '').filter(Boolean)
}

// ─── Diff char-level acotado para que el prompt no explote ─────────────
function summarizeDiff(
  orig: string, final: string,
  origContenido?: unknown, finalContenido?: unknown
): { changed_chars: number; resumen: string } {
  if (orig === final) return { changed_chars: 0, resumen: '(sin cambios)' }
  // Naive: tomamos las primeras N divergencias por sección/párrafo
  const maxSnippet = 1500
  const origSecs = getSeccionesTitulos(origContenido)
  const finalSecs = getSeccionesTitulos(finalContenido)
  const secQuitadas = origSecs.filter(s => !finalSecs.includes(s))
  const secAgregadas = finalSecs.filter(s => !origSecs.includes(s))
  const estructuraNota = [
    secQuitadas.length > 0 ? `SECCIONES ELIMINADAS POR EL ABOGADO: ${secQuitadas.join(', ')}` : '',
    secAgregadas.length > 0 ? `SECCIONES AGREGADAS POR EL ABOGADO: ${secAgregadas.join(', ')}` : '',
    origSecs.length > 0 ? `Estructura original: ${origSecs.join(' → ')}` : '',
    finalSecs.length > 0 ? `Estructura final: ${finalSecs.join(' → ')}` : '',
  ].filter(Boolean).join('\n')
  const sample = `${estructuraNota ? estructuraNota + '\n\n' : ''}--- ORIGINAL (lo que generó la IA) ---
${orig.slice(0, maxSnippet)}${orig.length > maxSnippet ? '\n[...]' : ''}

--- FINAL (lo que firmó el abogado, con sus correcciones) ---
${final.slice(0, maxSnippet)}${final.length > maxSnippet ? '\n[...]' : ''}`
  const changed = Math.abs(final.length - orig.length) + final.split('').filter((c, i) => c !== orig[i]).length
  return { changed_chars: changed, resumen: sample }
}

interface AprendizajeCandidato {
  target_kind: 'estilo' | 'juez' | 'organismo' | 'tipo_proceso' | 'etapa_proceso' | 'fuero' | 'general'
  target_ref_text?: string
  contenido: string
  confidence: 'baja' | 'media' | 'alta'
}

const EXTRACTOR_PROMPT = `Sos un asistente que detecta patrones de redacción que prefiere un abogado argentino.

Te paso el TEXTO ORIGINAL (lo que generó una IA) y el TEXTO FINAL (lo que el abogado firmó después de corregir). Tu tarea es identificar HASTA 3 patrones REUSABLES que pueda aplicar en escritos futuros.

REGLAS ESTRICTAS:
- SOLO patrones generalizables (estilo, fórmulas, citas tipo, registro tonal). No detalles del caso puntual.
- Si el abogado eliminó secciones (como PERSONERÍA, HECHOS, DERECHO), extraé eso como patrón estructural: ej "En escritos de tipo Embargo preventivo, no incluir sección PERSONERÍA ni HECHOS — solo OBJETO y PETITORIO".
- Si reorganizó o agregó secciones, extraé el patrón análogo.
- Para aprendizajes estructurales, usar target_kind: "estilo" con target_ref_text: el tipo o fuero del escrito.
- Si el diff es solo cambios cosméticos (typos, espaciado, nombres), devolvé [].
- Si no podés identificar un patrón claro, devolvé [].
- Cada patrón debe ser **accionable**: tiene que poder leerse como una regla aplicable a futuros escritos.

DEVOLVÉ JSON con esta forma:
{
  "aprendizajes": [
    {
      "target_kind": "estilo" | "fuero" | "tipo_proceso" | "general",
      "target_ref_text": "opcional, ej: 'civil', 'amparo'",
      "contenido": "Regla en una oración. Ej: 'Cuando se cita el art. 52 bis LDC, agregar siempre referencia al precedente Galarza c/ Banco Macro CSJN 2018'.",
      "confidence": "baja"
    }
  ]
}

Si no hay nada que aprender: { "aprendizajes": [] }
NO devuelvas comentarios, solo JSON válido.`

async function callExtractor(diff: string): Promise<AprendizajeCandidato[]> {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openrouterKey}`,
      'HTTP-Referer': 'https://app.marcorossi.com.ar',
      'X-Title': 'MR Abogado extractor de aprendizajes',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: EXTRACTOR_PROMPT },
        { role: 'user', content: diff },
      ],
    }),
  })
  if (!res.ok) throw new Error(`Extractor LLM ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
  const raw = data.choices?.[0]?.message?.content?.trim() ?? '{}'
  // Limpiar fences markdown si vinieron
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  try {
    const parsed = JSON.parse(cleaned) as { aprendizajes?: AprendizajeCandidato[] }
    return Array.isArray(parsed.aprendizajes) ? parsed.aprendizajes.slice(0, 3) : []
  } catch (e) {
    console.error('[extractor] JSON parse failed', e, cleaned.slice(0, 300))
    return []
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json(req, { ok: false, error: 'No autorizado' }, 401)
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    const isServiceRole = token === serviceKey || decodeJwtRole(token) === 'service_role'

    const body = await req.json().catch(() => null) as {
      escrito_id?: string
      on_behalf_of_user_id?: string
    } | null
    if (!body?.escrito_id) return json(req, { ok: false, error: 'escrito_id requerido' }, 400)

    const admin = createClient(supabaseUrl, serviceKey)

    let userId: string
    if (isServiceRole) {
      if (!body.on_behalf_of_user_id) return json(req, { ok: false, error: 'service_role requiere on_behalf_of_user_id' }, 400)
      userId = body.on_behalf_of_user_id
    } else {
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: { user }, error: authErr } = await userClient.auth.getUser()
      if (authErr || !user) return json(req, { ok: false, error: 'Token inválido' }, 401)
      userId = user.id
    }

    // 1) Cargar escrito
    const { data: escrito, error: escErr } = await admin
      .from('escritos')
      .select('id, user_id, tipo, contenido, contenido_original, expediente_id')
      .eq('id', body.escrito_id)
      .single()
    if (escErr || !escrito) return json(req, { ok: false, error: 'Escrito no encontrado' }, 404)
    if ((escrito as { user_id: string }).user_id !== userId) {
      return json(req, { ok: false, error: 'Sin permisos sobre este escrito' }, 403)
    }
    if (!(escrito as { contenido_original?: unknown }).contenido_original) {
      return json(req, { ok: true, skipped: true, reason: 'Sin contenido_original (escrito previo a la migración 062). Nada que diffear.' })
    }

    // 2) Diffear
    const origText = flattenEscrito((escrito as { contenido_original: unknown }).contenido_original)
    const finalText = flattenEscrito((escrito as { contenido: unknown }).contenido)
    const diff = summarizeDiff(
      origText, finalText,
      (escrito as { contenido_original: unknown }).contenido_original,
      (escrito as { contenido: unknown }).contenido,
    )
    if (diff.changed_chars < MIN_DIFF_CHARS) {
      return json(req, { ok: true, skipped: true, reason: `Diff muy chico (${diff.changed_chars} chars). Mínimo ${MIN_DIFF_CHARS}.` })
    }

    // 3) Cargar contexto del expediente (tipo de proceso, fuero) para enriquecer aprendizajes
    const { data: expRow } = await admin
      .from('expedientes')
      .select('fuero, tipo_proceso_id')
      .eq('id', (escrito as { expediente_id: string }).expediente_id)
      .maybeSingle()

    // 4) Pedir al LLM que extraiga aprendizajes
    let candidatos: AprendizajeCandidato[]
    try {
      candidatos = await callExtractor(diff.resumen)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return json(req, { ok: false, error: msg }, 502)
    }

    if (candidatos.length === 0) {
      return json(req, { ok: true, aprendizajes_extraidos: 0, reason: 'El LLM no encontró patrones reusables.' })
    }

    // 5) Por cada candidato: primero intentar dedupe con aprendizajes
    //    aprobados similares (≥70% trigram sim). Si existe, increment
    //    observed_in_cases y skip. Si no, insertar como proposed=true.
    let nuevos = 0
    let confirmados = 0
    const detalles: Array<{ status: 'nuevo' | 'confirmado'; contenido: string; matched_id?: string }> = []

    for (const c of candidatos) {
      const { data: matchId } = await (admin.rpc as any)('aprendizaje_dedupe_o_incrementar', {
        p_owner_id: userId,
        p_target_kind: c.target_kind,
        p_contenido: c.contenido,
        p_threshold: 0.7,
      })
      if (matchId) {
        confirmados++
        detalles.push({ status: 'confirmado', contenido: c.contenido, matched_id: matchId })
        continue
      }
      // No match: insertar como propuesto nuevo
      const { error: insErr } = await admin.from('aprendizajes_rulebook').insert({
        scope: 'personal',
        owner_id: userId,
        target_kind: c.target_kind,
        target_ref_text: c.target_ref_text ?? (expRow as { fuero?: string } | null)?.fuero ?? null,
        tipo_proceso_id: c.target_kind === 'tipo_proceso' ? (expRow as { tipo_proceso_id?: string } | null)?.tipo_proceso_id ?? null : null,
        contenido: c.contenido,
        confidence: c.confidence ?? 'baja',
        observed_in_cases: 1,
        is_active: true,
        proposed: true,
        source_escrito_id: body.escrito_id,
        source_diff: { tipo: 'escrito_correcciones', escrito_id: body.escrito_id, changed_chars: diff.changed_chars },
        created_by: userId,
      })
      if (insErr) {
        console.error('[escrito-extraer-aprendizajes] insert error', insErr)
        continue
      }
      nuevos++
      detalles.push({ status: 'nuevo', contenido: c.contenido })
    }

    return json(req, {
      ok: true,
      escrito_id: body.escrito_id,
      nuevos_propuestos: nuevos,
      aprendizajes_confirmados: confirmados,
      detalles,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[escrito-extraer-aprendizajes] unhandled', msg)
    return json(req, { ok: false, error: msg }, 500)
  }
})

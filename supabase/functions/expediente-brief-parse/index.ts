// ─────────────────────────────────────────────────────────────────────────
// Edge function: expediente-brief-parse
//
// Procesa input libre del usuario sobre un expediente y devuelve:
//   - cambios_propuestos: entradas para sumar/versionar al brief
//   - contradicciones_detectadas: contra brief actual o rulebook
//   - generalizable_sugerido: aprendizajes que podrían subirse a la capa 1
//   - preguntas_clarificacion: si el input es ambiguo
//
// NUNCA escribe. Devuelve propuesta para que el cliente muestre tarjeta de
// confirmación al usuario. El commit es decisión humana (otro endpoint o
// INSERT directo con RLS).
//
// Body:
//   { expediente_id: string, texto: string }
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'anthropic/claude-sonnet-4'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function decodeJwtRole(token: string): string | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload?.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

const OUTPUT_GUIDE = `Devolvé EXACTAMENTE este JSON (sin markdown, sin texto extra):

{
  "cambios_propuestos": [
    {
      "seccion": "hechos|partes|estrategia|riesgos|decisiones|normativa|jurisprudencia|hitos|observaciones",
      "tipo": "hecho|hipotesis|decision_estrategica|riesgo|parte|referencia_norma|referencia_jurisprudencia|hito|observacion",
      "contenido": "string — paráfrasis normalizada del input del usuario, en términos jurídicos claros",
      "contenido_estructurado": { /* opcional, datos estructurados extraídos */ },
      "operacion": "crear_nueva|versionar_entry",
      "versionar_entry_id": "uuid o null — si operacion=versionar_entry, qué entry del brief actual reemplaza",
      "confidence": "baja|media|alta",
      "rationale": "string — por qué clasificaste así (1 oración, para que el usuario entienda)"
    }
  ],
  "contradicciones_detectadas": [
    {
      "con_entry_id": "uuid o null — si contradice una entry del brief actual",
      "con_aprendizaje_id": "uuid o null — si contradice un aprendizaje del rulebook",
      "con_rulebook_plazo": "string o null — si choca con plazo del proceso (ej: 'Ley 6944 art X plazo 5 días')",
      "descripcion": "string — qué choca con qué, en una oración clara",
      "severidad": "baja|media|alta"
    }
  ],
  "generalizable_sugerido": [
    {
      "target_kind": "juez|organismo|tipo_proceso|etapa_proceso|fuero|general",
      "target_ref_text": "string — identificador (ej: 'Pérez' para juez, código del organismo)",
      "contenido": "string — el aprendizaje en forma de regla reutilizable",
      "scope_sugerido": "personal|compartido",
      "rationale": "string — por qué es generalizable más allá de este expediente"
    }
  ],
  "preguntas_clarificacion": [
    "string — pregunta breve para desambiguar el input. Solo si es genuinamente ambiguo."
  ]
}

Reglas:
- Si el input es claro y unívoco, "preguntas_clarificacion" = [].
- Si no detectás contradicciones, "contradicciones_detectadas" = [].
- Si no hay nada generalizable, "generalizable_sugerido" = [].
- NUNCA inventes uuids: si no podés referenciar exactamente una entry o aprendizaje del contexto, devolvé null en ese campo.
- "operacion=versionar_entry" SOLO si la nueva info reemplaza información existente del brief; sino "crear_nueva".`

const SYSTEM_PROMPT = `Sos un asistente de un sistema jurídico argentino que ayuda al abogado a estructurar conocimiento sobre sus expedientes.

Tu tarea: tomar texto libre del abogado (en su idioma, posiblemente informal) y mapearlo al schema estructurado del brief del expediente.

Principios:
- El abogado escribe rápido y en su jerga. Normalizá pero no traduzcas: si dice "el actor es Pérez", la entrada va en sección=partes, tipo=parte. Si dice "no vamos a oponer prescripción", va en sección=decisiones, tipo=decision_estrategica.
- Distinguí HECHO (algo que pasó/está acreditado) de HIPÓTESIS (lo que el abogado cree o supone) de DECISIÓN (curso de acción elegido) de RIESGO (lo que puede salir mal).
- Detectá contradicciones contra el brief actual del expediente. Una contradicción no es solo opuesto léxico — incluye "decidió X" vs "decidió no-X", "el actor es A" vs "el actor es B", "plazo vence Y" vs "plazo vence Z".
- Distinguí lo del CASO de lo GENERALIZABLE. "Hoy presenté demanda" → solo del caso. "El juez Pérez del Civil 3a rechaza cautelares por sistema" → generalizable a futuros expedientes del mismo juez (sugerir aprendizaje).
- NO inventes información que el abogado no dijo. Si no menciona un juez, no agregues uno.
- Si el input no se mapea a ninguna sección del brief, devolvé "cambios_propuestos" vacío y una pregunta_clarificacion.

${OUTPUT_GUIDE}`

async function canViewExpediente(admin: any, userId: string, expedienteId: string, isStaff: boolean): Promise<boolean> {
  if (isStaff) return true
  const [m, own] = await Promise.all([
    admin.from('expediente_miembros').select('rol').eq('profile_id', userId).eq('expediente_id', expedienteId).maybeSingle(),
    admin.from('expedientes').select('id').eq('id', expedienteId).or(`abogado_responsable_id.eq.${userId},created_by.eq.${userId}`).maybeSingle(),
  ])
  return !!(m.data || own.data)
}

interface ExpedienteContext {
  expediente: any
  brief_actual: any[]
  tipo_proceso: any | null
  etapa_actual: any | null
  aprendizajes: any[]
}

async function loadContext(admin: any, expedienteId: string): Promise<ExpedienteContext> {
  const { data: expediente } = await admin
    .from('expedientes')
    .select('id, numero, caratula, fuero, estado_interno, tipo_proceso_id, etapa_actual_id, observaciones')
    .eq('id', expedienteId)
    .single()

  const { data: brief_actual } = await admin
    .from('expediente_brief_actual')
    .select('*')
    .eq('expediente_id', expedienteId)

  let tipo_proceso = null
  let etapa_actual = null
  if (expediente?.tipo_proceso_id) {
    const { data } = await admin
      .from('tipos_proceso_judicial')
      .select('id, codigo, nombre, fuero, jurisdiccion, descripcion, norma_base')
      .eq('id', expediente.tipo_proceso_id)
      .single()
    tipo_proceso = data
  }
  if (expediente?.etapa_actual_id) {
    const { data } = await admin
      .from('etapas_proceso')
      .select('id, codigo, nombre, descripcion, plazo_dias, plazo_es_perentorio, decisiones_posibles')
      .eq('id', expediente.etapa_actual_id)
      .single()
    etapa_actual = data
  }

  const { data: aprendizajes } = await admin
    .rpc('aprendizajes_aplicables', {
      p_tipo_proceso_id: expediente?.tipo_proceso_id ?? null,
      p_organismo_id: null,
      p_juez: null,
    })

  return {
    expediente,
    brief_actual: brief_actual || [],
    tipo_proceso,
    etapa_actual,
    aprendizajes: aprendizajes || [],
  }
}

function buildUserPrompt(ctx: ExpedienteContext, texto: string): string {
  const partes: string[] = []

  partes.push('### CONTEXTO DEL EXPEDIENTE\n')
  partes.push(`- Número: ${ctx.expediente?.numero ?? '-'}`)
  partes.push(`- Carátula: ${ctx.expediente?.caratula ?? '-'}`)
  partes.push(`- Fuero: ${ctx.expediente?.fuero ?? '-'}`)
  partes.push(`- Estado: ${ctx.expediente?.estado_interno ?? '-'}`)
  if (ctx.tipo_proceso) {
    partes.push(`- Tipo de proceso: ${ctx.tipo_proceso.nombre} (${ctx.tipo_proceso.codigo})`)
    partes.push(`  Norma base: ${ctx.tipo_proceso.norma_base ?? '-'}`)
  } else {
    partes.push('- Tipo de proceso: NO CLASIFICADO (no podés referenciar etapas ni plazos del rulebook)')
  }
  if (ctx.etapa_actual) {
    partes.push(`- Etapa actual: ${ctx.etapa_actual.nombre} (${ctx.etapa_actual.codigo})`)
    if (ctx.etapa_actual.plazo_dias) {
      partes.push(`  Plazo: ${ctx.etapa_actual.plazo_dias} días${ctx.etapa_actual.plazo_es_perentorio ? ' (perentorio)' : ''}`)
    }
  }

  partes.push('\n### BRIEF ACTUAL DEL EXPEDIENTE')
  if (ctx.brief_actual.length === 0) {
    partes.push('(vacío — no hay entradas previas)')
  } else {
    for (const e of ctx.brief_actual) {
      partes.push(`- [entry_id: ${e.entry_id}] [${e.seccion}/${e.tipo}] (${e.confidence}) ${e.contenido}`)
    }
  }

  partes.push('\n### APRENDIZAJES DEL RULEBOOK APLICABLES')
  if (ctx.aprendizajes.length === 0) {
    partes.push('(sin aprendizajes registrados para este contexto)')
  } else {
    for (const a of ctx.aprendizajes.slice(0, 30)) {
      partes.push(`- [aprendizaje_id: ${a.id}] [${a.target_kind}${a.target_ref_text ? '/' + a.target_ref_text : ''}] (${a.confidence}) ${a.contenido}`)
    }
  }

  partes.push('\n### INPUT LIBRE DEL ABOGADO')
  partes.push('---')
  partes.push(texto.slice(0, 8000))
  partes.push('---')
  partes.push('\nProcesá el input según el schema. Devolvé EXACTAMENTE el JSON especificado.')

  return partes.join('\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    return await handle(req)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error desconocido'
    console.error('[expediente-brief-parse] unhandled exception:', msg, e instanceof Error ? e.stack : '')
    return json({ ok: false, error: 'Excepción del servidor', detail: msg.slice(0, 400) }, 200)
  }
})

async function handle(req: Request): Promise<Response> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'No autorizado' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  const isServiceRole = token === serviceKey || decodeJwtRole(token) === 'service_role'

  let userId: string
  let bodyPeek: any = null
  if (isServiceRole) {
    bodyPeek = await req.clone().json().catch(() => null)
    if (!bodyPeek?.on_behalf_of_user_id) {
      return json({ ok: false, error: 'service_role requiere on_behalf_of_user_id' }, 400)
    }
    userId = bodyPeek.on_behalf_of_user_id
  } else {
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) return json({ error: 'Token inválido' }, 401)
    userId = user.id
  }

  const admin = createClient(supabaseUrl, serviceKey)
  const { data: profile } = await admin.from('profiles').select('rol').eq('id', userId).single()
  const rol = (profile as any)?.rol ?? 'COLABORADOR'
  const isStaff = ['DIRECTOR', 'ADMIN'].includes(String(rol).toUpperCase())

  const body = (bodyPeek ?? await req.json().catch(() => null)) as {
    expediente_id?: string
    texto?: string
  } | null
  if (!body?.expediente_id || !body?.texto) {
    return json({ error: 'Body requiere expediente_id y texto' }, 400)
  }
  if (body.texto.trim().length < 5) {
    return json({ error: 'El texto es demasiado corto' }, 400)
  }

  if (!(await canViewExpediente(admin, userId, body.expediente_id, isStaff))) {
    return json({ error: 'No tenés permiso para ver este expediente' }, 403)
  }

  const ctx = await loadContext(admin, body.expediente_id)
  if (!ctx.expediente) return json({ error: 'Expediente no encontrado' }, 404)

  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) return json({ error: 'OPENROUTER_API_KEY no configurada' }, 500)

  const userPrompt = buildUserPrompt(ctx, body.texto)

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://app.marcorossi.com.ar',
      'X-Title': 'MR Abogado · Brief parse',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 4096,
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    console.error('[expediente-brief-parse] LLM error', res.status, errText.slice(0, 500))
    return json({ ok: false, error: `LLM ${res.status}`, detail: errText.slice(0, 400) }, 200)
  }

  const data = await res.json().catch(() => null)
  const content = data?.choices?.[0]?.message?.content
  if (!content) {
    console.error('[expediente-brief-parse] respuesta vacía', JSON.stringify(data).slice(0, 500))
    return json({ ok: false, error: 'Respuesta vacía del modelo' }, 200)
  }

  let parsed: any
  try {
    parsed = typeof content === 'string' ? JSON.parse(content) : content
  } catch (e) {
    console.error('[expediente-brief-parse] JSON inválido', e)
    return json({ ok: false, error: 'Respuesta del modelo no es JSON válido', raw: String(content).slice(0, 500) }, 200)
  }

  // Sanity: aseguramos shape mínima
  const result = {
    ok: true,
    cambios_propuestos: Array.isArray(parsed.cambios_propuestos) ? parsed.cambios_propuestos : [],
    contradicciones_detectadas: Array.isArray(parsed.contradicciones_detectadas) ? parsed.contradicciones_detectadas : [],
    generalizable_sugerido: Array.isArray(parsed.generalizable_sugerido) ? parsed.generalizable_sugerido : [],
    preguntas_clarificacion: Array.isArray(parsed.preguntas_clarificacion) ? parsed.preguntas_clarificacion : [],
    modelo: MODEL,
  }

  return json(result, 200)
}

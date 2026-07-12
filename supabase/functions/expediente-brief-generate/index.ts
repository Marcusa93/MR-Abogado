// ─────────────────────────────────────────────────────────────────────────
// Edge function: expediente-brief-generate
//
// Genera un brief estructurado del expediente desde fuentes existentes:
//   - Datos del expediente (cliente, partes, fuero, estado)
//   - Actuaciones SAE recientes (top 30, prioridad a "claves")
//   - Escritos del expediente (títulos + tipo)
//   - Normativa fijada al expediente
//   - Rulebook del tipo de proceso (si está clasificado)
//   - Aprendizajes aplicables del rulebook
//
// NUNCA escribe. Devuelve un set de propuestas de entries + preguntas
// abiertas. El cliente muestra al usuario el draft completo con una
// confirmación por bloque o global. El usuario confirma y se hacen los
// INSERTs (vía RLS desde el cliente, o vía función SQL).
//
// Body:
//   { expediente_id: string }
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'anthropic/claude-sonnet-4'

const ACTUACIONES_LIMIT = 30
const ESCRITOS_LIMIT = 20

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
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
  "resumen_corto": "string — 3 a 5 oraciones que describan el caso en términos jurídicos",
  "entries_propuestas": [
    {
      "seccion": "hechos|partes|estrategia|riesgos|decisiones|normativa|jurisprudencia|hitos|observaciones",
      "tipo": "hecho|hipotesis|decision_estrategica|riesgo|parte|referencia_norma|referencia_jurisprudencia|hito|observacion",
      "contenido": "string — afirmación breve y precisa",
      "contenido_estructurado": { /* opcional */ },
      "confidence": "baja|media|alta",
      "evidence_refs": [ /* opcional: [{kind:"actuacion",id:"..."},{kind:"escrito",id:"..."}] */ ],
      "source_inferida": "generado_por_ia"
    }
  ],
  "preguntas_abiertas": [
    {
      "pregunta": "string — pregunta clara y específica",
      "origen": "ia_brief_gen",
      "contexto": { /* opcional: {seccion_esperada, opciones} */ },
      "prioridad": "baja|normal|alta",
      "rationale": "string — por qué la IA necesita saber esto"
    }
  ],
  "proximos_hitos_calculados": [
    {
      "descripcion": "string — qué evento se espera y cuándo",
      "fuente": "rulebook|inferido_de_actuaciones",
      "plazo_dias_restantes": "number o null"
    }
  ]
}

Reglas estrictas:
- NO inventes hechos. Si algo no surge del contexto, NO lo afirmes. Marcalo como pregunta_abierta.
- Toda entry de "hecho" debe tener evidence_refs apuntando a la fuente (actuación, escrito). Si no tenés fuente, usa tipo "hipotesis" o ponelo como pregunta.
- "decision_estrategica" solo si el abogado YA tomó una decisión explícita en algún escrito o actuación. Sino es pregunta_abierta.
- Las preguntas deben ser específicas y accionables. Mal: "¿Cuál es la estrategia?". Bien: "¿Vas a oponer excepción de prescripción dado que el plazo del art. 2562 CCyCN podría haber transcurrido?"
- Si NO hay tipo de proceso clasificado, NO inventes etapas ni hitos.
- "proximos_hitos_calculados" deriva de etapa_actual + plazo_dias del rulebook; si no hay rulebook, devolvé array vacío.`

const SYSTEM_PROMPT = `Sos un asistente jurídico argentino que arma briefs estructurados de expedientes a partir del material disponible.

Tu salida es una PROPUESTA — el abogado va a confirmar/editar antes de que se persista nada. No tenés que ser exhaustivo: tenés que ser CORRECTO y trazable.

Principios:
- Trazabilidad: cada afirmación de hecho debe poder respaldarse con una actuación o escrito. Si no podés respaldarla, no la afirmes como hecho — formulala como pregunta abierta.
- Distinción rigurosa: HECHO (con fuente) vs HIPÓTESIS (inferencia razonable) vs DECISIÓN (curso ya elegido por el abogado, explícito) vs RIESGO (cosa que puede pasar mal).
- Tono procesal argentino. Vocabulario: actor/demandado, traslado, contestar, oponer, sentencia, recurso. NO inglés.
- Preguntas ACCIONABLES. Cada pregunta abierta debe poder responderse con sí/no, una elección entre opciones, o una frase corta. Evitá preguntas amplias.
- Sé conservador con confidence: "alta" solo si hay evidencia directa; "media" para inferencias razonables; "baja" para suposiciones.

${OUTPUT_GUIDE}`

async function canViewExpediente(admin: any, userId: string, expedienteId: string, isStaff: boolean): Promise<boolean> {
  if (isStaff) return true
  const [m, own] = await Promise.all([
    admin.from('expediente_miembros').select('rol').eq('profile_id', userId).eq('expediente_id', expedienteId).maybeSingle(),
    admin.from('expedientes').select('id').eq('id', expedienteId).or(`abogado_responsable_id.eq.${userId},created_by.eq.${userId}`).maybeSingle(),
  ])
  return !!(m.data || own.data)
}

async function loadContext(admin: any, expedienteId: string) {
  const { data: expediente } = await admin
    .from('expedientes')
    .select(`
      id, numero, caratula, fuero, estado_interno, observaciones,
      tipo_proceso_id, etapa_actual_id, etapa_actual_desde,
      cliente:cliente_id(id, nombre, apellido, dni, cuil),
      organismo:organismo_id(id, nombre, tipo)
    `)
    .eq('id', expedienteId)
    .single()

  if (!expediente) return null

  const { data: actuaciones } = await admin
    .from('sae_movements')
    .select('id, fecha, tipo, descripcion, is_key, ai_summary')
    .eq('expediente_id', expedienteId)
    .order('fecha', { ascending: false })
    .limit(ACTUACIONES_LIMIT)

  const { data: escritos } = await admin
    .from('escritos')
    .select('id, titulo, tipo, estado, created_at, presentado_sae_at')
    .eq('expediente_id', expedienteId)
    .order('created_at', { ascending: false })
    .limit(ESCRITOS_LIMIT)

  const { data: normativaFijada } = await admin
    .from('expediente_normativa')
    .select(`documento:documento_id(id, titulo, tipo, numero), nota`)
    .eq('expediente_id', expedienteId)

  let tipo_proceso = null
  let etapas: any[] = []
  let etapa_actual = null

  if (expediente.tipo_proceso_id) {
    const { data: tp } = await admin
      .from('tipos_proceso_judicial')
      .select('id, codigo, nombre, fuero, jurisdiccion, descripcion, norma_base')
      .eq('id', expediente.tipo_proceso_id)
      .single()
    tipo_proceso = tp

    const { data: et } = await admin
      .from('etapas_proceso')
      .select('id, codigo, nombre, orden, descripcion, plazo_dias, plazo_es_perentorio, decisiones_posibles, escritos_tipicos, es_terminal')
      .eq('tipo_proceso_id', expediente.tipo_proceso_id)
      .order('orden')
    etapas = et || []

    if (expediente.etapa_actual_id) {
      etapa_actual = etapas.find(e => e.id === expediente.etapa_actual_id) || null
    }
  }

  const { data: aprendizajes } = await admin
    .rpc('aprendizajes_aplicables', {
      p_tipo_proceso_id: expediente.tipo_proceso_id ?? null,
      p_organismo_id: expediente.organismo?.id ?? null,
      p_juez: null,
    })

  const { data: brief_actual } = await admin
    .from('expediente_brief_actual')
    .select('*')
    .eq('expediente_id', expedienteId)

  const { data: novedades } = await admin
    .from('expediente_novedades')
    .select('nota, created_at')
    .eq('expediente_id', expedienteId)
    .order('created_at', { ascending: false })
    .limit(10)

  return {
    expediente,
    actuaciones: actuaciones || [],
    escritos: escritos || [],
    normativaFijada: normativaFijada || [],
    tipo_proceso,
    etapas,
    etapa_actual,
    aprendizajes: aprendizajes || [],
    brief_actual: brief_actual || [],
    novedades: novedades || [],
  }
}

function buildUserPrompt(ctx: any): string {
  const partes: string[] = []
  const e = ctx.expediente

  partes.push('### EXPEDIENTE\n')
  partes.push(`- Número: ${e.numero}`)
  partes.push(`- Carátula: ${e.caratula ?? '-'}`)
  partes.push(`- Fuero: ${e.fuero ?? '-'}`)
  partes.push(`- Estado interno: ${e.estado_interno}`)
  if (e.cliente) {
    partes.push(`- Cliente: ${e.cliente.nombre ?? ''} ${e.cliente.apellido ?? ''} (DNI: ${e.cliente.dni ?? '-'}${e.cliente.cuil ? `, CUIL: ${e.cliente.cuil}` : ''})`)
  }
  if (e.organismo) {
    partes.push(`- Organismo: ${e.organismo.nombre} (${e.organismo.tipo})`)
  }
  if (e.observaciones) {
    partes.push(`- Observaciones del abogado: ${e.observaciones}`)
  }

  partes.push('\n### TIPO DE PROCESO Y RULEBOOK')
  if (ctx.tipo_proceso) {
    partes.push(`- Tipo: ${ctx.tipo_proceso.nombre} (${ctx.tipo_proceso.codigo})`)
    partes.push(`- Norma base: ${ctx.tipo_proceso.norma_base}`)
    partes.push(`- Etapas del proceso:`)
    for (const et of ctx.etapas) {
      const actual = ctx.etapa_actual?.id === et.id ? ' ← ETAPA ACTUAL' : ''
      partes.push(`  ${et.orden}. ${et.nombre} [${et.codigo}]${et.plazo_dias ? ` plazo: ${et.plazo_dias}d` : ''}${actual}`)
    }
    if (ctx.etapa_actual) {
      partes.push(`\n- Etapa actual: ${ctx.etapa_actual.nombre}`)
      if (ctx.etapa_actual.decisiones_posibles?.length) {
        partes.push(`  Decisiones típicas en esta etapa:`)
        for (const d of ctx.etapa_actual.decisiones_posibles) {
          partes.push(`    - ${d.nombre}: ${d.descripcion}`)
        }
      }
      if (e.etapa_actual_desde) {
        partes.push(`  En esta etapa desde: ${e.etapa_actual_desde}`)
      }
    }
  } else {
    partes.push('(expediente NO clasificado por tipo de proceso — no inventes etapas)')
  }

  partes.push('\n### APRENDIZAJES APLICABLES')
  if (ctx.aprendizajes.length === 0) {
    partes.push('(sin aprendizajes registrados)')
  } else {
    for (const a of ctx.aprendizajes.slice(0, 20)) {
      partes.push(`- [${a.target_kind}${a.target_ref_text ? '/' + a.target_ref_text : ''}] (${a.confidence}) ${a.contenido}`)
    }
  }

  partes.push('\n### ACTUACIONES SAE (más recientes)')
  if (ctx.actuaciones.length === 0) {
    partes.push('(sin actuaciones registradas)')
  } else {
    for (const a of ctx.actuaciones) {
      const key = a.is_key ? ' ⚑CLAVE' : ''
      partes.push(`- [act_id: ${a.id}] ${a.fecha} [${a.tipo}]${key} ${a.descripcion ?? ''}`)
      if (a.ai_summary) partes.push(`    Resumen IA: ${a.ai_summary}`)
    }
  }

  partes.push('\n### ESCRITOS PRESENTADOS')
  if (ctx.escritos.length === 0) {
    partes.push('(sin escritos registrados)')
  } else {
    for (const s of ctx.escritos) {
      const pres = s.presentado_sae_at ? ` PRESENTADO ${s.presentado_sae_at}` : ` (${s.estado})`
      partes.push(`- [escrito_id: ${s.id}] [${s.tipo}] ${s.titulo}${pres}`)
    }
  }

  partes.push('\n### NORMATIVA FIJADA AL EXPEDIENTE')
  if (ctx.normativaFijada.length === 0) {
    partes.push('(sin normativa fijada)')
  } else {
    for (const n of ctx.normativaFijada) {
      const d = n.documento
      partes.push(`- [${d.tipo}${d.numero ? ' ' + d.numero : ''}] ${d.titulo}${n.nota ? ` (nota: ${n.nota})` : ''}`)
    }
  }

  partes.push('\n### NOVEDADES DEL ABOGADO (actualizaciones manuales, más recientes primero)')
  if (ctx.novedades.length === 0) {
    partes.push('(sin novedades registradas)')
  } else {
    for (const n of ctx.novedades) {
      const fecha = new Date(n.created_at).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Tucuman' })
      partes.push(`- [${fecha}] ${n.nota}`)
    }
  }

  partes.push('\n### BRIEF ACTUAL (si existe)')
  if (ctx.brief_actual.length === 0) {
    partes.push('(vacío — esta es la generación inicial)')
  } else {
    partes.push('Ya hay entradas previas. NO las dupliques. Solo agregá info nueva o reemplazo (versionar) si tu nueva info es más precisa.')
    for (const x of ctx.brief_actual) {
      partes.push(`- [entry_id: ${x.entry_id}] [${x.seccion}/${x.tipo}] (${x.confidence}) ${x.contenido}`)
    }
  }

  partes.push('\nGenerá el brief según el schema. Devolvé EXACTAMENTE el JSON especificado.')
  return partes.join('\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  try {
    return await handle(req)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error desconocido'
    console.error('[expediente-brief-generate] unhandled exception:', msg, e instanceof Error ? e.stack : '')
    return json(req, { ok: false, error: 'Excepción del servidor', detail: msg.slice(0, 400) }, 200)
  }
})

async function handle(req: Request): Promise<Response> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json(req, { error: 'No autorizado' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  const isServiceRole = token === serviceKey || decodeJwtRole(token) === 'service_role'

  let userId: string
  let bodyPeek: any = null
  if (isServiceRole) {
    bodyPeek = await req.clone().json().catch(() => null)
    if (!bodyPeek?.on_behalf_of_user_id) {
      return json(req, { ok: false, error: 'service_role requiere on_behalf_of_user_id' }, 400)
    }
    userId = bodyPeek.on_behalf_of_user_id
  } else {
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) return json(req, { error: 'Token inválido' }, 401)
    userId = user.id
  }

  const admin = createClient(supabaseUrl, serviceKey)
  const { data: profile } = await admin.from('profiles').select('rol').eq('id', userId).single()
  const rol = (profile as any)?.rol ?? 'COLABORADOR'
  const isStaff = ['DIRECTOR', 'ADMIN'].includes(String(rol).toUpperCase())

  const body = (bodyPeek ?? await req.json().catch(() => null)) as { expediente_id?: string } | null
  if (!body?.expediente_id) return json(req, { error: 'Body requiere expediente_id' }, 400)

  if (!(await canViewExpediente(admin, userId, body.expediente_id, isStaff))) {
    return json(req, { error: 'No tenés permiso para ver este expediente' }, 403)
  }

  const ctx = await loadContext(admin, body.expediente_id)
  if (!ctx) return json(req, { error: 'Expediente no encontrado' }, 404)

  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) return json(req, { error: 'OPENROUTER_API_KEY no configurada' }, 500)

  const userPrompt = buildUserPrompt(ctx)

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://app.marcorossi.com.ar',
      'X-Title': 'MR Abogado · Brief generate',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 6144,
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    console.error('[expediente-brief-generate] LLM error', res.status, errText.slice(0, 500))
    return json(req, { ok: false, error: `LLM ${res.status}`, detail: errText.slice(0, 400) }, 200)
  }

  const data = await res.json().catch(() => null)
  const content = data?.choices?.[0]?.message?.content
  if (!content) {
    console.error('[expediente-brief-generate] respuesta vacía', JSON.stringify(data).slice(0, 500))
    return json(req, { ok: false, error: 'Respuesta vacía del modelo' }, 200)
  }

  const finishReason = data?.choices?.[0]?.finish_reason
  if (finishReason === 'length') {
    return json(req, { ok: false, error: 'La respuesta fue demasiado larga. El expediente tiene demasiado contexto.' }, 200)
  }

  let parsed: any
  try {
    let cleaned = typeof content === 'string' ? content : JSON.stringify(content)
    cleaned = cleaned.replace(/```(?:json)?/gi, '').trim()
    const s = cleaned.indexOf('{')
    const e = cleaned.lastIndexOf('}')
    if (s !== -1 && e > s) cleaned = cleaned.slice(s, e + 1)
    parsed = JSON.parse(cleaned)
  } catch (e) {
    console.error('[expediente-brief-generate] JSON inválido', e)
    return json(req, { ok: false, error: 'Respuesta del modelo no es JSON válido. Intentá de nuevo.' }, 200)
  }

  const result = {
    ok: true,
    resumen_corto: typeof parsed.resumen_corto === 'string' ? parsed.resumen_corto : '',
    entries_propuestas: Array.isArray(parsed.entries_propuestas) ? parsed.entries_propuestas : [],
    preguntas_abiertas: Array.isArray(parsed.preguntas_abiertas) ? parsed.preguntas_abiertas : [],
    proximos_hitos_calculados: Array.isArray(parsed.proximos_hitos_calculados) ? parsed.proximos_hitos_calculados : [],
    modelo: MODEL,
    contexto_usado: {
      tipo_proceso_clasificado: !!ctx.tipo_proceso,
      actuaciones_count: ctx.actuaciones.length,
      escritos_count: ctx.escritos.length,
      aprendizajes_count: ctx.aprendizajes.length,
      brief_previo_entries: ctx.brief_actual.length,
    },
  }

  return json(req, result, 200)
}

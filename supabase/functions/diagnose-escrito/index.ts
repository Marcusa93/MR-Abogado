// ─────────────────────────────────────────────────────────────────────────
// Edge function: diagnose-escrito
//
// Aplica el skill claude-for-legal-argentina (diagnostico-SKILL +
// civil-CLAUDE + marcadores-GLOSARIO) sobre un escrito jurídico.
// Devuelve un JSON estructurado con las 9 secciones del patrón
// "diagnóstico previo antes de modificar".
//
// Body (uno de):
//   { escrito_id: uuid, area?: 'civil'|'laboral'|'familia' }
//   { contenido: string, titulo?: string, tipo?: string, area?: 'civil'|... }
//
// El skill vive en _shared/skill-legal-ar/ — los .md se leen al startup
// con Deno.readTextFile.
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

// ─── Cargar archivos del skill ────────────────────────────────────────────

async function readSkillFile(name: string): Promise<string> {
  try {
    const url = new URL(`../_shared/skill-legal-ar/${name}`, import.meta.url)
    return await Deno.readTextFile(url)
  } catch (e) {
    console.warn(`No pude leer ${name}:`, e instanceof Error ? e.message : 'unknown')
    return ''
  }
}

const SKILL_DIAGNOSTICO = await readSkillFile('diagnostico-SKILL.md')
const SKILL_MARCADORES = await readSkillFile('marcadores-GLOSARIO.md')
const SKILL_CIVIL = await readSkillFile('civil-CLAUDE.md')
const SKILL_BASE = await readSkillFile('CLAUDE.md')

// ─── Output schema esperado ───────────────────────────────────────────────

const OUTPUT_SCHEMA_GUIDE = `RESPONDÉ EXACTAMENTE ESTE JSON (sin texto adicional, sin markdown):

{
  "identificacion": {
    "tipo_escrito": "string — demanda/contestación/recurso/alegato/carta documento/otro",
    "rama_derecho": "string — civil/comercial/laboral/familia/otra/indeterminado",
    "fuero_inferido": "string o null",
    "parte_suscribiente": "actor|demandado|tercero|indeterminado"
  },
  "argumentos_sin_norma": [
    { "argumento": "string — paráfrasis breve", "norma_sugerida": "string o 'indeterminado'" }
  ],
  "hechos_no_acreditados": [
    { "hecho": "string — descripción", "prueba_sugerida": "string o 'indeterminado'", "tipo": "vacio_total|vacio_parcial" }
  ],
  "citas_jurisprudenciales": [
    { "cita": "string — carátula/sala/año tal cual figura", "estado": "no_verificada|verificada_en_sesion|requerida", "doctrina_o_motivo": "string" }
  ],
  "peticiones_sin_fundamento": [
    { "peticion": "string — texto de la petición", "falta": "string — qué falta en fundamentos" }
  ],
  "contradicciones": [
    { "seccion_a": "string — paráfrasis", "seccion_b": "string — paráfrasis", "resolucion_sugerida": "string" }
  ],
  "normas_verificacion_pendiente": [
    { "norma": "string", "motivo": "string — modificada/derogada/posible_reforma" }
  ],
  "alertas_plazo_fatal": [
    { "norma": "string", "plazo": "string", "fecha_inicio_computo": "string o null", "vencimiento_estimado": "YYYY-MM-DD o null" }
  ],
  "observaciones_estructurales": [
    "string — máximo 5 observaciones en prosa"
  ],
  "sintesis": {
    "evaluacion": "presentable_con_correcciones_menores|requiere_reescritura_parcial|requiere_reescritura_estructural",
    "marcadores_totales": "number",
    "resumen": "string — máximo 5 líneas"
  }
}

Si una sección no tiene observaciones, devolvé array vacío []. NO omitas
ninguna clave. NO agregues claves nuevas.`

const SYSTEM_PROMPT = `${SKILL_BASE ? SKILL_BASE + '\n\n---\n\n' : ''}${SKILL_CIVIL}\n\n---\n\n${SKILL_DIAGNOSTICO}\n\n---\n\n${SKILL_MARCADORES}\n\n---\n\n${OUTPUT_SCHEMA_GUIDE}`

// ─── Helpers ──────────────────────────────────────────────────────────────

function extractText(contenido: unknown): string {
  if (typeof contenido === 'string') return contenido
  if (!contenido || typeof contenido !== 'object') return ''
  const c = contenido as Record<string, unknown>

  // Forma estándar de los escritos generados por `escritos-generate`:
  // { titulo, caratula, encabezado_juez, secciones: [{titulo, parrafos[]}], citas }
  if (Array.isArray(c.secciones)) {
    const partes: string[] = []
    if (typeof c.encabezado_juez === 'string') partes.push(c.encabezado_juez)
    if (typeof c.caratula === 'string') partes.push(`Carátula: ${c.caratula}`)
    if (typeof c.titulo === 'string') partes.push(c.titulo.toUpperCase())
    for (const s of c.secciones as any[]) {
      if (typeof s === 'string') { partes.push(s); continue }
      const lines: string[] = []
      if (s?.titulo) lines.push(String(s.titulo).toUpperCase())
      if (Array.isArray(s?.parrafos)) {
        for (const p of s.parrafos) lines.push(String(p))
      }
      if (typeof s?.texto === 'string') lines.push(s.texto)
      if (typeof s?.contenido === 'string') lines.push(s.contenido)
      partes.push(lines.join('\n'))
    }
    if (Array.isArray(c.citas) && (c.citas as any[]).length > 0) {
      partes.push('Citas: ' + (c.citas as any[]).map(x =>
        typeof x === 'string' ? x : (x?.norma || x?.texto || JSON.stringify(x))
      ).join('; '))
    }
    return partes.filter(Boolean).join('\n\n')
  }

  if (typeof c.texto === 'string') return c.texto
  if (typeof c.contenido === 'string') return c.contenido
  if (typeof c.html === 'string') return c.html.replace(/<[^>]+>/g, ' ')
  if (typeof c.markdown === 'string') return c.markdown

  return JSON.stringify(contenido).slice(0, 30000)
}

async function canViewExpediente(admin: any, userId: string, expedienteId: string, isStaff: boolean): Promise<boolean> {
  if (isStaff) return true
  const [m, own] = await Promise.all([
    admin.from('expediente_miembros').select('rol').eq('profile_id', userId).eq('expediente_id', expedienteId).maybeSingle(),
    admin.from('expedientes').select('id').eq('id', expedienteId).or(`abogado_responsable_id.eq.${userId},created_by.eq.${userId}`).maybeSingle(),
  ])
  return !!(m.data || own.data)
}

// ─── HTTP handler ─────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'No autorizado' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return json({ error: 'Token inválido' }, 401)

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: profile } = await admin
    .from('profiles').select('rol').eq('id', user.id).single()
  const rol = (profile as any)?.rol ?? 'COLABORADOR'
  const isStaff = ['DIRECTOR', 'ADMIN'].includes(String(rol).toUpperCase())

  const body = await req.json().catch(() => null) as {
    escrito_id?: string
    contenido?: string
    titulo?: string
    tipo?: string
    area?: string
  } | null
  if (!body) return json({ error: 'Body inválido' }, 400)

  let textoEscrito = ''
  let escritoMeta: { id?: string; titulo?: string; tipo?: string; expediente_id?: string } = {}

  if (body.escrito_id) {
    const { data: escrito, error } = await admin
      .from('escritos')
      .select('id, titulo, tipo, contenido, expediente_id')
      .eq('id', body.escrito_id)
      .single()
    if (error || !escrito) return json({ error: 'Escrito no encontrado' }, 404)

    if (escrito.expediente_id && !(await canViewExpediente(admin, user.id, escrito.expediente_id, isStaff))) {
      return json({ error: 'No tenés permiso para ver este expediente' }, 403)
    }

    textoEscrito = extractText((escrito as any).contenido)
    escritoMeta = {
      id: escrito.id,
      titulo: (escrito as any).titulo,
      tipo: (escrito as any).tipo,
      expediente_id: (escrito as any).expediente_id,
    }
  } else if (body.contenido) {
    textoEscrito = body.contenido
    escritoMeta = { titulo: body.titulo, tipo: body.tipo }
  } else {
    return json({ error: 'Falta escrito_id o contenido' }, 400)
  }

  if (!textoEscrito || textoEscrito.trim().length < 50) {
    return json({ error: 'El escrito está vacío o es muy corto para diagnosticar' }, 400)
  }

  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) return json({ error: 'OPENROUTER_API_KEY no configurada' }, 500)

  const userPrompt = [
    escritoMeta.titulo && `TÍTULO DEL ESCRITO: ${escritoMeta.titulo}`,
    escritoMeta.tipo && `TIPO DECLARADO: ${escritoMeta.tipo}`,
    body.area && `ÁREA INDICADA POR EL USUARIO: ${body.area}`,
    '',
    'TEXTO DEL ESCRITO:',
    '---',
    textoEscrito.slice(0, 40000),
    '---',
    '',
    'Realizá el diagnóstico previo según el skill. Devolvé EXACTAMENTE el JSON especificado.',
  ].filter(Boolean).join('\n')

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://app.marcorossi.com.ar',
      'X-Title': 'MR Abogado · Diagnóstico de escritos',
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
    return json({ error: `LLM ${res.status}: ${errText.slice(0, 400)}` }, 500)
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) return json({ error: 'Respuesta vacía del modelo' }, 500)

  let diagnostico: any
  try {
    diagnostico = JSON.parse(content)
  } catch (_e) {
    return json({
      error: 'El modelo devolvió un JSON inválido',
      raw: String(content).slice(0, 1000),
    }, 500)
  }

  return json({
    ok: true,
    escrito: escritoMeta,
    area_aplicada: body.area ?? 'civil',
    modelo: MODEL,
    generated_at: new Date().toISOString(),
    diagnostico,
  })
})

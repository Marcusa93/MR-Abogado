// Genera un escrito judicial a partir del contexto del expediente y las
// actuaciones CLAVES (nunca el historial completo). Devuelve JSON estructurado
// que el cliente renderiza con la plantilla pixel-perfect (logo, Times New
// Roman, sangrías).
//
// Body:
// {
//   expediente_id: string,
//   tipo: string,                          // libre, definido por el usuario
//   titulo?: string,                       // si no, lo decide la IA
//   instrucciones?: string,                // prompt extra del abogado
//   template_id?: string | null,           // plantilla del usuario (futuro)
// }
//
// Returns: { escrito_id, contenido, modelo, registro_tonal, claves_usadas }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings'
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4'
const EMBEDDING_MODEL = 'openai/text-embedding-3-small'

// Umbrales calibrados sobre text-embedding-3-small (cosine similarity)
const RAG_STRONG_THRESHOLD = 0.42
const RAG_WEAK_THRESHOLD = 0.2
const RAG_STRONG_TOPK = 3
const RAG_WEAK_TOPK = 2
const RAG_MATCH_COUNT = 8           // top-N que pide la RPC antes del filtro de score
const RAG_MAX_PINNED_CHUNKS = 30    // sanity cap: si un user fija un doc gigante, no exploda el prompt

// Mismas reglas que tab-actuaciones-claves.tsx
const KEY_TYPES = new Set([
  'sentencia', 'audiencia', 'intimacion', 'embargo',
  'traslado', 'decreto', 'cedula',
])

// Tipos que ameritan registro retórico/suspicaz (interpretan o trabajan prueba)
const TIPOS_RETORICOS = new Set([
  'alegato',
  'contestacion', 'contestacion_demanda', 'contesta_demanda', 'contesta_traslado_sustancial',
  'recurso', 'recurso_apelacion', 'recurso_reposicion', 'recurso_revocatoria', 'recurso_nulidad', 'recurso_casacion',
  'expresa_agravios', 'memorial',
  'demanda',
])

function isTipoRetorico(tipo: string): boolean {
  const norm = tipo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_')
  if (TIPOS_RETORICOS.has(norm)) return true
  // heurística: contiene "alegato", "recurso", "contesta", "expresa agravios", "memorial"
  return /alegato|recurso|contesta|agravios|memorial|apela|nulidad/i.test(tipo)
}

// ── Skill legal (adaptado de anthropics/skills, traducido y filtrado) ──
// Aporta disciplina de redacción jurídica, sin anglocentrismos.
const SKILL_LEGAL = `# Disciplina de redacción jurídica

- Precisión por sobre elegancia: cada afirmación debe ser sostenible con el material aportado.
- No inventar hechos, fechas, partes ni citas legales. Si un dato falta, omitirlo o referirlo como "según se desprende de las actuaciones".
- Citar normas y jurisprudencia con cuidado: solo si surgen del expediente o son notorias (CCyCN, CPCCN, leyes provinciales). En caso de duda, NO citar.
- Distinguir entre hechos (con respaldo en la prueba) e interpretaciones (presentadas como argumentos).
- Estructura: introducción → hechos → derecho → petitorio. Sin saltos ni redundancias.
- Tono formal pero claro. No abusar del latinismo ni de circunloquios vacíos.
- No usar muletillas evidentes de IA ("en conclusión", "es importante destacar que", "como abogado").`

const ARGENTINA_OVERRIDE = `# Estilo procesal argentino

- Tratamiento: "V.S." (Vuestra Señoría) o "Sr. Juez/Sra. Jueza". Nunca "Su Señoría" suelto.
- Vocabulario procesal AR: traslado, contestar, oponer excepciones, ofrecer prueba, agraviar, expresar agravios, alegar, pronto despacho, escrito en sustento, manifestar.
- Citas: Código Civil y Comercial de la Nación (CCyCN), Código Procesal Civil y Comercial de la Nación (CPCCN) o el provincial que corresponda. Leyes laborales: LCT, LRT.
- NO usar inglés ni anglicismos: nada de "motion", "discovery", "hereinafter".
- NO usar el formato "el suscripto" salvo en contextos muy formales — preferir primera persona como apoderado ("vengo a", "manifiesto", "solicito").
- Cuando se cite a la contraparte, mantener distancia retórica: "la parte contraria", "la actora/demandada", "la accionante", evitando nombres propios salvo necesidad.`

interface RegistroSpec {
  nombre: 'retorico' | 'procesal'
  instrucciones: string
}

const REGISTRO_RETORICO: RegistroSpec = {
  nombre: 'retorico',
  instrucciones: `# Registro tonal: RETÓRICO / SUSPICAZ

Este es un escrito que interpreta o trabaja prueba. Debe persuadir, no solo informar.

- Frases con subordinadas y conectores adversativos: "no obstante", "sin perjuicio de lo expuesto", "aun cuando", "siendo que", "antes bien".
- Lectura crítica de la prueba contraria: señalar lo que la otra parte omite, silencia o contradice. NO afirmar inverosimilitud con crudeza — insinuarla con sintaxis y elección de verbos ("la accionante pretende sostener que…", "se limita a invocar, sin acreditar…", "soslaya, no por azar, que…").
- Coherencia interna: cada párrafo debe encadenar con el anterior. Usar progresión: hecho → consecuencia jurídica → conclusión que favorece a mi parte.
- Sutileza: la suspicacia se construye con la elección léxica y la cadencia, no con adjetivos hostiles ("temerario", "malicioso") salvo si corresponde procesalmente.
- Ejemplos de registro deseado:
  · "Llama la atención que, frente a la contundencia del traslado de fs. tantas, la contraria haya optado por un silencio que no por elocuente resulta menos revelador."
  · "Aun cuando se admitiera, por vía de mera hipótesis, la versión que ensaya la actora, los propios hechos por ella narrados conducen ineludiblemente a la conclusión inversa."

NUNCA inventar hechos para sostener la retórica. La suspicacia debe anclarse en lo que SÍ está en las claves del expediente.`,
}

const REGISTRO_PROCESAL: RegistroSpec = {
  nombre: 'procesal',
  instrucciones: `# Registro tonal: PROCESAL / SECO

Este es un escrito de trámite. Debe ser claro, directo, sin retórica.

- Frases cortas, una idea por oración.
- Sin adjetivos persuasivos, sin conectores adversativos elaborados.
- Ir directo al pedido. Fundar lo necesario y nada más.
- Ejemplos: "Vengo a solicitar pronto despacho de la causa.", "Acompaño escrito de ofrecimiento de prueba.", "Solicito se libre oficio a la entidad bancaria indicada."`,
}

const OUTPUT_SCHEMA = `# Formato de salida (OBLIGATORIO)

Devolvé EXCLUSIVAMENTE un objeto JSON válido con esta forma (sin markdown, sin backticks, sin texto antes ni después):

{
  "titulo": "string en MAYÚSCULAS, entre comillas, ej: \\"CONTESTA TRASLADO Y OPONE EXCEPCIONES\\"",
  "encabezado_juez": "string, ej: \\"SR. JUEZ DE PRIMERA INSTANCIA EN LO CIVIL Y COMERCIAL DE LA Xª NOMINACIÓN\\"",
  "caratula": "string, la carátula del expediente tal como viene",
  "secciones": [
    {
      "titulo": "PERSONERÍA" | "OBJETO" | "HECHOS" | "DERECHO" | "PRUEBA" | "PETITORIO" | etc — en MAYÚSCULAS,
      "parrafos": ["string", "string", ...]
    }
  ],
  "citas": [
    { "chunk_id": 12345, "cita_texto": "fragmento textual del chunk que usaste" }
  ]
}

Reglas del JSON:
- "secciones" SIEMPRE comienza con "PERSONERÍA" (acreditando poder), y SIEMPRE termina con "PETITORIO".
- Cada "parrafos" es un array de strings sin saltos de línea internos. El renderer agrega sangría automáticamente.
- No incluyas el encabezado del abogado en "secciones" — eso lo arma el renderer con los datos del perfil.
- NO uses markdown adentro de los strings (nada de **negrita**, *cursiva*, listas con guiones).

Reglas para "citas":
- Si la sección "Normativa disponible" trae chunks, USALOS para fundar en derecho. Cada chunk citado va en "citas" con su chunk_id numérico exacto.
- "cita_texto" es el fragmento literal o casi-literal que tomaste del chunk (máx 250 caracteres).
- SOLO podés usar chunk_id que aparezcan en la sección "Normativa disponible". No inventes números.
- Si no hay normativa disponible o no necesitás citar, devolvé "citas": [].`

interface Profile {
  nombre: string | null
  apellido: string | null
  matricula: string | null
  matricula_libro: string | null
  matricula_folio: string | null
  domicilio_legal: string | null
  telefono: string | null
  email: string | null
  casillero_notif: string | null
  cuit: string | null
}

interface ExpedienteRow {
  id: string
  numero: string | null
  caratula: string | null
  numero_sae: string | null
  fuero: string | null
  estado_interno: string | null
  observaciones: string | null
  ai_brief: string | null
  cliente: { nombre: string | null; apellido: string | null } | { nombre: string | null; apellido: string | null }[] | null
}

interface MovementRow {
  id: string
  fecha: string
  titulo: string
  tipo_movimiento: string
  is_key: boolean | null
  ai_summary: string | null
  ai_suggested_action: { titulo?: string; descripcion?: string } | null
  ai_extracted: {
    partes?: string[]
    fechas?: { tipo: string; fecha_iso: string; descripcion: string }[]
    plazos?: { dias: number; habiles: boolean; vence_aprox: string | null; descripcion: string }[]
  } | null
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function filterClaves(movements: MovementRow[]): MovementRow[] {
  return movements.filter(m => {
    if (m.is_key === true) return true
    if (m.is_key === false) return false
    return KEY_TYPES.has(m.tipo_movimiento) || Boolean(m.ai_suggested_action)
  })
}

// ── RAG: recuperación de normativa ─────────────────────────────────────────

interface NormativaChunk {
  chunk_id: number
  documento_id: string
  contenido: string
  metadata: Record<string, unknown>
  score: number
  was_pinned: boolean
}

async function createQueryEmbedding(input: string, apiKey: string): Promise<number[] | null> {
  try {
    const res = await fetch(OPENROUTER_EMBEDDINGS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://app.marcorossi.com.ar',
        'X-Title': 'MR Abogado Escritos RAG',
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input }),
    })
    if (!res.ok) {
      console.error('[escritos-generate] embeddings error', res.status, await res.text().catch(() => ''))
      return null
    }
    const payload = await res.json() as { data?: { embedding?: number[] }[] }
    return payload.data?.[0]?.embedding ?? null
  } catch (e) {
    console.error('[escritos-generate] embeddings throw', e)
    return null
  }
}

function selectRelevantMatches(matches: NormativaChunk[]): NormativaChunk[] {
  const strong = matches.filter(m => m.score >= RAG_STRONG_THRESHOLD)
  if (strong.length > 0) return strong.slice(0, RAG_STRONG_TOPK)
  const fallback = matches.filter(m => m.score >= RAG_WEAK_THRESHOLD)
  return fallback.slice(0, RAG_WEAK_TOPK)
}

interface RagBundle {
  pinned: NormativaChunk[]
  retrieved: NormativaChunk[]
}

async function getRelevantNormativa(
  serviceClient: ReturnType<typeof createClient>,
  expedienteId: string,
  userId: string,
  query: string,
  apiKey: string,
): Promise<RagBundle> {
  // 1) Documentos fijados al expediente
  const { data: pinned, error: pinnedErr } = await serviceClient
    .from('expediente_normativa')
    .select('documento_id')
    .eq('expediente_id', expedienteId)
  if (pinnedErr) {
    console.error('[escritos-generate] pinned docs error', pinnedErr)
  }
  const pinnedDocIds = (pinned ?? []).map(p => (p as { documento_id: string }).documento_id)

  // 2) Chunks de los documentos fijados (sin retrieval, van todos sí o sí)
  let pinnedChunks: NormativaChunk[] = []
  if (pinnedDocIds.length > 0) {
    const { data: rows, error: chunksErr } = await serviceClient
      .from('normativa_chunks')
      .select('id, documento_id, contenido, metadata')
      .in('documento_id', pinnedDocIds)
      .order('documento_id')
      .order('orden')
      .limit(RAG_MAX_PINNED_CHUNKS)
    if (chunksErr) {
      console.error('[escritos-generate] pinned chunks error', chunksErr)
    } else {
      pinnedChunks = (rows ?? []).map(r => {
        const row = r as { id: number; documento_id: string; contenido: string; metadata: Record<string, unknown> }
        return {
          chunk_id: row.id,
          documento_id: row.documento_id,
          contenido: row.contenido,
          metadata: row.metadata ?? {},
          score: 1,
          was_pinned: true,
        }
      })
    }
  }

  // 3) Retrieval por similarity sobre el resto del corpus
  let retrievedChunks: NormativaChunk[] = []
  const embedding = await createQueryEmbedding(query, apiKey)
  if (embedding) {
    const { data: matches, error: matchErr } = await serviceClient.rpc('match_normativa_chunks', {
      query_embedding: embedding,
      filter_user_id: userId,
      match_count: RAG_MATCH_COUNT,
      exclude_documento_ids: pinnedDocIds,
    })
    if (matchErr) {
      console.error('[escritos-generate] match_normativa_chunks error', matchErr)
    } else {
      const all = (matches ?? []).map(m => {
        const row = m as { chunk_id: number; documento_id: string; contenido: string; metadata: Record<string, unknown>; score: number }
        return {
          chunk_id: row.chunk_id,
          documento_id: row.documento_id,
          contenido: row.contenido,
          metadata: row.metadata ?? {},
          score: row.score,
          was_pinned: false,
        }
      })
      retrievedChunks = selectRelevantMatches(all)
    }
  }

  return { pinned: pinnedChunks, retrieved: retrievedChunks }
}

function formatNormativaForPrompt(bundle: RagBundle): string {
  const all = [...bundle.pinned, ...bundle.retrieved]
  if (all.length === 0) return ''
  const entries = all.map(c => {
    const tag = c.was_pinned ? 'FIJADA' : `RECUPERADA (score ${c.score.toFixed(2)})`
    const meta = []
    if (c.metadata.titulo_documento) meta.push(String(c.metadata.titulo_documento))
    if (c.metadata.articulo) meta.push(`Art. ${c.metadata.articulo}`)
    if (c.metadata.seccion) meta.push(String(c.metadata.seccion))
    if (c.metadata.jurisdiccion) meta.push(`jurisdicción ${c.metadata.jurisdiccion}`)
    return `### chunk_id ${c.chunk_id} · ${tag} · ${meta.join(' — ') || 'sin metadata'}
${c.contenido}`
  }).join('\n\n')

  return `\n## Normativa disponible
Las siguientes piezas normativas son las ÚNICAS que podés citar. Cada una tiene un \`chunk_id\` numérico. Si una norma fundamenta un argumento, indicalo en el array "citas" del JSON de salida con su \`chunk_id\` y el fragmento que usaste.

${entries}`
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

    const body = await req.json().catch(() => null) as {
      expediente_id?: string
      tipo?: string
      titulo?: string
      instrucciones?: string
      template_id?: string | null
    } | null

    if (!body?.expediente_id) return json({ error: 'expediente_id requerido' }, 400)
    if (!body?.tipo?.trim()) return json({ error: 'tipo de escrito requerido' }, 400)

    // 1) Verificar acceso al expediente (RLS-respecting client)
    const { data: expAuth, error: authExpError } = await anonClient
      .from('expedientes')
      .select('id')
      .eq('id', body.expediente_id)
      .maybeSingle()
    if (authExpError || !expAuth) return json({ error: 'Expediente no encontrado o sin permisos' }, 404)

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 2) Cargar perfil del abogado (datos profesionales requeridos)
    const { data: profileRaw, error: profileError } = await serviceClient
      .from('profiles')
      .select('nombre, apellido, matricula, matricula_libro, matricula_folio, domicilio_legal, telefono, email, casillero_notif, cuit')
      .eq('id', user.id)
      .single()
    if (profileError || !profileRaw) return json({ error: 'Perfil del abogado no encontrado' }, 404)

    const profile = profileRaw as Profile
    if (!profile.matricula || !profile.domicilio_legal || !profile.cuit) {
      return json({
        error: 'Completá tus datos profesionales en Configuración antes de generar escritos (matrícula, domicilio legal, CUIT).',
        code: 'PROFILE_INCOMPLETE',
      }, 412)
    }

    // 3) Cargar expediente
    const { data: expRaw, error: expError } = await serviceClient
      .from('expedientes')
      .select('id, numero, caratula, numero_sae, fuero, estado_interno, observaciones, ai_brief, cliente:clientes(nombre, apellido)')
      .eq('id', body.expediente_id)
      .single()
    if (expError || !expRaw) return json({ error: 'Expediente no encontrado' }, 404)
    const exp = expRaw as unknown as ExpedienteRow

    // 4) Cargar movimientos y filtrar a SOLO claves
    const { data: movsRaw, error: movError } = await serviceClient
      .from('sae_movements')
      .select('id, fecha, titulo, tipo_movimiento, is_key, ai_summary, ai_suggested_action, ai_extracted')
      .eq('expediente_id', body.expediente_id)
      .order('fecha', { ascending: false })
    if (movError) throw movError

    const claves = filterClaves((movsRaw ?? []) as MovementRow[])

    // 5) Determinar registro tonal según tipo
    const registro = isTipoRetorico(body.tipo) ? REGISTRO_RETORICO : REGISTRO_PROCESAL

    // 6) Armar contexto del expediente
    const cliente = Array.isArray(exp.cliente) ? exp.cliente[0] : exp.cliente
    const clienteNombre = cliente
      ? `${cliente.apellido ?? ''} ${cliente.nombre ?? ''}`.trim()
      : 'Sin cliente registrado'

    const expedienteCtx = `## Expediente
- Número interno: ${exp.numero ?? 's/n'}
- Número SAE: ${exp.numero_sae ?? 's/n'}
- Carátula: ${exp.caratula ?? 's/n'}
- Fuero: ${exp.fuero ?? 's/n'}
- Estado interno: ${exp.estado_interno ?? 's/n'}
- Cliente representado: ${clienteNombre}
- Observaciones internas: ${exp.observaciones ?? '(ninguna)'}
${exp.ai_brief ? `\n## Brief del expediente\n${exp.ai_brief}` : ''}`

    const clavesCtx = claves.length === 0
      ? '\n## Actuaciones claves\n(No hay actuaciones marcadas como claves todavía.)'
      : `\n## Actuaciones claves (las únicas que considerás como contexto)\n${claves.map((m, i) => {
        const partes = m.ai_extracted?.partes?.join(', ')
        const fechas = m.ai_extracted?.fechas?.map(f => `${f.tipo} ${f.fecha_iso}: ${f.descripcion}`).join('; ')
        const plazos = m.ai_extracted?.plazos?.map(p => `${p.dias} ${p.habiles ? 'días háb.' : 'días'}${p.vence_aprox ? ` (vence ${p.vence_aprox})` : ''}: ${p.descripcion}`).join('; ')
        const accion = m.ai_suggested_action ? `Acción sugerida: ${m.ai_suggested_action.titulo}${m.ai_suggested_action.descripcion ? ` — ${m.ai_suggested_action.descripcion}` : ''}` : ''
        return `### Clave ${i + 1} (${m.fecha} · ${m.tipo_movimiento})
- Título: ${m.titulo}
- Resumen: ${m.ai_summary ?? '(sin resumen IA)'}${partes ? `\n- Partes: ${partes}` : ''}${fechas ? `\n- Fechas: ${fechas}` : ''}${plazos ? `\n- Plazos: ${plazos}` : ''}${accion ? `\n- ${accion}` : ''}`
      }).join('\n\n')}`

    const abogadoCtx = `## Datos del abogado firmante (NO incluyas en "secciones", solo te los doy para que sepas quién firma)
- Nombre: ${profile.nombre ?? ''} ${profile.apellido ?? ''}
- Matrícula: ${profile.matricula}${profile.matricula_libro ? ` Libro ${profile.matricula_libro}` : ''}${profile.matricula_folio ? ` Folio ${profile.matricula_folio}` : ''}
- Domicilio: ${profile.domicilio_legal}
- CUIT: ${profile.cuit}
- Teléfono: ${profile.telefono ?? ''}
- Email: ${profile.email ?? ''}`

    // 6.5) Retrieval de normativa: fijadas al expediente + top-k por similarity
    const ragQuery = [
      body.tipo,
      exp.caratula ?? '',
      exp.fuero ?? '',
      body.instrucciones ?? '',
      claves.slice(0, 5).map(c => c.ai_summary ?? c.titulo).join(' ').slice(0, 600),
    ].filter(Boolean).join(' — ')

    const rag = await getRelevantNormativa(serviceClient, body.expediente_id, user.id, ragQuery, apiKey)
    const validChunkIds = new Set<number>([...rag.pinned, ...rag.retrieved].map(c => c.chunk_id))
    const normativaCtx = formatNormativaForPrompt(rag)

    // 7) Armar system prompt
    const systemPrompt = [
      'Sos un asistente jurídico que redacta escritos judiciales para el fuero argentino.',
      'Trabajás exclusivamente con el material que se te entrega (perfil del abogado, expediente y actuaciones claves). NUNCA inventes hechos, partes, fechas ni citas legales.',
      '',
      SKILL_LEGAL,
      '',
      ARGENTINA_OVERRIDE,
      '',
      registro.instrucciones,
      '',
      OUTPUT_SCHEMA,
    ].join('\n')

    const userMessage = `Tipo de escrito a redactar: **${body.tipo}**
${body.titulo ? `Título sugerido por el abogado: "${body.titulo}"` : 'Decidí vos el título según el tipo.'}

${expedienteCtx}

${clavesCtx}

${normativaCtx}

${abogadoCtx}

${body.instrucciones?.trim() ? `## Instrucciones puntuales del abogado\n${body.instrucciones.trim()}` : ''}

Redactá el escrito siguiendo el formato JSON indicado.`

    // 8) Llamar al LLM
    const aiRes = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://app.marcorossi.com.ar',
        'X-Title': 'MR Abogado Escritos',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: registro.nombre === 'retorico' ? 0.6 : 0.3,
        max_tokens: 3500,
        response_format: { type: 'json_object' },
      }),
    })

    if (!aiRes.ok) {
      const txt = await aiRes.text()
      return json({ error: `OpenRouter ${aiRes.status}: ${txt.slice(0, 300)}` }, 502)
    }

    const payload = await aiRes.json() as { choices?: { message?: { content?: string } }[] }
    const raw = payload.choices?.[0]?.message?.content?.trim()
    if (!raw) return json({ error: 'El modelo no devolvió contenido' }, 502)

    let contenido: unknown
    try {
      contenido = JSON.parse(raw)
    } catch (_e) {
      // Algunos modelos meten ```json ... ```. Limpiamos por si acaso.
      const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
      try {
        contenido = JSON.parse(stripped)
      } catch {
        return json({ error: 'El modelo devolvió JSON inválido', raw: raw.slice(0, 500) }, 502)
      }
    }

    // 9) Guardar en DB
    const tituloFinal = (contenido as { titulo?: string })?.titulo ?? body.titulo ?? body.tipo
    const { data: escrito, error: insertError } = await serviceClient
      .from('escritos')
      .insert({
        expediente_id: body.expediente_id,
        user_id: user.id,
        template_id: body.template_id ?? null,
        titulo: String(tituloFinal),
        tipo: body.tipo,
        contenido,
        contexto_movement_ids: claves.map(c => c.id),
        instrucciones_usuario: body.instrucciones ?? null,
        registro_tonal: registro.nombre,
        modelo_ia: DEFAULT_MODEL,
      } as never)
      .select()
      .single()

    if (insertError) {
      console.error('[escritos-generate] insert error', insertError)
      return json({ error: `No se pudo guardar el escrito: ${insertError.message}` }, 500)
    }

    const escritoId = (escrito as { id: string }).id

    // 10) Validar y persistir citas (descarta chunk_ids inventados)
    const rawCitas = (contenido as { citas?: unknown }).citas
    const citas: { chunk_id: number; cita_texto: string }[] = Array.isArray(rawCitas)
      ? rawCitas.filter((c): c is { chunk_id: number; cita_texto: string } => {
          if (typeof c !== 'object' || c === null) return false
          const obj = c as { chunk_id?: unknown; cita_texto?: unknown }
          return typeof obj.chunk_id === 'number' && typeof obj.cita_texto === 'string'
        })
      : []

    const chunksByPinned = new Map<number, boolean>(
      [...rag.pinned, ...rag.retrieved].map(c => [c.chunk_id, c.was_pinned]),
    )
    const chunksByDoc = new Map<number, string>(
      [...rag.pinned, ...rag.retrieved].map(c => [c.chunk_id, c.documento_id]),
    )
    const chunksByScore = new Map<number, number>(
      [...rag.pinned, ...rag.retrieved].map(c => [c.chunk_id, c.score]),
    )

    const validCitas = citas
      .filter(c => validChunkIds.has(c.chunk_id))
      .slice(0, 30) // sanity cap

    if (validCitas.length > 0) {
      const citaRows = validCitas.map((c, i) => ({
        escrito_id: escritoId,
        chunk_id: c.chunk_id,
        documento_id: chunksByDoc.get(c.chunk_id) ?? null,
        cita_texto: c.cita_texto.slice(0, 1000),
        score: chunksByScore.get(c.chunk_id) ?? null,
        was_pinned: chunksByPinned.get(c.chunk_id) ?? false,
        orden: i + 1,
      }))
      const { error: citaErr } = await serviceClient.from('escrito_citas').insert(citaRows)
      if (citaErr) console.error('[escritos-generate] citas insert error', citaErr)
    }

    return json({
      escrito_id: escritoId,
      contenido,
      modelo: DEFAULT_MODEL,
      registro_tonal: registro.nombre,
      claves_usadas: claves.length,
      normativa_disponible: rag.pinned.length + rag.retrieved.length,
      normativa_fijada: rag.pinned.length,
      citas_persistidas: validCitas.length,
      citas_descartadas: citas.length - validCitas.length,
    })

  } catch (err) {
    console.error('[escritos-generate]', err)
    return json({ error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

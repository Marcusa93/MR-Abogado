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
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4'

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
  ]
}

Reglas del JSON:
- "secciones" SIEMPRE comienza con "PERSONERÍA" (acreditando poder), y SIEMPRE termina con "PETITORIO".
- Cada "parrafos" es un array de strings sin saltos de línea internos. El renderer agrega sangría automáticamente.
- No incluyas el encabezado del abogado en "secciones" — eso lo arma el renderer con los datos del perfil.
- NO uses markdown adentro de los strings (nada de **negrita**, *cursiva*, listas con guiones).`

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

${abogadoCtx}

${body.instrucciones?.trim() ? `## Instrucciones puntuales del abogado\n${body.instrucciones.trim()}` : ''}

Redactá el escrito siguiendo el formato JSON indicado.`

    // 8) Llamar al LLM
    const aiRes = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://mr-abogado-system.vercel.app',
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

    return json({
      escrito_id: (escrito as { id: string }).id,
      contenido,
      modelo: DEFAULT_MODEL,
      registro_tonal: registro.nombre,
      claves_usadas: claves.length,
    })

  } catch (err) {
    console.error('[escritos-generate]', err)
    return json({ error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

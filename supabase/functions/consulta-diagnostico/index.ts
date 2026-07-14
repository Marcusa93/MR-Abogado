// Genera diagnóstico jurídico multi-fuero desde notas de consulta inicial.
// Un módulo separado por cada área del derecho involucrada; llamadas LLM en paralelo.
// LLM-guarded, requiere auth.

import { corsHeaders } from '../_shared/cors.ts'
import { checkLlmGuard, logLlmCall } from '../_shared/llm-guard.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FUNCTION_NAME = 'consulta-diagnostico'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

// ── Expertise por área ────────────────────────────────────────────────────────

const AREA_EXPERTISE: Record<string, { label: string; expertise: string }> = {
  laboral_trabajador: {
    label: 'Laboral (trabajador)',
    expertise: `ESPECIALIDAD: Derecho laboral individual — perspectiva del TRABAJADOR
Marco: LCT 20.744, CCT aplicables, Ley 24.013 (trabajo no registrado), Ley 25.323 (duplicación de indemnizaciones), Ley 26.428.
Puntos clave a analizar:
- Fecha de ingreso y egreso, categoría convencional, antigüedad
- Forma del distracto: despido directo (art. 245 LCT), despido indirecto (art. 246), renuncia (art. 240), abandono
- Liquidación final: preaviso (art. 232/233), integración (art. 233), indemnización (art. 245), SAC, vacaciones
- Multas aplicables: arts. 8-15 Ley 24.013 (trabajo no registrado); art. 80 LCT (documentación); arts. 1-2 Ley 25.323 (falta de pago)
- Prescripción bienal (art. 256 LCT) — verificar fechas críticas
- CCT del sector: cuál aplica, categoría correspondiente
- BCRA: si el empleador era banco o se usó tarjeta empresa
- Daño moral: si hubo acoso laboral o discriminación
Honorario: siempre "cuota_litis" (20-25% sobre lo efectivamente obtenido en juicio o acuerdo homologado).`,
  },
  laboral_empleador: {
    label: 'Laboral (empleador)',
    expertise: `ESPECIALIDAD: Derecho laboral individual — perspectiva del EMPLEADOR
Marco: LCT 20.744, CCT aplicables.
Puntos clave a analizar:
- Validez de la causa de despido invocada (art. 243 LCT: debe comunicarse por escrito con expresión suficiente en el mismo acto)
- Suficiencia de la injuria como justa causa (art. 242 LCT): proporcionalidad, gravedad, contemporaneidad
- Carga probatoria y medios de prueba disponibles
- Cuantificación real de la exposición: indemnizaciones base + riesgo de multas
- Estrategia: continuar o negociar en SECLO / audiencia provincial conciliatoria
- Homologación de acuerdos (art. 15 LCT)
- Prescripción y riesgo de demandas colectivas del sector
Honorario: "honorario_fijo" o "arancel_escrito" según complejidad del caso.`,
  },
  civil: {
    label: 'Civil y comercial',
    expertise: `ESPECIALIDAD: Derecho civil y comercial
Marco: Código Civil y Comercial (Ley 26.994).
Puntos clave a analizar:
- Tipo de pretensión: responsabilidad extracontractual (art. 1716 CCC), contractual (art. 1749), cobro ejecutivo, nulidad, reivindicación, acción de daños
- Plazos de prescripción: 5 años (general, art. 2560 CCC); 3 años (responsabilidad civil, art. 2561); 1 año (seguros, art. 2562 inc. b)
- Factores de atribución: dolo, culpa, riesgo creado/vicio de la cosa (arts. 1757-1758 CCC)
- Rubros resarcibles: daño emergente, lucro cesante, pérdida de chance, daño moral (art. 1741 CCC), daño punitivo (art. 52 bis LDC si es relación de consumo)
- Actualización: tasa activa BNA, indexación post-sentencia
- Competencia: Cámara Civil y Comercial de Tucumán
Honorario: causa simple → "arancel_verbal"; documentación compleja, peritos o múltiples partes → "arancel_escrito"; monto elevado con éxito incierto → "cuota_litis".`,
  },
  familia: {
    label: 'Familia',
    expertise: `ESPECIALIDAD: Derecho de familia
Marco: CCC Libro Segundo (arts. 401-723), Ley 26.485 (violencia familiar/género), Ley 26.061 (niñez).
Puntos clave a analizar:
- Tipo de proceso: divorcio unilateral (art. 437 CCC), alimentos conyugales (art. 432) o filiales (art. 658), cuidado personal (art. 649 CCC), régimen de comunicación (art. 652 CCC), violencia familiar/género (Ley 26.485 — medidas perimetrales, exclusión del hogar, prohibición de contacto), adopción, filiación (art. 558 CCC), unión convivencial (Título III)
- Medidas cautelares urgentes disponibles y plazos para solicitarlas
- Competencia: Cámara de Familia de Tucumán (o juzgado unipersonal de familia)
- CAIJ: si el cliente no puede afrontar honorarios, posibilidad de patrocinio gratuito
- Urgencia: si hay violencia activa o riesgo para menores
Honorario: proceso de trámite simple → "arancel_verbal"; proceso contencioso prolongado → "arancel_escrito" o "honorario_fijo"; cuota de alimentos reclamada → posible "cuota_litis" sobre retroactivo.`,
  },
  previsional: {
    label: 'Previsional / jubilaciones',
    expertise: `ESPECIALIDAD: Derecho previsional
Marco: Ley 24.241 (SIJP), Ley 26.425 (SIPA), Ley 24.016 (docentes), normativa ANSES.
Puntos clave a analizar:
- Tipo de prestación: jubilación ordinaria (PBU+PC+PAP), pensión por fallecimiento, retiro por invalidez, PUAM, reajuste (RIPTE/Badaro/Eliff), mora de ANSES
- Cómputo de períodos cotizados: aportes registrados vs. no registrados (art. 25 Ley 24.241 — prueba testimonial para aportes no documentados)
- Reajuste automático de haberes: acción de reajuste cuando el haber queda por debajo de la movilidad legalmente correspondiente
- Mora de ANSES: si la resolución demoró más de 90 días hábiles, intereses aplicables
- Procedimiento administrativo previo: obligatorio antes de acudir a la justicia
- Competencia: Cámara Federal de la Seguridad Social (CFSS), con sede en CABA; puede iniciarse en Tucumán mediante auxilio jurisdiccional
Honorario: casos de reajuste o mora → "cuota_litis" (15-20% sobre diferencias obtenidas); tramitación de alta → "honorario_fijo" o "arancel_escrito".`,
  },
  penal: {
    label: 'Penal',
    expertise: `ESPECIALIDAD: Derecho penal y procesal penal
Marco: Código Penal argentino, CPPT (Código Procesal Penal de Tucumán — sistema acusatorio).
Puntos clave a analizar:
- Tipificación del hecho: figura penal aplicable del CP, pena en abstracto (escala mínimo-máximo), agravantes/atenuantes
- Etapa procesal actual: IPP (investigación preparatoria), acusación formal, juicio oral y público ante el Tribunal Oral Penal o Juzgado Correccional de Tucumán
- Calidad del cliente: imputado/procesado (defensa penal) vs. víctima/querellante particular (acusación privada o adhesión a fiscal)
- Medidas de coerción personal: detención preventiva (arts. 254-283 CPPT), prisión preventiva (art. 264 CPPT), peligro de fuga o entorpecimiento, morigeración (detención domiciliaria)
- Prescripción de la acción penal: arts. 62-67 CP — verificar si el hecho está prescripto según figura
- Salidas alternativas: suspensión del juicio a prueba (probation, art. 76 bis CP — solo si la pena en concreto no supera 3 años); acuerdo de juicio abreviado (arts. 357-363 CPPT)
- Acción civil resarcitoria: puede acumularse en sede penal (art. 29 CP) o iniciarse por separado en fuero civil
Honorario: "arancel_escrito" para defensa o querella de complejidad media; "honorario_fijo" para causas de larga duración; no se aplica cuota_litis en penal.`,
  },
  otro: {
    label: 'Otro',
    expertise: `Analizá el caso según los hechos descriptos, identificá el área del derecho aplicable y los pasos a seguir.
Considerá tanto el derecho de fondo como el procesal, y la competencia en el fuero tucumano.`,
  },
}

// ── Función que genera un módulo de diagnóstico para un área ─────────────────

async function generateModulo(
  area: string,
  ctx: {
    clienteLabel: string
    notas_libres: string
    contextosCtx: string
    normativaCtx: string
    jurisCtx: string
    allAreas: string[]
  },
  openrouterKey: string,
): Promise<Record<string, unknown> | null> {
  const expertise = AREA_EXPERTISE[area] ?? AREA_EXPERTISE['otro']
  const otherAreas = ctx.allAreas
    .filter(a => a !== area)
    .map(a => (AREA_EXPERTISE[a] ?? { label: a }).label)

  const systemPrompt = `Sos un abogado del Estudio Jurídico Dr. Marco Rossi, Tucumán, Argentina.
Generás diagnósticos jurídicos precisos y accionables para cada área del derecho involucrada en una consulta.
Contexto geográfico: fuero tucumano (Cámara Civil y Comercial, Cámara de Trabajo, Cámara de Familia, CFSS para previsional, Tribunales Penales de Tucumán).${ctx.normativaCtx || ctx.jurisCtx ? '\nCuando hay normativa o jurisprudencia anclada, priorizarla para fundamentar el diagnóstico.' : ''}

${expertise.expertise}

Devolvé ÚNICAMENTE un objeto JSON válido (sin markdown, sin texto extra) con esta estructura exacta:
{
  "area": "${area}",
  "fuero": "string — tribunal/fuero específico donde se tramita esta pretensión",
  "pretension": "string — qué reclama o necesita el cliente en esta área, en una oración técnica concisa",
  "chances_estimadas": "alta | media | baja | sin_datos",
  "acciones_recomendadas": ["string — paso concreto y accionable"],
  "riesgos": ["string — riesgo jurídico relevante"],
  "observaciones": "string — análisis técnico: prescripción, plazos, elementos de prueba, particularidades del fuero local. Si hay normativa o jurisprudencia anclada, referenciarla concretamente.",
  "checklist_cliente": ["string — documento o información a solicitar al cliente (máx. 6 ítems)"],
  "tipo_honorario_sugerido": "cuota_litis | arancel_verbal | arancel_escrito | honorario_fijo",
  "descripcion_honorarios": "string — justificación breve del honorario sugerido y condiciones"
}`

  const otherAreasNote = otherAreas.length > 0
    ? ` (el caso también involucra: ${otherAreas.join(', ')}, pero este análisis es exclusivamente para ${expertise.label})`
    : ''

  const userPrompt = `Cliente: ${ctx.clienteLabel}
Área a analizar: ${expertise.label}${otherAreasNote}

Hechos del caso:
${ctx.notas_libres.trim()}${ctx.contextosCtx}${ctx.normativaCtx}${ctx.jurisCtx}

Generá el diagnóstico para el área ${expertise.label}.`

  const llmRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openrouterKey}`,
      'HTTP-Referer': 'https://app.marcorossi.com.ar',
      'X-Title': 'MR Abogado Diagnóstico',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4-5',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    }),
  })

  if (!llmRes.ok) {
    console.error(`[consulta-diagnostico] LLM error para área ${area}: ${await llmRes.text()}`)
    return null
  }

  const llmData = await llmRes.json() as {
    choices?: Array<{ message: { content: string }; finish_reason?: string }>
    error?: { message?: string }
  }

  if (llmData.error || !llmData.choices?.length) return null

  const raw = llmData.choices[0].message?.content ?? ''
  if (!raw.trim()) return null

  let cleaned = raw.replace(/```(?:json)?/gi, '').trim()
  const braceStart = cleaned.indexOf('{')
  const braceEnd = cleaned.lastIndexOf('}')
  if (braceStart !== -1 && braceEnd > braceStart) {
    cleaned = cleaned.slice(braceStart, braceEnd + 1)
  }

  try {
    return JSON.parse(cleaned) as Record<string, unknown>
  } catch {
    console.error(`[consulta-diagnostico] JSON parse error para área ${area}:`, cleaned.slice(0, 300))
    return null
  }
}

// ── Handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY')!

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json(req, { error: 'No autorizado' }, 401)

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json(req, { error: 'No autorizado' }, 401)

  const adminClient = createClient(supabaseUrl, serviceKey)

  const body = await req.json().catch(() => ({}))
  const { consulta_id, nombre, apellido, tipo_asunto, areas_derecho, notas_libres } = body

  if (!notas_libres?.trim()) return json(req, { error: 'Faltan los hechos del caso' }, 400)
  if (!tipo_asunto) return json(req, { error: 'Falta el tipo de asunto' }, 400)

  // Determinar áreas a analizar; mínimo una
  const areas: string[] = (areas_derecho?.length ? areas_derecho : [tipo_asunto]) as string[]

  const inputBytes = new TextEncoder().encode(notas_libres).length
  const guard = await checkLlmGuard(adminClient, user.id, FUNCTION_NAME, inputBytes)
  if (!guard.ok) return json(req, { error: guard.error }, guard.status)

  // ── Contextos adicionales (grabaciones, documentos, apuntes) ─────────────
  let contextosCtx = ''
  if (consulta_id) {
    const { data: contextos } = await adminClient
      .from('consulta_contextos')
      .select('tipo, titulo, contenido')
      .eq('consulta_id', consulta_id)
      .order('created_at', { ascending: true })
    if (contextos && contextos.length > 0) {
      const bloques = (contextos as any[]).map(c => {
        const tipoLabel = c.tipo === 'grabacion' ? 'Transcripción de grabación'
          : c.tipo === 'documento' ? 'Documento'
          : 'Apunte adicional'
        return `### ${tipoLabel}: ${c.titulo}\n${(c.contenido as string).slice(0, 2000)}`
      })
      contextosCtx = `\n\n## Material adicional aportado por el abogado\n${bloques.join('\n\n')}`
    }
  }

  // ── Normativa anclada ─────────────────────────────────────────────────────
  let normativaCtx = ''
  if (consulta_id) {
    const { data: normDocs } = await adminClient
      .from('consulta_normativa')
      .select('documento_id, normativa_documentos(titulo, numero, tipo)')
      .eq('consulta_id', consulta_id)

    if (normDocs && normDocs.length > 0) {
      const normChunkBlocks: string[] = []
      for (const row of normDocs as any[]) {
        if (normChunkBlocks.length >= 16) break
        const { data: chunks } = await adminClient
          .from('normativa_chunks')
          .select('contenido')
          .eq('documento_id', row.documento_id)
          .order('orden', { ascending: true })
          .limit(4)
        const doc = row.normativa_documentos as any
        const docLabel = [doc?.titulo, doc?.numero].filter(Boolean).join(' — ')
        if (chunks && chunks.length > 0) {
          normChunkBlocks.push(
            `### ${docLabel}\n${chunks.map((c: any) => c.contenido).join('\n')}`
          )
        }
      }
      if (normChunkBlocks.length > 0) {
        normativaCtx = `\n\n## Normativa de referencia (anclada por el abogado)\n${normChunkBlocks.join('\n\n')}`
      }
    }
  }

  // ── Jurisprudencia anclada ────────────────────────────────────────────────
  let jurisCtx = ''
  if (consulta_id) {
    const { data: jurisDocs } = await adminClient
      .from('consulta_jurisprudencia')
      .select('documento_id, jurisprudencia_documentos(caratula, tribunal, fecha)')
      .eq('consulta_id', consulta_id)

    if (jurisDocs && jurisDocs.length > 0) {
      const jurisChunkBlocks: string[] = []
      for (const row of jurisDocs as any[]) {
        if (jurisChunkBlocks.length >= 12) break
        const { data: chunks } = await adminClient
          .from('jurisprudencia_chunks')
          .select('contenido')
          .eq('documento_id', row.documento_id)
          .order('orden', { ascending: true })
          .limit(3)
        const doc = row.jurisprudencia_documentos as any
        const docLabel = [doc?.caratula, doc?.tribunal, doc?.fecha].filter(Boolean).join(' · ')
        if (chunks && chunks.length > 0) {
          jurisChunkBlocks.push(
            `### ${docLabel}\n${chunks.map((c: any) => c.contenido).join('\n')}`
          )
        }
      }
      if (jurisChunkBlocks.length > 0) {
        jurisCtx = `\n\n## Jurisprudencia de referencia (anclada por el abogado)\n${jurisChunkBlocks.join('\n\n')}`
      }
    }
  }

  const clienteLabel = [nombre, apellido].filter(Boolean).join(' ') || 'el consultante'

  // ── Llamadas LLM paralelas por área ──────────────────────────────────────
  const ctx = { clienteLabel, notas_libres, contextosCtx, normativaCtx, jurisCtx, allAreas: areas }
  const results = await Promise.allSettled(
    areas.map(area => generateModulo(area, ctx, openrouterKey))
  )

  const modulos = results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => (r as PromiseFulfilledResult<Record<string, unknown>>).value)

  if (modulos.length === 0) {
    return json(req, { error: 'No se pudo generar ningún diagnóstico. Intentá de nuevo.' }, 500)
  }

  const diagnostico = { modulos }

  // ── Persistir en DB ───────────────────────────────────────────────────────
  if (consulta_id) {
    await adminClient
      .from('consultas')
      .update({
        diagnostico_ia: diagnostico,
        diagnostico_at: new Date().toISOString(),
        areas_derecho: areas,
        estado: 'en_proceso',
        updated_at: new Date().toISOString(),
      })
      .eq('id', consulta_id)
  }

  logLlmCall(adminClient, user.id, FUNCTION_NAME, inputBytes)

  return json(req, { ok: true, diagnostico })
})

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { checkLlmGuard, logLlmCall, estimateBytes } from '../_shared/llm-guard.ts'

const FUNCTION_NAME = 'consulta-intimacion'

// deno-lint-ignore no-explicit-any
function json(req: Request, body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

// ── System prompts ────────────────────────────────────────────────────────────

const SYSTEM_CD = `Sos un abogado argentino experto en redacción de cartas documento fehacientes.

Tu tarea es redactar el CUERPO del texto de una carta documento, con lenguaje jurídico preciso y estilo formal.

REGLAS OBLIGATORIAS:
- Redactá solo el cuerpo (sin encabezado de partes, lugar/fecha ni firma — esos van en el formulario)
- Comenzá con "Por la presente me dirijo a Ud. a fin de" o similar
- Usá MAYÚSCULAS para los verbos de intimación: INTIMAR, NOTIFICAR, REQUERIR, DENUNCIAR, etc.
- Incluí siempre un plazo perentorio claro: 48 horas hábiles (laboral), 5 días hábiles (civil), o el que corresponda según el caso
- Cerrá siempre con: "Bajo apercibimiento de iniciar las acciones legales y/o judiciales que correspondan, con más costas y honorarios a su cargo."
- Si hay más argumentos posibles, agregá: "Me reservo el derecho de ampliar la presente."
- Mencioná la normativa aplicable cuando sea relevante (LCT, CC, CCT, etc.)
- Tono formal, directo, sin vaguedades
- Entre 80 y 250 palabras

Respondé SOLO con el cuerpo de la carta documento. Sin explicaciones, sin markdown, sin encabezados.`

const SYSTEM_TELEGRAMA = `Sos un abogado argentino experto en derecho laboral. Redactás telegramas ley con el formato preciso exigido por el art. 243 LCT y el Decreto 326/56.

REGLAS OBLIGATORIAS:
- Muy conciso: máximo 120 palabras (los telegramas cobran por palabra en Correo Argentino)
- Redactá SOLO el texto del mensaje (sin datos de partes — van en el formulario)
- Primera persona del remitente, directa y sin preámbulos
- Para despidos con causa (art. 243 LCT): indicar la causa en forma clara y concreta en el mismo acto. Sin causa → despido incausado
- Para intimaciones laborales: plazo de 48 horas hábiles bajo apercibimiento de considerar abandono / injuria suficiente
- Para renuncias: indicar que se pone el cargo a disposición a partir de la fecha
- Para emplazamiento de entrega de documentación (art. 80 LCT): citar el artículo
- Cerrá siempre con "Queda Ud. notificado/a." o "Reservo acciones." según corresponda
- Sin signos de puntuación innecesarios (los telegramas los evitan para ahorrar palabras)

Respondé SOLO con el texto del telegrama. Sin explicaciones, sin markdown, sin encabezados.`

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  try {
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: { user }, error: authErr } = await anonClient.auth.getUser()
    if (authErr || !user) return json(req, { error: 'No autenticado' }, 401)

    const body = await req.json()
    const { consulta_id, tipo, destinatario_nombre, destinatario_domicilio } = body as {
      consulta_id: string
      tipo: 'carta_documento' | 'telegrama_ley'
      destinatario_nombre?: string
      destinatario_domicilio?: string
    }

    if (!consulta_id || !tipo) return json(req, { error: 'Faltan datos obligatorios' }, 400)
    if (!['carta_documento', 'telegrama_ley'].includes(tipo)) return json(req, { error: 'Tipo inválido' }, 400)

    // Fetch consulta (via admin para acceso sin RLS)
    const { data: consulta, error: cErr } = await (adminClient as any)
      .from('consultas')
      .select('tipo_asunto, notas_libres, diagnostico_ia')
      .eq('id', consulta_id)
      .single()
    if (cErr || !consulta) return json(req, { error: 'Consulta no encontrada' }, 404)

    const inputBytes = estimateBytes({ tipo, destinatario_nombre, notas: consulta.notas_libres })
    const guard = await checkLlmGuard(adminClient, user.id, FUNCTION_NAME, inputBytes)
    if (!guard.ok) return json(req, { error: guard.error }, guard.status)

    // Construir el mensaje al LLM
    const TIPO_ASUNTO_ES: Record<string, string> = {
      laboral_trabajador: 'Laboral (trabajador)',
      laboral_empleador: 'Laboral (empleador)',
      civil: 'Civil',
      familia: 'Familia',
      previsional: 'Previsional',
      penal: 'Penal',
      otro: 'Otro',
    }

    const diag = consulta.diagnostico_ia as {
      fuero?: string
      pretension?: string
      acciones_recomendadas?: string[]
    } | null

    const userMsg = [
      `TIPO DE ASUNTO: ${TIPO_ASUNTO_ES[consulta.tipo_asunto] ?? consulta.tipo_asunto}`,
      destinatario_nombre ? `DESTINATARIO: ${destinatario_nombre}` : '',
      destinatario_domicilio ? `DOMICILIO DESTINATARIO: ${destinatario_domicilio}` : '',
      '',
      'HECHOS DEL CASO:',
      (consulta.notas_libres ?? '(sin hechos detallados)').slice(0, 2500),
      diag ? [
        '',
        'DIAGNÓSTICO JURÍDICO (contexto):',
        diag.fuero ? `Fuero: ${diag.fuero}` : '',
        diag.pretension ? `Pretensión: ${diag.pretension}` : '',
        diag.acciones_recomendadas?.length
          ? `Acciones: ${diag.acciones_recomendadas.slice(0, 3).join(' | ')}`
          : '',
      ].filter(Boolean).join('\n') : '',
    ].filter(l => l !== null).join('\n').trim()

    const systemPrompt = tipo === 'telegrama_ley' ? SYSTEM_TELEGRAMA : SYSTEM_CD

    const openrouterKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!openrouterKey) return json(req, { error: 'OpenRouter no configurado' }, 500)

    const llmRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://mr-abogado.com',
        'X-Title': 'MR Abogado',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-haiku-4.5',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMsg },
        ],
        temperature: 0.25,
        max_tokens: 700,
      }),
    })

    if (!llmRes.ok) {
      const errText = await llmRes.text()
      console.error('[consulta-intimacion] OpenRouter error:', errText)
      return json(req, { error: 'Error al generar el texto' }, 502)
    }

    const llmData = await llmRes.json()
    const cuerpo = llmData.choices?.[0]?.message?.content?.trim()
    if (!cuerpo) return json(req, { error: 'El modelo no generó texto' }, 502)

    logLlmCall(adminClient, user.id, FUNCTION_NAME, inputBytes)

    return json(req, { ok: true, cuerpo })
  } catch (e) {
    console.error('[consulta-intimacion] error:', e)
    return json(req, { error: 'Error interno' }, 500)
  }
})

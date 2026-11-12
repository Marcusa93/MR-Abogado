// escrito-asistente — conversación con la IA sobre un borrador de escrito.
//
// El abogado pide cambios en lenguaje natural ("hacé más fuerte el agravio 2",
// "agregá la reserva del caso federal", "¿falta algo para contestar en término?").
// La IA responde y, si corresponde, PROPONE cambios puntuales que el abogado
// acepta o rechaza uno por uno en el editor. Nunca modifica el escrito por sí sola.
//
// Body:
// {
//   escrito_id: string,
//   contenido: EscritoContenido,          // versión actual en pantalla (puede no estar guardada)
//   mensajes: { role: 'user' | 'assistant', content: string }[],
//   foco?: { seccion: number, parrafo?: number | null } | null,   // 1-based
//   calidad?: 'auto' | 'preciso' | 'rapido'
// }
// Returns: { respuesta, cambios: Cambio[], modelo, modelo_nombre, uso }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { checkLlmGuard, logLlmCall } from '../_shared/llm-guard.ts'
import { MODELO, leerUso, nombreModelo } from '../_shared/modelos-ia.ts'

const FUNCTION_NAME = 'escrito-asistente'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

interface Seccion { titulo: string; parrafos: string[] }
interface Contenido {
  titulo?: string
  caratula?: string
  encabezado_juez?: string
  presentacion?: string
  secciones: Seccion[]
}

interface Cambio {
  accion: 'reemplazar' | 'insertar_despues' | 'eliminar' | 'nueva_seccion' | 'reemplazar_seccion'
  seccion: number
  parrafo?: number | null
  titulo?: string | null
  texto?: string | null
  motivo: string
}

const SISTEMA = `Sos el asistente de redacción de un estudio jurídico de Tucumán (Argentina). Trabajás junto al abogado sobre un escrito judicial ya redactado.

Tu forma de trabajar:
- Respondés en español rioplatense formal, breve y concreto, sin emojis.
- Si el abogado pide un cambio, lo PROPONÉS en "cambios"; no describas el texto nuevo en la respuesta, ponelo en el cambio.
- Si hace una pregunta (¿falta algo?, ¿está en término?, ¿qué opinás del agravio?), respondé con criterio jurídico y, si corresponde, proponé cambios.
- No inventes hechos, fechas, partes, normas ni fallos. Si algo no surge del material, decilo y marcá en el texto [COMPLETAR: ...].
- Mantené el registro del escrito: formal, impersonal, vocabulario jurídico preciso, sin markdown ni viñetas.
- Cambios mínimos y precisos: tocá solo lo necesario.

El escrito viene numerado: [S2] es la sección 2 y [S2.P3] su párrafo 3 (base 1).

Acciones posibles en "cambios":
- "reemplazar": reemplaza el párrafo seccion/parrafo por "texto".
- "insertar_despues": inserta un párrafo nuevo "texto" después de seccion/parrafo (parrafo 0 = al principio de la sección).
- "eliminar": elimina el párrafo seccion/parrafo.
- "reemplazar_seccion": reemplaza todos los párrafos de la sección por "texto" (párrafos separados por una línea en blanco); "titulo" opcional para renombrarla.
- "nueva_seccion": agrega una sección nueva con "titulo" y "texto" DESPUÉS de la sección indicada (seccion 0 = al principio).

Formato de salida (JSON estricto, nada fuera del JSON):
{
  "respuesta": "lo que le decís al abogado (2 a 6 oraciones)",
  "cambios": [
    { "accion": "reemplazar", "seccion": 2, "parrafo": 3, "texto": "...", "motivo": "por qué, en una línea" }
  ]
}
Si no hay cambios que proponer, "cambios": [].`

function numerar(c: Contenido): string {
  const l: string[] = []
  if (c.titulo) l.push(`TÍTULO: ${c.titulo}`)
  if (c.encabezado_juez) l.push(`ENCABEZADO: ${c.encabezado_juez}`)
  if (c.caratula) l.push(`CARÁTULA: ${c.caratula}`)
  if (c.presentacion) l.push(`PRESENTACIÓN: ${c.presentacion}`)
  c.secciones.forEach((s, i) => {
    l.push(`\n[S${i + 1}] ${s.titulo}`)
    s.parrafos.forEach((p, j) => l.push(`[S${i + 1}.P${j + 1}] ${p}`))
  })
  return l.join('\n')
}

function parseJson(raw: string): unknown {
  try { return JSON.parse(raw) } catch { /* sigue */ }
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}')
  if (a >= 0 && b > a) { try { return JSON.parse(raw.slice(a, b + 1)) } catch { /* sigue */ } }
  return null
}

function validarCambios(raw: unknown, c: Contenido): Cambio[] {
  if (!Array.isArray(raw)) return []
  const out: Cambio[] = []
  for (const x of raw.slice(0, 12)) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    const accion = String(o.accion ?? '') as Cambio['accion']
    const seccion = Number(o.seccion)
    const parrafo = o.parrafo == null ? null : Number(o.parrafo)
    const texto = typeof o.texto === 'string' ? o.texto.trim() : null
    const titulo = typeof o.titulo === 'string' ? o.titulo.trim() : null
    const motivo = typeof o.motivo === 'string' ? o.motivo.trim() : ''
    const sec = c.secciones[seccion - 1]
    if (accion === 'nueva_seccion') {
      if (!(seccion >= 0 && seccion <= c.secciones.length) || !texto || !titulo) continue
    } else if (!sec) {
      continue
    } else if (accion === 'reemplazar' || accion === 'eliminar') {
      if (!(parrafo && parrafo >= 1 && parrafo <= sec.parrafos.length)) continue
      if (accion === 'reemplazar' && !texto) continue
    } else if (accion === 'insertar_despues') {
      if (parrafo == null || parrafo < 0 || parrafo > sec.parrafos.length || !texto) continue
    } else if (accion === 'reemplazar_seccion') {
      if (!texto) continue
    } else {
      continue
    }
    out.push({ accion, seccion, parrafo, titulo, texto, motivo })
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  try {
    const apiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!apiKey) return json(req, { error: 'OPENROUTER_API_KEY no configurada' }, 500)

    const body = await req.json().catch(() => null) as {
      escrito_id?: string
      contenido?: Contenido
      mensajes?: { role: string; content: string }[]
      foco?: { seccion: number; parrafo?: number | null } | null
      calidad?: 'auto' | 'preciso' | 'rapido'
      on_behalf_of_user_id?: string
    } | null

    // Llamada interna (bot de escritos de Telegram): service role + on_behalf_of_user_id.
    const authHeader = req.headers.get('Authorization') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const interna = authHeader === `Bearer ${serviceKey}`
    const anon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      interna ? serviceKey : Deno.env.get('SUPABASE_ANON_KEY')!,
      interna ? {} : { global: { headers: { Authorization: authHeader } } },
    )
    let user: { id: string }
    if (interna) {
      if (!body?.on_behalf_of_user_id) return json(req, { error: 'on_behalf_of_user_id requerido' }, 400)
      user = { id: body.on_behalf_of_user_id }
    } else {
      const { data: { user: u }, error: authError } = await anon.auth.getUser()
      if (authError || !u) return json(req, { error: 'No autorizado' }, 401)
      user = u
    }
    if (!body?.escrito_id) return json(req, { error: 'escrito_id requerido' }, 400)
    if (!body.contenido || !Array.isArray(body.contenido.secciones)) return json(req, { error: 'contenido requerido' }, 400)
    const mensajes = (body.mensajes ?? [])
      .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-12)
    if (!mensajes.length || mensajes[mensajes.length - 1].role !== 'user') return json(req, { error: 'Falta el mensaje del abogado' }, 400)

    // Acceso: el escrito tiene que ser visible para el usuario (RLS)
    const { data: escrito, error: escErr } = await anon
      .from('escritos')
      .select('id, tipo, expediente_id, registro_tonal')
      .eq('id', body.escrito_id)
      .maybeSingle()
    if (escErr || !escrito) return json(req, { error: 'Escrito no encontrado o sin permisos' }, 404)
    const esc = escrito as { id: string; tipo: string | null; expediente_id: string | null; registro_tonal: string | null }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const escritoNumerado = numerar(body.contenido)
    const inputBytes = new TextEncoder().encode(escritoNumerado + JSON.stringify(mensajes)).length
    const guard = await checkLlmGuard(admin, user.id, FUNCTION_NAME, inputBytes)
    if (!guard.ok) return json(req, { error: guard.error }, guard.status)

    // Contexto: expediente, últimas actuaciones, citas verificadas y perfil de redacción
    const [expRes, movsRes, citasRes, perfilesRes] = await Promise.all([
      esc.expediente_id
        ? admin.from('expedientes').select('caratula, fuero, numero_sae, ai_brief, estrategia_redaccion').eq('id', esc.expediente_id).maybeSingle()
        : Promise.resolve({ data: null }),
      esc.expediente_id
        ? admin.from('sae_movements').select('fecha, tipo_movimiento, titulo, ai_summary').eq('expediente_id', esc.expediente_id).order('fecha', { ascending: false }).limit(10)
        : Promise.resolve({ data: [] }),
      admin.from('escrito_citas').select('cita_texto, chunk_id').eq('escrito_id', esc.id).limit(20),
      admin.from('redaccion_perfiles').select('ambito, tono, formulas, evitar, citas, notas').or(`ambito.eq.estudio,profile_id.eq.${user.id}`),
    ])

    const ctx: string[] = []
    const exp = expRes.data as { caratula?: string; fuero?: string; numero_sae?: string; ai_brief?: string; estrategia_redaccion?: string } | null
    if (exp) {
      ctx.push(`## Expediente\nCarátula: ${exp.caratula ?? 's/d'}\nFuero: ${exp.fuero ?? 's/d'}\nNúmero SAE: ${exp.numero_sae ?? 's/d'}`)
      if (exp.ai_brief) ctx.push(`## Resumen del expediente\n${exp.ai_brief.slice(0, 2500)}`)
      if (exp.estrategia_redaccion?.trim()) ctx.push(`## Estrategia del caso (definida por el abogado)\n${exp.estrategia_redaccion.trim()}`)
    }
    const movs = (movsRes.data ?? []) as { fecha: string; tipo_movimiento: string; titulo: string; ai_summary: string | null }[]
    if (movs.length) {
      ctx.push(`## Últimas actuaciones del SAE\n${movs.map(m => `- ${m.fecha} · ${m.tipo_movimiento}: ${m.titulo}${m.ai_summary ? ` — ${m.ai_summary.slice(0, 160)}` : ''}`).join('\n')}`)
    }
    const citas = (citasRes.data ?? []) as { cita_texto: string }[]
    if (citas.length) ctx.push(`## Citas verificadas en el corpus del estudio (podés apoyarte en ellas)\n${citas.map(c => `- ${c.cita_texto.slice(0, 300)}`).join('\n')}`)
    const perfiles = (perfilesRes.data ?? []) as { ambito: string; tono: string | null; formulas: string | null; evitar: string | null; citas: string | null; notas: string | null }[]
    for (const p of perfiles) {
      const partes = [p.tono && `Tono: ${p.tono}`, p.formulas && `Fórmulas: ${p.formulas}`, p.evitar && `Nunca: ${p.evitar}`, p.citas && `Citas: ${p.citas}`, p.notas && `Otras: ${p.notas}`].filter(Boolean)
      if (partes.length) ctx.push(`## Perfil de redacción (${p.ambito === 'estudio' ? 'estudio' : 'abogado'})\n${partes.join('\n')}`)
    }
    if (esc.registro_tonal === 'retorico') ctx.push('Registro del escrito: retórico-argumentativo (contesta, recurre o alega).')

    const foco = body.foco
      ? `\nEl abogado tiene seleccionado ${body.foco.parrafo ? `el párrafo [S${body.foco.seccion}.P${body.foco.parrafo}]` : `la sección [S${body.foco.seccion}]`}: si el pedido es ambiguo, se refiere a eso.`
      : ''

    const modelo = body.calidad === 'preciso' ? MODELO.preciso : MODELO.equilibrado

    const historial = mensajes.slice(0, -1).map(m => ({ role: m.role, content: m.content.slice(0, 4000) }))
    const ultimo = mensajes[mensajes.length - 1].content.slice(0, 6000)

    const ac = new AbortController()
    const tid = setTimeout(() => ac.abort(), 120_000)
    let res: Response
    try {
      res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://app.marcorossi.com.ar',
          'X-Title': 'MR Abogado Asistente de escritos',
        },
        body: JSON.stringify({
          model: modelo,
          messages: [
            { role: 'system', content: `${SISTEMA}\n\n${ctx.join('\n\n')}` },
            { role: 'user', content: `## Escrito actual (tipo: ${esc.tipo ?? 's/d'})\n${escritoNumerado}` },
            { role: 'assistant', content: '{"respuesta": "Tengo el escrito a la vista. ¿Qué necesitás?", "cambios": []}' },
            ...historial,
            { role: 'user', content: `${ultimo}${foco}` },
          ],
          temperature: 0.3,
          max_tokens: 5000,
          response_format: { type: 'json_object' },
          usage: { include: true },
        }),
        signal: ac.signal,
      })
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return json(req, { error: 'El modelo tardó demasiado. Probá de nuevo.' }, 504)
      throw e
    } finally {
      clearTimeout(tid)
    }
    if (!res.ok) {
      const t = await res.text()
      console.error('[escrito-asistente] OpenRouter', res.status, t.slice(0, 300))
      return json(req, { error: `El modelo respondió con error (${res.status})` }, 502)
    }
    const payload = await res.json()
    const raw = String(payload?.choices?.[0]?.message?.content ?? '').trim()
    const parsed = parseJson(raw) as { respuesta?: string; cambios?: unknown } | null
    if (!parsed) return json(req, { error: 'El modelo devolvió una respuesta ilegible. Probá reformular.' }, 502)

    const uso = leerUso(payload)
    logLlmCall(admin, user.id, FUNCTION_NAME, inputBytes, { costo_usd: uso.costo_usd, modelo, escrito_id: body.escrito_id })
    return json(req, {
      respuesta: String(parsed.respuesta ?? '').trim() || 'Listo.',
      cambios: validarCambios(parsed.cambios, body.contenido),
      modelo,
      modelo_nombre: nombreModelo(modelo),
      uso,
    })
  } catch (err) {
    console.error('[escrito-asistente]', err)
    return json(req, { error: err instanceof Error ? err.message : 'Error interno' }, 500)
  }
})

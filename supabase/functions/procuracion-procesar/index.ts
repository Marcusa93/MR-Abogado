// Procuración automática.
//
// Para cada expediente con procuracion_auto = true:
//   1. Sincroniza con el SAE (sae-sync) y baja los cuerpos (sae-fetch-bodies),
//      con las credenciales SAE de alguien del expediente.
//   2. Toma las actuaciones nuevas que todavía no procesó (procuracion_eventos).
//   3. Las clasifica con IA contra el catálogo plazos_procesales del fuero.
//   4. Calcula el vencimiento (días hábiles, feria judicial, feriados).
//   5. Si hay que presentar un escrito, lo deja en BORRADOR (escritos-generate).
//      Nunca presenta: el abogado revisa, firma y presenta.
//   6. Crea la tarea para el responsable (el trigger de tareas le avisa por Telegram).
//   7. Le manda a Marco un resumen por Telegram.
//
// Auth:
//   - Cron: header x-cron-secret == CRON_SECRET → todos los expedientes activos.
//   - Usuario (botón "Procesar ahora"): JWT + body { expediente_id } → solo ese.
// Deploy con --no-verify-jwt (valida el JWT acá adentro).
// Secrets: CRON_SECRET, OPENROUTER_API_KEY, TELEGRAM_ESCRITO_BOT_TOKEN, TELEGRAM_MARCO_CHAT_ID

import { corsHeaders } from '../_shared/cors.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkLlmGuard, logLlmCall } from '../_shared/llm-guard.ts'
import {
  calcularVencimiento, fetchFeriadosArgentina, getTucumanProvincialFeriados, type FeriaPeriod,
} from '../_shared/judicial-calendar.ts'

const FUNCTION_NAME = 'procuracion-procesar'
// Mismo modelo que escritos-generate: con haiku la lectura procesal era floja
// (confundía apertura a prueba con ofrecimiento, accionaba sobre escritos de la contraria).
const MODELO = 'anthropic/claude-sonnet-4'
const APP_URL = 'https://app.marcorossi.com.ar'

// Topes por corrida (la function corta a los ~150 s)
const MAX_ACTUACIONES = 12
const MAX_ESCRITOS = 4
const PRESUPUESTO_MS = 110_000
// Re-sincronizar con el SAE si el último sync tiene más de esto
const RESYNC_MIN = 50
// Actuaciones de hasta N días antes de activar el interruptor también se procesan
const VENTANA_PREVIA_DIAS = 15
// Si el cuerpo no llegó, esperar hasta N horas antes de procesar solo con el título
const ESPERA_CUERPO_HORAS = 6

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

interface Expediente {
  id: string
  caratula: string | null
  numero: string | null
  numero_sae: string | null
  fuero: string | null
  procuracion_desde: string | null
  procuracion_responsable_id: string | null
  abogado_responsable_id: string | null
  created_by: string | null
  ultima_sincronizacion_sae: string | null
  clientes: { nombre: string | null; apellido: string | null } | null
}

/** A quién representamos y quiénes son nuestros abogados (para leer las actuaciones). */
interface Contexto { cliente: string; abogados: string[] }

interface Movimiento {
  id: string
  fecha: string
  titulo: string
  cuerpo: string | null
  tipo_movimiento: string | null
  ai_summary: string | null
  created_at: string
}

interface Plazo { tipo_acto: string; dias: number; es_habiles: boolean; base_legal: string | null }

interface Clasificacion {
  resumen: string
  requiere_accion: boolean
  tipo_acto: string | null
  dias: number | null
  es_habiles: boolean
  accion: string | null
  prioridad: 'URGENTE' | 'ALTA' | 'MEDIA' | 'BAJA'
  escrito: { tipo: string; instrucciones: string } | null
}

interface Resultado {
  expediente: string
  actuacion: string
  estado: 'procesado' | 'sin_accion' | 'error'
  accion?: string | null
  vencimiento?: string | null
  escrito?: boolean
  error?: string
}

// Actuaciones de mero trámite del portal: no generan carga para la parte.
const TRIVIAL_RE = /^(mostrador|cargo\s*-\s*cargo|pase\b|acta de sorteo|cargo inicio digital)/i

function esTrivial(m: Movimiento): boolean {
  return m.tipo_movimiento === 'planilla' || TRIVIAL_RE.test(m.titulo.trim())
}

async function clasificar(
  exp: Expediente,
  m: Movimiento,
  catalogo: Plazo[],
  ctx: Contexto,
): Promise<{ data: Clasificacion; bytes: number }> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) throw new Error('OPENROUTER_API_KEY no configurada')

  const catalogoTxt = catalogo.length
    ? catalogo.map(p => `- ${p.tipo_acto}: ${p.dias} días ${p.es_habiles ? 'hábiles' : 'corridos'}${p.base_legal ? ` (${p.base_legal})` : ''}`).join('\n')
    : '(sin catálogo para este fuero)'

  const system =
    'Sos procurador de un estudio jurídico de Tucumán, Argentina. Leés cada actuación judicial ' +
    'nueva de un expediente y decidís qué tiene que hacer la parte que representamos. ' +
    'Respondé SOLO un objeto JSON válido, sin texto alrededor.'

  const user =
    `Fuero: ${exp.fuero ?? 'sin dato'}\n` +
    `Carátula: ${exp.caratula ?? exp.numero ?? ''}\n` +
    `Representamos a: ${ctx.cliente || 'nuestro cliente (ver carátula)'}\n` +
    `Abogados del estudio (si un escrito dice "POR: <apellido>" de esta lista, lo presentamos nosotros): ${ctx.abogados.join(', ') || 'sin dato'}\n\n` +
    `Actuación del ${m.fecha} (tipo: ${m.tipo_movimiento ?? 'otro'})\n` +
    `Título: ${m.titulo}\n` +
    `Texto:\n${(m.cuerpo ?? '').slice(0, 12000) || '(sin texto, solo el título)'}\n\n` +
    `Catálogo de plazos del fuero:\n${catalogoTxt}\n\n` +
    'Devolvé este JSON:\n' +
    '{\n' +
    '  "resumen": "1 o 2 oraciones: qué dispuso el juzgado",\n' +
    '  "requiere_accion": true | false,\n' +
    '  "tipo_acto": "uno del catálogo (exacto) o null",\n' +
    '  "dias": número de días del plazo si el texto lo fija y no está en el catálogo, o null,\n' +
    '  "es_habiles": true | false,\n' +
    '  "accion": "qué hay que hacer, en infinitivo y corto (ej. Contestar traslado de la demanda) o null",\n' +
    '  "prioridad": "URGENTE" | "ALTA" | "MEDIA" | "BAJA",\n' +
    '  "escrito": { "tipo": "tipo de escrito a presentar", "instrucciones": "qué debe decir, con los datos de la actuación" } o null\n' +
    '}\n\n' +
    'Reglas:\n' +
    '- Mero trámite sin carga para nuestra parte ("téngase presente", "agréguese", "por presentado"): ' +
    'requiere_accion=false, escrito=null.\n' +
    '- Escritos que presentamos nosotros (POR: uno de nuestros abogados): requiere_accion=false, salvo que ' +
    'quede algo pendiente de nuestro lado.\n' +
    '- Escritos de la contraria (POR: un abogado que NO es del estudio): requiere_accion=false, aunque sean ' +
    'ofrecimientos de prueba o contestaciones, salvo que el texto nos corra traslado o nos intime. ' +
    'Nunca propongas que nosotros hagamos lo mismo que hizo la contraria.\n' +
    '- Oficios, cédulas y mandamientos librados a pedido de nuestra parte: requiere_accion=true, ' +
    'accion="Diligenciar el oficio a <destinatario> y controlar la respuesta" (o equivalente), escrito=null, ' +
    'dias=null salvo que el texto fije plazo. Si los libra el juzgado de oficio o a pedido de la contraria, ' +
    'requiere_accion=false.\n' +
    '- Apertura a prueba: leé qué dispone. Si la prueba de las partes YA fue ofrecida o admitida, el plazo ' +
    'es de PRODUCCIÓN: accion="Producir la prueba admitida (diligenciar oficios propios, controlar ' +
    'informes)", escrito=null. Solo si el texto abre el período para OFRECER prueba: accion="Ofrecer prueba", ' +
    'escrito "Ofrecimiento de prueba", con el plazo del catálogo (ofrecimiento_prueba) o el del texto.\n' +
    '- Basate solo en lo que dice el texto. Si dudás entre dos lecturas, elegí la que no genera un escrito ' +
    'y explicá la duda en "resumen".\n' +
    '- No inventes plazos: usá el catálogo o el plazo que fija el texto; si no hay ninguno, dias=null.\n' +
    '- "escrito" solo si hay que presentar algo en el expediente. Si la acción es interna ' +
    '(llamar al cliente, controlar, agendar), escrito=null.\n' +
    '- URGENTE si vence en 3 días hábiles o menos o hay riesgo de perder un derecho.'

  const body = { model: MODELO, temperature: 0.1, max_tokens: 900, messages: [
    { role: 'system', content: system }, { role: 'user', content: user },
  ] }
  const bytes = new TextEncoder().encode(JSON.stringify(body)).length

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': APP_URL,
      'X-Title': 'MR Abogado - Procuración',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const out = await res.json() as { choices?: { message?: { content?: string } }[] }
  const raw = out.choices?.[0]?.message?.content ?? ''
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('La IA no devolvió JSON')
  const p = JSON.parse(match[0]) as Partial<Clasificacion>

  const prioridades = ['URGENTE', 'ALTA', 'MEDIA', 'BAJA'] as const
  return {
    bytes,
    data: {
      resumen: String(p.resumen ?? '').slice(0, 600),
      requiere_accion: p.requiere_accion === true,
      tipo_acto: typeof p.tipo_acto === 'string' && p.tipo_acto ? p.tipo_acto : null,
      dias: typeof p.dias === 'number' && p.dias > 0 && p.dias < 365 ? Math.round(p.dias) : null,
      es_habiles: p.es_habiles !== false,
      accion: typeof p.accion === 'string' && p.accion.trim() ? p.accion.trim().slice(0, 200) : null,
      prioridad: prioridades.includes(p.prioridad as typeof prioridades[number]) ? p.prioridad as Clasificacion['prioridad'] : 'MEDIA',
      escrito: p.escrito && typeof p.escrito.tipo === 'string' && p.escrito.tipo.trim()
        ? { tipo: p.escrito.tipo.trim().slice(0, 120), instrucciones: String(p.escrito.instrucciones ?? '').slice(0, 2000) }
        : null,
    },
  }
}

async function llamarFunction(
  nombre: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null }> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/${nombre}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    })
    const data = await res.json().catch(() => null) as Record<string, unknown> | null
    return { ok: res.ok && !data?.error, status: res.status, data }
  } catch (err) {
    return { ok: false, status: 0, data: { error: err instanceof Error ? err.message : String(err) } }
  } finally {
    clearTimeout(t)
  }
}

function fechaCorta(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  const inicio = Date.now()

  try {
    const admin: Admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = await req.json().catch(() => ({})) as { expediente_id?: string }

    // ── Auth ──────────────────────────────────────────────────────────────
    const cronSecret = Deno.env.get('CRON_SECRET')
    const esCron = !!cronSecret && req.headers.get('x-cron-secret') === cronSecret
    let soloExpediente: string | null = null
    if (!esCron) {
      const anonClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
      )
      const { data: { user }, error } = await anonClient.auth.getUser()
      if (error || !user) return json(req, { error: 'No autorizado' }, 401)
      if (!body.expediente_id) return json(req, { error: 'expediente_id requerido' }, 400)
      // Respeta RLS: si no lo ve, no lo procesa.
      const { data: visible } = await anonClient.from('expedientes').select('id').eq('id', body.expediente_id).maybeSingle()
      if (!visible) return json(req, { error: 'Expediente no encontrado o sin permisos' }, 404)
      soloExpediente = body.expediente_id
    }

    // ── Expedientes a procurar ────────────────────────────────────────────
    let q = admin.from('expedientes')
      .select('id, caratula, numero, numero_sae, fuero, procuracion_desde, procuracion_responsable_id, abogado_responsable_id, created_by, ultima_sincronizacion_sae, clientes(nombre, apellido)')
      .eq('procuracion_auto', true)
      .is('deleted_at', null)
    if (soloExpediente) q = q.eq('id', soloExpediente)
    const { data: exps, error: expErr } = await q
    if (expErr) throw expErr
    const expedientes = (exps ?? []) as unknown as Expediente[]
    if (expedientes.length === 0) {
      return json(req, { ok: true, procesadas: 0, mensaje: soloExpediente ? 'La procuración automática no está activa en este expediente.' : 'Sin expedientes con procuración activa.' })
    }

    const { data: dir } = await admin.from('profiles').select('id').eq('rol', 'DIRECTOR').eq('activo', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
    const directorId = (dir as { id?: string } | null)?.id
    if (!directorId) throw new Error('No se encontró el perfil del director')

    // Calendario judicial: ferias + feriados nacionales y de Tucumán
    const { data: feriaRows } = await admin.from('feria_judicial').select('inicio, fin')
    const ferias = (feriaRows ?? []) as FeriaPeriod[]
    const anio = new Date().getFullYear()
    const [nac1, nac2] = await Promise.all([fetchFeriadosArgentina(anio), fetchFeriadosArgentina(anio + 1)])
    const feriados = new Set<string>([...nac1, ...nac2, ...getTucumanProvincialFeriados(anio), ...getTucumanProvincialFeriados(anio + 1)])

    const { data: plazosRows } = await admin.from('plazos_procesales')
      .select('tipo_acto, dias, es_habiles, base_legal, fuero').eq('activo', true)
    const catalogoPorFuero = new Map<string, Plazo[]>()
    for (const p of (plazosRows ?? []) as (Plazo & { fuero: string })[]) {
      const lista = catalogoPorFuero.get(p.fuero) ?? []
      lista.push(p); catalogoPorFuero.set(p.fuero, lista)
    }

    const { data: equipo } = await admin.from('profiles').select('apellido')
      .eq('activo', true).in('rol', ['DIRECTOR', 'ABOGADO', 'COLABORADOR', 'CRITERIO'])
    const abogados = [...new Set(((equipo ?? []) as { apellido: string | null }[])
      .map(p => (p.apellido ?? '').trim().toUpperCase()).filter(Boolean))]

    const resultados: Resultado[] = []
    let escritosGenerados = 0
    const escritosEnCorrida = new Set<string>()
    let actuacionesProcesadas = 0
    let cortadoPorTope = false

    for (const exp of expedientes) {
      if (Date.now() - inicio > PRESUPUESTO_MS || actuacionesProcesadas >= MAX_ACTUACIONES) { cortadoPorTope = true; break }

      const responsable: string = exp.procuracion_responsable_id ?? exp.abogado_responsable_id ?? directorId
      const nombreExp = (exp.caratula ?? exp.numero ?? 'Expediente').slice(0, 70)

      // 1. Sync SAE con credenciales de alguien del expediente
      if (exp.numero_sae) {
        const candidatos = [...new Set([responsable, exp.abogado_responsable_id, exp.created_by, directorId].filter(Boolean))] as string[]
        const { data: creds } = await admin.from('sae_credentials')
          .select('profile_id, status').eq('provider', 'justucuman').in('profile_id', candidatos)
        const usables = new Set(((creds ?? []) as { profile_id: string; status: string }[])
          .filter(c => !['desactivado', 'bloqueado'].includes(c.status)).map(c => c.profile_id))
        const credProfile = candidatos.find(id => usables.has(id))
        const viejo = !exp.ultima_sincronizacion_sae ||
          Date.now() - new Date(exp.ultima_sincronizacion_sae).getTime() > RESYNC_MIN * 60_000
        if (credProfile && (viejo || soloExpediente)) {
          await llamarFunction('sae-sync', { expediente_id: exp.id, on_behalf_of_user_id: credProfile }, 45_000)
          await llamarFunction('sae-fetch-bodies', { expediente_id: exp.id, on_behalf_of_user_id: credProfile }, 40_000)
        }
      }

      // 2. Actuaciones pendientes de procesar
      const desde = new Date(new Date(exp.procuracion_desde ?? Date.now()).getTime() - VENTANA_PREVIA_DIAS * 86_400_000)
        .toISOString().slice(0, 10)
      const [{ data: movs }, { data: hechos }] = await Promise.all([
        admin.from('sae_movements')
          .select('id, fecha, titulo, cuerpo, tipo_movimiento, ai_summary, created_at')
          .eq('expediente_id', exp.id)
          .gte('fecha', desde)
          .is('auto_tarea_id', null)
          .is('respondida_at', null)
          .order('fecha', { ascending: true })
          .limit(40),
        admin.from('procuracion_eventos').select('movement_id').eq('expediente_id', exp.id),
      ])
      const yaHechos = new Set(((hechos ?? []) as { movement_id: string }[]).map(h => h.movement_id))
      const pendientes = ((movs ?? []) as Movimiento[]).filter(m => !yaHechos.has(m.id))

      for (const m of pendientes) {
        if (Date.now() - inicio > PRESUPUESTO_MS || actuacionesProcesadas >= MAX_ACTUACIONES) { cortadoPorTope = true; break }

        // Esperar el cuerpo un rato; después se procesa con el título
        const sinCuerpo = m.cuerpo === null
        if (sinCuerpo && Date.now() - new Date(m.created_at).getTime() < ESPERA_CUERPO_HORAS * 3_600_000) continue

        actuacionesProcesadas++
        const base = { expediente_id: exp.id, movement_id: m.id }

        if (esTrivial(m)) {
          await admin.from('procuracion_eventos').insert({ ...base, estado: 'sin_accion', resumen: 'Mero trámite del portal' })
          resultados.push({ expediente: nombreExp, actuacion: m.titulo, estado: 'sin_accion' })
          continue
        }

        try {
          const catalogo = catalogoPorFuero.get(exp.fuero ?? '') ?? []
          const guard = await checkLlmGuard(admin, responsable, FUNCTION_NAME, 20_000)
          if (!guard.ok) throw new Error(guard.error ?? 'Límite de IA alcanzado')
          const cliente = `${exp.clientes?.apellido ?? ''} ${exp.clientes?.nombre ?? ''}`.trim()
          const { data: c, bytes } = await clasificar(exp, m, catalogo, { cliente, abogados })
          logLlmCall(admin, responsable, FUNCTION_NAME, bytes)

          if (!m.ai_summary && c.resumen) {
            await admin.from('sae_movements').update({ ai_summary: c.resumen }).eq('id', m.id)
          }

          if (!c.requiere_accion || !c.accion) {
            await admin.from('procuracion_eventos').insert({ ...base, estado: 'sin_accion', resumen: c.resumen, tipo_acto: c.tipo_acto })
            resultados.push({ expediente: nombreExp, actuacion: m.titulo, estado: 'sin_accion' })
            continue
          }

          // 3. Plazo
          const delCatalogo = c.tipo_acto ? catalogo.find(p => p.tipo_acto === c.tipo_acto) : undefined
          const dias = delCatalogo?.dias ?? c.dias
          const habiles = delCatalogo?.es_habiles ?? c.es_habiles
          const vencimiento = dias ? calcularVencimiento(m.fecha, dias, habiles, ferias, feriados) : null
          const hoyAR = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10)
          const vencido = !!vencimiento && vencimiento < hoyAR
          if (vencido) c.prioridad = 'URGENTE'

          // 4. Borrador del escrito (nunca se presenta solo)
          let escritoId: string | null = null
          let escritoError: string | null = null
          let escritoRepetido = false
          if (c.escrito) {
            const tipoNorm = c.escrito.tipo.trim().toLowerCase()
            const claveRun = `${exp.id}|${tipoNorm}`
            if (escritosEnCorrida.has(claveRun)) {
              escritoRepetido = true
            } else {
              const hace15 = new Date(Date.now() - 15 * 86_400_000).toISOString()
              const { data: previos } = await admin.from('escritos').select('id')
                .eq('expediente_id', exp.id).ilike('tipo', tipoNorm).gte('created_at', hace15).limit(1)
              escritoRepetido = (previos ?? []).length > 0
            }
            escritosEnCorrida.add(claveRun)
          }
          if (c.escrito && !escritoRepetido && escritosGenerados < MAX_ESCRITOS && Date.now() - inicio < PRESUPUESTO_MS - 60_000) {
            const pedido = {
              expediente_id: exp.id,
              tipo: c.escrito.tipo,
              instrucciones: c.escrito.instrucciones,
              responde_a_movimiento_id: m.id,
            }
            let r = await llamarFunction('escritos-generate', { ...pedido, on_behalf_of_user_id: responsable }, 90_000)
            // Perfil del responsable sin matrícula/domicilio/CUIT → firma el director
            if (!r.ok && r.status === 412 && responsable !== directorId) {
              r = await llamarFunction('escritos-generate', { ...pedido, on_behalf_of_user_id: directorId }, 90_000)
            }
            if (r.ok && typeof r.data?.escrito_id === 'string') {
              escritoId = r.data.escrito_id
              escritosGenerados++
            } else {
              escritoError = String(r.data?.error ?? `escritos-generate respondió ${r.status}`)
            }
          }

          // 5. Tarea para el responsable
          const lineas = [
            vencido ? `ATENCIÓN: según el cálculo, el plazo venció el ${fechaCorta(vencimiento!)}. Verificá si ya se cumplió.` : null,
            c.resumen,
            dias ? `Plazo: ${dias} días ${habiles ? 'hábiles' : 'corridos'}${delCatalogo?.base_legal ? ` (${delCatalogo.base_legal})` : ''}${vencimiento ? `. Vence el ${fechaCorta(vencimiento)}.` : '.'}` : null,
            escritoId
              ? `Borrador del escrito "${c.escrito!.tipo}" listo en la solapa Escritos: revisalo, firmalo y presentalo.`
              : c.escrito
                ? `Hay que presentar: ${c.escrito.tipo}.${escritoRepetido ? ' Ya hay un borrador reciente de ese tipo en Escritos.' : escritoError ? ' (No se pudo generar el borrador automáticamente.)' : ''}`
                : null,
            `Actuación: "${m.titulo}" del ${fechaCorta(m.fecha)}.`,
            'Creada por la procuración automática. Verificá el plazo antes de confiar en la fecha.',
          ].filter(Boolean)

          const { data: tarea, error: tareaErr } = await admin.from('tareas').insert({
            expediente_id: exp.id,
            titulo: c.accion,
            descripcion: lineas.join('\n\n'),
            prioridad: c.prioridad,
            estado: 'PENDIENTE',
            fecha_vencimiento: vencimiento,
            asignado_a: responsable,
            asignados: [responsable],
            created_by: directorId,
            sae_movement_id: m.id,
            es_plazo_judicial: !!vencimiento,
          }).select('id').single()
          if (tareaErr) throw new Error(`No se pudo crear la tarea: ${tareaErr.message}`)
          const tareaId = (tarea as { id: string }).id
          await admin.from('sae_movements').update({ auto_tarea_id: tareaId }).eq('id', m.id)

          await admin.from('procuracion_eventos').insert({
            ...base,
            estado: 'procesado',
            tipo_acto: c.tipo_acto,
            resumen: c.resumen,
            accion: c.accion,
            dias,
            es_habiles: habiles,
            base_legal: delCatalogo?.base_legal ?? null,
            vencimiento,
            escrito_tipo: c.escrito?.tipo ?? null,
            tarea_id: tareaId,
            escrito_id: escritoId,
            error: escritoError,
          })
          resultados.push({ expediente: nombreExp, actuacion: m.titulo, estado: 'procesado', accion: c.accion, vencimiento, escrito: !!escritoId })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error('[procuracion]', exp.id, m.id, msg)
          // Error del LLM/guard: no se registra, se reintenta en la próxima corrida.
          // Error al crear la tarea: se registra para no duplicar.
          if (msg.startsWith('No se pudo crear la tarea')) {
            await admin.from('procuracion_eventos').insert({ ...base, estado: 'error', error: msg.slice(0, 500) })
          }
          resultados.push({ expediente: nombreExp, actuacion: m.titulo, estado: 'error', error: msg.slice(0, 200) })
        }
      }
    }

    // 6. Resumen a Marco
    const conAccion = resultados.filter(r => r.estado === 'procesado')
    const token = Deno.env.get('TELEGRAM_ESCRITO_BOT_TOKEN')
    const marcoChat = Number(Deno.env.get('TELEGRAM_MARCO_CHAT_ID') ?? '') || null
    if (conAccion.length && token && marcoChat) {
      const lineas = conAccion.map(r =>
        `• ${r.expediente}\n   ${r.accion}${r.vencimiento ? ` — vence ${fechaCorta(r.vencimiento)}` : ''}${r.escrito ? '\n   Borrador listo para revisar' : ''}`)
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: marcoChat,
          text: `Procuración automática: ${conAccion.length} ${conAccion.length === 1 ? 'novedad' : 'novedades'}\n\n${lineas.join('\n\n')}\n\n${APP_URL}/tareas`,
          disable_web_page_preview: true,
        }),
      }).catch(() => {})
    }

    return json(req, {
      ok: true,
      procesadas: actuacionesProcesadas,
      con_accion: conAccion.length,
      escritos: escritosGenerados,
      cortado_por_tope: cortadoPorTope,
      resultados,
    })
  } catch (err) {
    console.error('[procuracion-procesar]', err)
    return json(req, { error: err instanceof Error ? err.message : 'error interno' }, 500)
  }
})

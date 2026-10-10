// Procuración automática.
//
// Para cada expediente con procuracion_auto = true:
//   1. Sincroniza con el SAE (sae-sync) y baja los cuerpos (sae-fetch-bodies),
//      con las credenciales SAE de alguien del expediente.
//   2. Toma las actuaciones nuevas que todavía no procesó (procuracion_eventos).
//   3. Las clasifica con IA contra el catálogo plazos_procesales del fuero.
//   4. Calcula el vencimiento (días hábiles, feria judicial, feriados).
//   5. Si hay que presentar un escrito, lo PROPONE (tipo + instrucciones) pero no
//      lo redacta: se redacta solo cuando el abogado lo aprueba (botón en la app o
//      en Telegram → _shared/procuracion-redactar.ts). Nunca presenta.
//   6. Crea la tarea para el responsable (el trigger de tareas le avisa por Telegram).
//   7. Lleva el seguimiento de cada diligencia de prueba (procuracion_diligencias):
//      oficios, testigos, pericias, cédulas. Controla que tribunales confeccione y
//      envíe los oficios propios, cuenta el plazo de respuesta y, si vence sin
//      respuesta, crea la tarea de reiteración/astreintes con su borrador; avisa
//      si un testigo no está notificado con la audiencia cerca.
//   8. Le manda a Marco un resumen por Telegram.
//
// Auth:
//   - Cron: header x-cron-secret == CRON_SECRET → todos los expedientes activos.
//   - Usuario (botón "Procesar ahora"): JWT + body { expediente_id } → solo ese.
//   - Usuario aprueba una propuesta: JWT + body { accion: 'redactar', evento_id | diligencia_id }.
// Deploy con --no-verify-jwt (valida el JWT acá adentro).
// Secrets: CRON_SECRET, OPENROUTER_API_KEY, TELEGRAM_ESCRITO_BOT_TOKEN, TELEGRAM_MARCO_CHAT_ID

import { corsHeaders } from '../_shared/cors.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkLlmGuard, logLlmCall } from '../_shared/llm-guard.ts'
import { redactarPropuesta } from '../_shared/procuracion-redactar.ts'
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

type TipoDiligencia = 'oficio' | 'testigo' | 'pericia' | 'cedula' | 'mandamiento' | 'otro'
type EventoDiligencia = 'confeccionado' | 'enviado' | 'contestado' | 'notificado' | 'diligenciado' | 'fracasado' | 'reiterado'

interface DiligenciaNueva {
  tipo: TipoDiligencia
  destinatario: string
  a_pedido: 'nuestra' | 'contraria' | 'juzgado'
  plazo_respuesta_dias: number | null
  fecha_audiencia: string | null
}

interface DiligenciaUpdate {
  id: string
  evento: EventoDiligencia
}

interface Clasificacion {
  resumen: string
  etapa: string | null
  requiere_accion: boolean
  tipo_acto: string | null
  dias: number | null
  es_habiles: boolean
  accion: string | null
  prioridad: 'URGENTE' | 'ALTA' | 'MEDIA' | 'BAJA'
  escrito: { tipo: string; instrucciones: string } | null
  diligencias_nuevas: DiligenciaNueva[]
  diligencias_actualizadas: DiligenciaUpdate[]
}

interface DiligenciaAbierta {
  id: string
  tipo: TipoDiligencia
  destinatario: string
  a_pedido: string
  estado: string
  fecha_ordenado: string | null
  fecha_envio: string | null
  plazo_respuesta_dias: number | null
  plazo_es_control: boolean
  vence_respuesta: string | null
  fecha_audiencia: string | null
  tarea_envio_id: string | null
  tarea_reiteracion_id: string | null
  tarea_testigo_id: string | null
}

interface Resultado {
  expediente: string
  actuacion: string
  estado: 'procesado' | 'sin_accion' | 'error'
  accion?: string | null
  vencimiento?: string | null
  /** Escrito propuesto (no redactado) */
  propuesta?: string | null
  evento_id?: string
  diligencia_id?: string
  error?: string
}

// Actuaciones de mero trámite del portal: no generan carga para la parte.
const TRIVIAL_RE = /^(mostrador|cargo\s*-\s*cargo|pase\b|acta de sorteo|cargo inicio digital)/i

function esTrivial(m: Movimiento): boolean {
  return m.tipo_movimiento === 'planilla' || TRIVIAL_RE.test(m.titulo.trim())
}

const TIPOS_DILIGENCIA: TipoDiligencia[] = ['oficio', 'testigo', 'pericia', 'cedula', 'mandamiento', 'otro']
const EVENTOS_DILIGENCIA: EventoDiligencia[] = ['confeccionado', 'enviado', 'contestado', 'notificado', 'diligenciado', 'fracasado', 'reiterado']
const ETAPAS = ['demanda', 'contestacion', 'apertura_prueba', 'produccion_prueba', 'alegatos', 'sentencia', 'recursos', 'ejecucion']

async function clasificar(
  exp: Expediente,
  m: Movimiento,
  catalogo: Plazo[],
  ctx: Contexto,
  abiertas: DiligenciaAbierta[],
  correcciones: Correccion[],
): Promise<{ data: Clasificacion; bytes: number }> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) throw new Error('OPENROUTER_API_KEY no configurada')

  const catalogoTxt = catalogo.length
    ? catalogo.map(p => `- ${p.tipo_acto}: ${p.dias} días ${p.es_habiles ? 'hábiles' : 'corridos'}${p.base_legal ? ` (${p.base_legal})` : ''}`).join('\n')
    : '(sin catálogo para este fuero)'

  const abiertasTxt = abiertas.length
    ? abiertas.map(d => `- id=${d.id} · ${d.tipo} a ${d.destinatario} · a pedido de ${d.a_pedido} · estado ${d.estado}` +
        `${d.fecha_audiencia ? ` · audiencia ${d.fecha_audiencia}` : ''}`).join('\n')
    : '(ninguna)'

  const system =
    'Sos procurador de un estudio jurídico de Tucumán, Argentina. Leés cada actuación judicial ' +
    'nueva de un expediente, decidís qué tiene que hacer la parte que representamos y llevás el ' +
    'control de cada diligencia de prueba (oficios, testigos, pericias, cédulas) hasta que se cumple. ' +
    'Respondé SOLO un objeto JSON válido, sin texto alrededor.'

  const user =
    `Fuero: ${exp.fuero ?? 'sin dato'}\n` +
    `Carátula: ${exp.caratula ?? exp.numero ?? ''}\n` +
    `Representamos a: ${ctx.cliente || 'nuestro cliente (ver carátula)'}\n` +
    `Abogados del estudio (si un escrito dice "POR: <apellido>" de esta lista, lo presentamos nosotros): ${ctx.abogados.join(', ') || 'sin dato'}\n\n` +
    `Diligencias abiertas del expediente:\n${abiertasTxt}\n\n` +
    `Actuación del ${m.fecha} (tipo: ${m.tipo_movimiento ?? 'otro'})\n` +
    `Título: ${m.titulo}\n` +
    `Texto:\n${(m.cuerpo ?? '').slice(0, 12000) || '(sin texto, solo el título)'}\n\n` +
    `Catálogo de plazos del fuero:\n${catalogoTxt}\n\n` +
    'Devolvé este JSON:\n' +
    '{\n' +
    '  "resumen": "1 o 2 oraciones: qué dispuso el juzgado o qué presentó quién",\n' +
    `  "etapa": "${ETAPAS.join('" | "')}" o null,\n` +
    '  "requiere_accion": true | false,\n' +
    '  "tipo_acto": "uno del catálogo (exacto) o null",\n' +
    '  "dias": número de días del plazo si el texto lo fija y no está en el catálogo, o null,\n' +
    '  "es_habiles": true | false,\n' +
    '  "accion": "qué hay que hacer, en infinitivo y corto, o null",\n' +
    '  "prioridad": "URGENTE" | "ALTA" | "MEDIA" | "BAJA",\n' +
    '  "escrito": { "tipo": "tipo de escrito", "instrucciones": "qué debe decir, con los datos de la actuación" } o null,\n' +
    '  "diligencias_nuevas": [ { "tipo": "oficio|testigo|pericia|cedula|mandamiento|otro", "destinatario": "a quién (banco, repartición, nombre del testigo, perito)", ' +
    '"a_pedido": "nuestra|contraria|juzgado", "plazo_respuesta_dias": número o null, "fecha_audiencia": "YYYY-MM-DD" o null } ],\n' +
    '  "diligencias_actualizadas": [ { "id": "id de una diligencia abierta", "evento": "confeccionado|enviado|contestado|notificado|diligenciado|fracasado|reiterado" } ]\n' +
    '}\n\n' +
    'Reglas generales:\n' +
    '- Mero trámite sin carga ("téngase presente", "agréguese", "por presentado"): requiere_accion=false.\n' +
    '- Escritos nuestros (POR: abogado del estudio): requiere_accion=false, salvo que quede algo pendiente nuestro.\n' +
    '- Nunca propongas que hagamos lo mismo que hizo la contraria.\n' +
    '- Basate solo en el texto. Si dudás, elegí la lectura que no genera escrito y explicá la duda en "resumen".\n' +
    '- No inventes plazos: catálogo o plazo del texto; si no hay, dias=null.\n' +
    '- "escrito" solo si hay que presentar algo. Si la acción es interna (controlar, llamar, urgir en mesa), escrito=null.\n' +
    '- URGENTE si vence en 3 días hábiles o menos o hay riesgo de perder un derecho.\n\n' +
    'Reglas por etapa (cada etapa tiene su función):\n' +
    '- Apertura a prueba que abre el período para OFRECER: accion="Ofrecer prueba", escrito "Ofrecimiento de prueba", ' +
    'plazo del catálogo (ofrecimiento_prueba) o del texto. Si la prueba ya fue ofrecida/admitida, es PRODUCCIÓN.\n' +
    '- Ofrecimiento de prueba de la CONTRARIA: requiere_accion=true, accion="Evaluar oposición a la prueba ofrecida por la contraria", ' +
    'escrito=null, con el plazo de oposición del catálogo o del texto si existe.\n' +
    '- Producción: por cada medio de prueba que el juzgado ordena, cargá una diligencia nueva (un oficio por destinatario, ' +
    'un testigo por persona, una pericia por perito). Si son 4 oficios, son 4 diligencias.\n' +
    '- Oficio ordenado a pedido NUESTRO: requiere_accion=true, accion="Controlar que mesa de entradas confeccione y envíe el oficio a X" ' +
    '(o "los oficios a X, Y"). plazo_respuesta_dias = el que fija el texto para contestar, o null.\n' +
    '- Oficio a pedido de la contraria o del juzgado: registralo igual como diligencia (a_pedido contraria/juzgado), requiere_accion=false.\n' +
    '- Constancia de que el oficio fue confeccionado, firmado, enviado o diligenciado: actualizá la diligencia (evento confeccionado/enviado).\n' +
    '- Contestación de un oficio / informe incorporado: actualizá la diligencia (contestado). Si contesta un oficio de la CONTRARIA ' +
    'o se agrega un informe o pericia: requiere_accion=true, accion="Evaluar impugnación del informe/pericia de X", con el plazo de ' +
    'impugnación del catálogo o del texto.\n' +
    '- Pericia: diligencia tipo pericia (destinatario = perito o especialidad). Al presentarse el dictamen: evaluar impugnación u observaciones.\n' +
    '- Testimonial: una diligencia tipo testigo por cada testigo, con fecha_audiencia. Si la audiencia es a pedido nuestro: ' +
    'requiere_accion=true, accion="Notificar a los testigos <nombres> para la audiencia del <fecha>". Constancia de cédula a un ' +
    'testigo → evento notificado.\n' +
    '- Reiteración de oficio ordenada → evento reiterado. Intimación con astreintes → mencionala en resumen.\n' +
    '- diligencias_actualizadas solo con ids de la lista de abiertas. Si no hay nada, devolvé listas vacías.' +
    correccionesTxt(correcciones)

  const body = { model: MODELO, temperature: 0.1, max_tokens: 1500, messages: [
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
  // deno-lint-ignore no-explicit-any
  const p = JSON.parse(match[0]) as Record<string, any>

  const prioridades = ['URGENTE', 'ALTA', 'MEDIA', 'BAJA'] as const
  const idsAbiertas = new Set(abiertas.map(d => d.id))
  const fechaOk = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
  const diasOk = (v: unknown) => typeof v === 'number' && v > 0 && v < 365 ? Math.round(v) : null

  return {
    bytes,
    data: {
      resumen: String(p.resumen ?? '').slice(0, 600),
      etapa: ETAPAS.includes(p.etapa) ? p.etapa : null,
      requiere_accion: p.requiere_accion === true,
      tipo_acto: typeof p.tipo_acto === 'string' && p.tipo_acto ? p.tipo_acto : null,
      dias: diasOk(p.dias),
      es_habiles: p.es_habiles !== false,
      accion: typeof p.accion === 'string' && p.accion.trim() ? p.accion.trim().slice(0, 200) : null,
      prioridad: prioridades.includes(p.prioridad) ? p.prioridad : 'MEDIA',
      escrito: p.escrito && typeof p.escrito.tipo === 'string' && p.escrito.tipo.trim()
        ? { tipo: p.escrito.tipo.trim().slice(0, 120), instrucciones: String(p.escrito.instrucciones ?? '').slice(0, 2000) }
        : null,
      diligencias_nuevas: (Array.isArray(p.diligencias_nuevas) ? p.diligencias_nuevas : [])
        // deno-lint-ignore no-explicit-any
        .filter((d: any) => d && TIPOS_DILIGENCIA.includes(d.tipo) && typeof d.destinatario === 'string' && d.destinatario.trim())
        .slice(0, 15)
        // deno-lint-ignore no-explicit-any
        .map((d: any): DiligenciaNueva => ({
          tipo: d.tipo,
          destinatario: d.destinatario.trim().slice(0, 160),
          a_pedido: ['nuestra', 'contraria', 'juzgado'].includes(d.a_pedido) ? d.a_pedido : 'juzgado',
          plazo_respuesta_dias: diasOk(d.plazo_respuesta_dias),
          fecha_audiencia: fechaOk(d.fecha_audiencia),
        })),
      diligencias_actualizadas: (Array.isArray(p.diligencias_actualizadas) ? p.diligencias_actualizadas : [])
        // deno-lint-ignore no-explicit-any
        .filter((u: any) => u && idsAbiertas.has(u.id) && EVENTOS_DILIGENCIA.includes(u.evento))
        // deno-lint-ignore no-explicit-any
        .map((u: any): DiligenciaUpdate => ({ id: u.id, evento: u.evento })),
    },
  }
}

// Sin plazo en el oficio: fecha de CONTROL (no es un plazo legal) a N días hábiles del envío.
const CONTROL_RESPUESTA_DIAS = 10
// Oficio propio ordenado y no enviado después de N días corridos → urgir en mesa
const URGIR_ENVIO_DIAS = 7
// Testigo sin notificar con audiencia dentro de N días corridos → tarea urgente
const AVISO_TESTIGO_DIAS = 7

const ESTADOS_CERRADOS = ['contestado', 'diligenciado', 'desistido', 'fracasado']

async function cargarAbiertas(admin: Admin, expedienteId: string): Promise<DiligenciaAbierta[]> {
  const { data } = await admin.from('procuracion_diligencias')
    .select('id, tipo, destinatario, a_pedido, estado, fecha_ordenado, fecha_envio, plazo_respuesta_dias, plazo_es_control, vence_respuesta, fecha_audiencia, tarea_envio_id, tarea_reiteracion_id, tarea_testigo_id')
    .eq('expediente_id', expedienteId)
    .not('estado', 'in', `(${ESTADOS_CERRADOS.join(',')})`)
    .order('created_at', { ascending: true })
    .limit(60)
  return (data ?? []) as DiligenciaAbierta[]
}

/** Registra las diligencias que ordena la actuación y avanza las que ya estaban abiertas. */
async function aplicarDiligencias(
  admin: Admin,
  expedienteId: string,
  m: Movimiento,
  c: Clasificacion,
  abiertas: DiligenciaAbierta[],
  ferias: FeriaPeriod[],
  feriados: Set<string>,
): Promise<{ nuevas: number; actualizadas: number }> {
  let nuevas = 0
  let actualizadas = 0
  const ahora = new Date().toISOString()

  for (const d of c.diligencias_nuevas) {
    // No duplicar: mismo tipo y destinatario ya abierto
    const existe = abiertas.some(a => a.tipo === d.tipo && a.destinatario.toLowerCase() === d.destinatario.toLowerCase())
    if (existe) continue
    const { error } = await admin.from('procuracion_diligencias').insert({
      expediente_id: expedienteId,
      tipo: d.tipo,
      destinatario: d.destinatario,
      a_pedido: d.a_pedido,
      estado: 'ordenado',
      fecha_ordenado: m.fecha,
      plazo_respuesta_dias: d.plazo_respuesta_dias,
      fecha_audiencia: d.fecha_audiencia,
      origen_movement_id: m.id,
      ultimo_movement_id: m.id,
    })
    if (!error) nuevas++
  }

  for (const u of c.diligencias_actualizadas) {
    const d = abiertas.find(a => a.id === u.id)
    if (!d) continue
    const cambios: Record<string, unknown> = { estado: u.evento, ultimo_movement_id: m.id, updated_at: ahora }
    if (u.evento === 'enviado') {
      const plazo = d.plazo_respuesta_dias ?? CONTROL_RESPUESTA_DIAS
      cambios.fecha_envio = m.fecha
      cambios.plazo_es_control = !d.plazo_respuesta_dias
      cambios.vence_respuesta = calcularVencimiento(m.fecha, plazo, true, ferias, feriados)
    }
    if (u.evento === 'contestado' || u.evento === 'diligenciado') cambios.fecha_respuesta = m.fecha
    if (u.evento === 'reiterado') {
      // Nuevo ciclo: se vuelve a controlar el envío y la respuesta
      cambios.fecha_ordenado = m.fecha
      cambios.fecha_envio = null
      cambios.vence_respuesta = null
      cambios.tarea_envio_id = null
      cambios.tarea_reiteracion_id = null
    }
    const { error } = await admin.from('procuracion_diligencias').update(cambios).eq('id', d.id)
    if (!error) actualizadas++
  }
  return { nuevas, actualizadas }
}

// ── Plazo desde el casillero ────────────────────────────────────────────────

function normalizarTitulo(t: string): string {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/\s+-\s+POR:.*$/, '').replace(/[^A-Z0-9]+/g, ' ').trim()
}

/**
 * Notificación del casillero que corresponde a la actuación: mismo expediente
 * (vinculado o por número SAE), mismo título, depositada entre el día anterior
 * a la actuación y 30 días después. Devuelve la de depósito más temprano.
 */
async function buscarNotificacion(
  admin: Admin,
  expedienteId: string,
  numeroSae: string | null,
  m: { fecha: string; titulo: string },
): Promise<{ id: string; fecha: string } | null> {
  const desde = new Date(Date.parse(`${m.fecha}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  const hasta = new Date(Date.parse(`${m.fecha}T12:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10)
  let q = admin.from('sae_notificaciones')
    .select('id, titulo, fecha_emision')
    .gte('fecha_emision', desde).lte('fecha_emision', `${hasta}T23:59:59`)
    .order('fecha_emision', { ascending: true })
    .limit(40)
  q = numeroSae
    ? q.or(`expediente_id.eq.${expedienteId},numero_expediente.eq.${numeroSae.replace(/[,()]/g, '')}`)
    : q.eq('expediente_id', expedienteId)
  const { data } = await q
  const objetivo = normalizarTitulo(m.titulo)
  if (objetivo.length < 4) return null
  for (const n of (data ?? []) as { id: string; titulo: string | null; fecha_emision: string | null }[]) {
    if (!n.titulo || !n.fecha_emision) continue
    const t = normalizarTitulo(n.titulo)
    const coincide = t === objetivo || (Math.min(t.length, objetivo.length) >= 10 && (t.startsWith(objetivo) || objetivo.startsWith(t)))
    if (coincide) return { id: n.id, fecha: n.fecha_emision.slice(0, 10) }
  }
  return null
}

// ── Aprendizaje: correcciones del estudio ───────────────────────────────────

interface Correccion { titulo: string; tipo: string | null; propuso: string; nota: string }

async function cargarCorrecciones(admin: Admin): Promise<Correccion[]> {
  const { data } = await admin.from('procuracion_eventos')
    .select('estado, accion, escrito_tipo, feedback_nota, movimiento:sae_movements(titulo, tipo_movimiento)')
    .eq('feedback', 'incorrecto')
    .not('feedback_nota', 'is', null)
    .order('feedback_at', { ascending: false })
    .limit(15)
  return ((data ?? []) as unknown as {
    estado: string; accion: string | null; escrito_tipo: string | null; feedback_nota: string
    movimiento: { titulo: string; tipo_movimiento: string | null } | null
  }[]).filter(r => r.movimiento).map(r => ({
    titulo: r.movimiento!.titulo.slice(0, 120),
    tipo: r.movimiento!.tipo_movimiento,
    propuso: r.estado === 'procesado'
      ? `${r.accion ?? 'acción'}${r.escrito_tipo ? ` + escrito "${r.escrito_tipo}"` : ''}`
      : 'sin acción',
    nota: r.feedback_nota.slice(0, 400),
  }))
}

function correccionesTxt(cs: Correccion[]): string {
  if (!cs.length) return ''
  return '\n\nCorrecciones del estudio a decisiones anteriores (tienen prioridad sobre las reglas generales):\n' +
    cs.map(c => `- Actuación "${c.titulo}" (${c.tipo ?? 'otro'}): propusiste ${c.propuso}. Corrección: ${c.nota}`).join('\n')
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
    const body = await req.json().catch(() => ({})) as {
      expediente_id?: string; accion?: string; evento_id?: string; diligencia_id?: string
    }

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

      // Aprobación de una propuesta: redactar el borrador a nombre de quien aprueba
      if (body.accion === 'redactar') {
        const propuesta = body.evento_id
          ? { tipo: 'evento' as const, id: body.evento_id }
          : body.diligencia_id ? { tipo: 'diligencia' as const, id: body.diligencia_id } : null
        if (!propuesta) return json(req, { error: 'evento_id o diligencia_id requerido' }, 400)
        // La lectura con el cliente del usuario respeta RLS (can_view_expediente)
        const tabla = propuesta.tipo === 'evento' ? 'procuracion_eventos' : 'procuracion_diligencias'
        const { data: visible } = await anonClient.from(tabla).select('id').eq('id', propuesta.id).maybeSingle()
        if (!visible) return json(req, { error: 'Propuesta no encontrada o sin permisos' }, 404)
        const { data: dir } = await admin.from('profiles').select('id').eq('rol', 'DIRECTOR').eq('activo', true)
          .order('created_at', { ascending: true }).limit(1).maybeSingle()
        const r = await redactarPropuesta(admin, propuesta, user.id, (dir as { id?: string } | null)?.id ?? user.id)
        return r.ok ? json(req, r) : json(req, { error: r.error }, 502)
      }

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

    const correcciones = await cargarCorrecciones(admin)

    const resultados: Resultado[] = []
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
      let abiertas = await cargarAbiertas(admin, exp.id)

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
          const { data: c, bytes } = await clasificar(exp, m, catalogo, { cliente, abogados }, abiertas, correcciones)
          logLlmCall(admin, responsable, FUNCTION_NAME, bytes)

          // Seguimiento de diligencias (oficios, testigos, pericias), haya o no acción
          if (c.diligencias_nuevas.length || c.diligencias_actualizadas.length) {
            await aplicarDiligencias(admin, exp.id, m, c, abiertas, ferias, feriados)
            abiertas = await cargarAbiertas(admin, exp.id)
          }

          if (!m.ai_summary && c.resumen) {
            await admin.from('sae_movements').update({ ai_summary: c.resumen }).eq('id', m.id)
          }

          if (!c.requiere_accion || !c.accion) {
            await admin.from('procuracion_eventos').insert({ ...base, estado: 'sin_accion', resumen: c.resumen, tipo_acto: c.tipo_acto, etapa: c.etapa })
            resultados.push({ expediente: nombreExp, actuacion: m.titulo, estado: 'sin_accion' })
            continue
          }

          // 3. Plazo
          const delCatalogo = c.tipo_acto ? catalogo.find(p => p.tipo_acto === c.tipo_acto) : undefined
          const dias = delCatalogo?.dias ?? c.dias
          const habiles = delCatalogo?.es_habiles ?? c.es_habiles
          // El plazo corre desde el depósito en casillero; si la notificación
          // todavía no está, se estima desde la actuación y se recalcula después.
          const notif = dias ? await buscarNotificacion(admin, exp.id, exp.numero_sae, m) : null
          const basePlazo: 'casillero' | 'actuacion' = notif ? 'casillero' : 'actuacion'
          const vencimiento = dias ? calcularVencimiento(notif?.fecha ?? m.fecha, dias, habiles, ferias, feriados) : null
          const hoyAR = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10)
          const vencido = !!vencimiento && vencimiento < hoyAR
          if (vencido) c.prioridad = 'URGENTE'

          // 4. El escrito se PROPONE; se redacta solo si el abogado lo aprueba.

          // 5. Tarea para el responsable
          const lineas = [
            vencido ? `ATENCIÓN: según el cálculo, el plazo venció el ${fechaCorta(vencimiento!)}. Verificá si ya se cumplió.` : null,
            c.resumen,
            dias ? `Plazo: ${dias} días ${habiles ? 'hábiles' : 'corridos'}${delCatalogo?.base_legal ? ` (${delCatalogo.base_legal})` : ''}${vencimiento ? `. Vence el ${fechaCorta(vencimiento)}.` : '.'} ` +
              (notif
                ? `Contado desde el depósito en casillero del ${fechaCorta(notif.fecha)}.`
                : 'ESTIMADO desde la fecha de la actuación: no se encontró la notificación en el casillero (se recalcula sola si aparece).')
              : null,
            c.escrito
              ? `Propuesta: redactar "${c.escrito.tipo}". No se redactó todavía: si corresponde, aprobalo con "Redactar borrador" ` +
                'en la tarjeta de procuración del expediente (solapa SAE) o desde Telegram.'
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

          const { data: evento } = await admin.from('procuracion_eventos').insert({
            ...base,
            estado: 'procesado',
            etapa: c.etapa,
            tipo_acto: c.tipo_acto,
            resumen: c.resumen,
            accion: c.accion,
            dias,
            es_habiles: habiles,
            base_legal: delCatalogo?.base_legal ?? null,
            vencimiento,
            base_plazo: dias ? basePlazo : null,
            fecha_notificacion: notif?.fecha ?? null,
            notificacion_id: notif?.id ?? null,
            escrito_tipo: c.escrito?.tipo ?? null,
            escrito_instrucciones: c.escrito?.instrucciones ?? null,
            tarea_id: tareaId,
          }).select('id').single()
          resultados.push({
            expediente: nombreExp, actuacion: m.titulo, estado: 'procesado', accion: c.accion, vencimiento,
            propuesta: c.escrito?.tipo ?? null, evento_id: (evento as { id?: string } | null)?.id,
          })
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

      // 5b. Plazos estimados: si ya llegó la notificación al casillero, recalcular
      try {
        const hace45 = new Date(Date.now() - 45 * 86_400_000).toISOString()
        const { data: estimados } = await admin.from('procuracion_eventos')
          .select('id, dias, es_habiles, vencimiento, tarea_id, movimiento:sae_movements(fecha, titulo)')
          .eq('expediente_id', exp.id).eq('base_plazo', 'actuacion').not('dias', 'is', null)
          .gte('created_at', hace45).limit(20)
        for (const ev of (estimados ?? []) as unknown as {
          id: string; dias: number; es_habiles: boolean | null; vencimiento: string | null; tarea_id: string | null
          movimiento: { fecha: string; titulo: string } | null
        }[]) {
          if (!ev.movimiento) continue
          const notif = await buscarNotificacion(admin, exp.id, exp.numero_sae, ev.movimiento)
          if (!notif) continue
          const nuevo = calcularVencimiento(notif.fecha, ev.dias, ev.es_habiles ?? true, ferias, feriados)
          await admin.from('procuracion_eventos').update({
            base_plazo: 'casillero', fecha_notificacion: notif.fecha, notificacion_id: notif.id, vencimiento: nuevo,
          }).eq('id', ev.id)
          if (ev.tarea_id && nuevo && nuevo !== ev.vencimiento) {
            const { data: t } = await admin.from('tareas').select('estado, descripcion').eq('id', ev.tarea_id).maybeSingle()
            const tarea = t as { estado: string; descripcion: string | null } | null
            if (tarea && ['PENDIENTE', 'EN_PROGRESO'].includes(tarea.estado)) {
              await admin.from('tareas').update({
                fecha_vencimiento: nuevo,
                descripcion: `Plazo recalculado: la notificación se depositó en casillero el ${fechaCorta(notif.fecha)}. ` +
                  `Vence el ${fechaCorta(nuevo)} (antes estimado ${ev.vencimiento ? fechaCorta(ev.vencimiento) : 'sin fecha'}).\n\n${tarea.descripcion ?? ''}`,
                updated_at: new Date().toISOString(),
              }).eq('id', ev.tarea_id)
              resultados.push({ expediente: nombreExp, actuacion: ev.movimiento.titulo, estado: 'procesado', accion: 'Plazo recalculado desde el casillero', vencimiento: nuevo })
            }
          }
        }
      } catch (err) {
        console.error('[procuracion] recalcular plazos', exp.id, err)
      }

      // 6. Control de diligencias trabadas (sin IA)
      try {
        const hoy = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10)
        const sumar = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
        const propias = (await cargarAbiertas(admin, exp.id)).filter(d => d.a_pedido === 'nuestra')

        const crearTarea = async (titulo: string, descripcion: string, prioridad: string, vence: string | null) => {
          const { data, error } = await admin.from('tareas').insert({
            expediente_id: exp.id, titulo, descripcion, prioridad, estado: 'PENDIENTE',
            fecha_vencimiento: vence, asignado_a: responsable, asignados: [responsable],
            created_by: directorId, es_plazo_judicial: false,
          }).select('id').single()
          if (error) throw new Error(`No se pudo crear la tarea de control: ${error.message}`)
          return (data as { id: string }).id
        }

        for (const d of propias) {
          // a) Ordenado y todavía no enviado → urgir en mesa de entradas
          if (['oficio', 'cedula', 'mandamiento'].includes(d.tipo) && ['ordenado', 'confeccionado', 'reiterado'].includes(d.estado)
              && !d.tarea_envio_id && d.fecha_ordenado && d.fecha_ordenado <= sumar(hoy, -URGIR_ENVIO_DIAS)) {
            const id = await crearTarea(
              `Urgir confección y envío del ${d.tipo} a ${d.destinatario}`,
              `El ${d.tipo} a ${d.destinatario} se ordenó el ${fechaCorta(d.fecha_ordenado)} y todavía no hay constancia de que tribunales lo haya ` +
              `${d.estado === 'confeccionado' ? 'enviado' : 'confeccionado y enviado'}. Controlar en mesa de entradas.\n\nCreada por el control de diligencias de la procuración automática.`,
              'ALTA', hoy,
            )
            await admin.from('procuracion_diligencias').update({ tarea_envio_id: id, updated_at: new Date().toISOString() }).eq('id', d.id)
            resultados.push({ expediente: nombreExp, actuacion: `Control: ${d.tipo} a ${d.destinatario}`, estado: 'procesado', accion: `Urgir envío del ${d.tipo} a ${d.destinatario}`, vencimiento: hoy })
          }

          // b) Oficio enviado, vencido y sin respuesta → reiteración / astreintes
          if (d.tipo === 'oficio' && d.estado === 'enviado' && d.vence_respuesta && d.vence_respuesta < hoy && !d.tarea_reiteracion_id) {
            const id = await crearTarea(
              `Pedir reiteración del oficio a ${d.destinatario} (o astreintes)`,
              `El oficio a ${d.destinatario} se envió el ${fechaCorta(d.fecha_envio ?? '')} y ${d.plazo_es_control ? 'la fecha de control' : 'el plazo para contestar'} ` +
              `venció el ${fechaCorta(d.vence_respuesta)} sin respuesta en el expediente.` +
              `${d.plazo_es_control ? ' (El oficio no fijaba plazo: es una fecha de control, verificá el plazo real.)' : ''}\n\n` +
              'Propuesta: escrito "Solicita reiteración de oficio" bajo apercibimiento de astreintes. No se redactó todavía: ' +
              'aprobalo con "Redactar" en la tarjeta de procuración (solapa SAE) o desde Telegram.' +
              '\n\nCreada por el control de diligencias de la procuración automática.',
              'URGENTE', hoy,
            )
            await admin.from('procuracion_diligencias').update({ tarea_reiteracion_id: id, updated_at: new Date().toISOString() }).eq('id', d.id)
            resultados.push({
              expediente: nombreExp, actuacion: `Control: oficio a ${d.destinatario}`, estado: 'procesado',
              accion: `Pedir reiteración del oficio a ${d.destinatario}`, vencimiento: hoy,
              propuesta: 'Solicita reiteración de oficio', diligencia_id: d.id,
            })
          }

          // c) Testigo sin notificar con la audiencia cerca
          if (d.tipo === 'testigo' && !['notificado'].includes(d.estado) && d.fecha_audiencia && !d.tarea_testigo_id
              && d.fecha_audiencia >= hoy && d.fecha_audiencia <= sumar(hoy, AVISO_TESTIGO_DIAS)) {
            const id = await crearTarea(
              `Controlar notificación del testigo ${d.destinatario}`,
              `La audiencia testimonial es el ${fechaCorta(d.fecha_audiencia)} y no hay constancia de que ${d.destinatario} haya sido notificado. ` +
              'Verificar la cédula o notificarlo.\n\nCreada por el control de diligencias de la procuración automática.',
              'URGENTE', sumar(d.fecha_audiencia, -1),
            )
            await admin.from('procuracion_diligencias').update({ tarea_testigo_id: id, updated_at: new Date().toISOString() }).eq('id', d.id)
            resultados.push({ expediente: nombreExp, actuacion: `Control: testigo ${d.destinatario}`, estado: 'procesado', accion: `Controlar notificación del testigo ${d.destinatario}`, vencimiento: sumar(d.fecha_audiencia, -1) })
          }
        }
      } catch (err) {
        console.error('[procuracion] control diligencias', exp.id, err)
      }
    }

    // 7. Resumen a Marco
    const conAccion = resultados.filter(r => r.estado === 'procesado')
    const token = Deno.env.get('TELEGRAM_ESCRITO_BOT_TOKEN')
    const marcoChat = Number(Deno.env.get('TELEGRAM_MARCO_CHAT_ID') ?? '') || null
    if (conAccion.length && token && marcoChat) {
      // Las propuestas de escrito van numeradas con un botón "Redactar N": se
      // redacta solo lo que Marco aprueba (callback en telegram-escrito-webhook).
      let n = 0
      const botones: { text: string; callback_data: string }[] = []
      const lineas = conAccion.map(r => {
        let propuesta = ''
        if (r.propuesta && (r.evento_id || r.diligencia_id) && botones.length < 12) {
          n++
          propuesta = `\n   [${n}] Propone redactar: ${r.propuesta}`
          botones.push({ text: `Redactar ${n}`, callback_data: r.evento_id ? `redactar:e:${r.evento_id}` : `redactar:d:${r.diligencia_id}` })
        }
        return `• ${r.expediente}\n   ${r.accion}${r.vencimiento ? ` — vence ${fechaCorta(r.vencimiento)}` : ''}${propuesta}`
      })
      const keyboard: { text: string; callback_data: string }[][] = []
      for (let i = 0; i < botones.length; i += 3) keyboard.push(botones.slice(i, i + 3))
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: marcoChat,
          text: `Procuración automática: ${conAccion.length} ${conAccion.length === 1 ? 'novedad' : 'novedades'}\n\n${lineas.join('\n\n')}` +
            `${botones.length ? '\n\nNo redacté nada: tocá "Redactar N" solo en los que quieras el borrador.' : ''}\n\n${APP_URL}/tareas`,
          disable_web_page_preview: true,
          ...(keyboard.length ? { reply_markup: { inline_keyboard: keyboard } } : {}),
        }),
      }).catch(() => {})
    }

    return json(req, {
      ok: true,
      procesadas: actuacionesProcesadas,
      con_accion: conAccion.length,
      propuestas: resultados.filter(r => r.propuesta).length,
      cortado_por_tope: cortadoPorTope,
      resultados,
    })
  } catch (err) {
    console.error('[procuracion-procesar]', err)
    return json(req, { error: err instanceof Error ? err.message : 'error interno' }, 500)
  }
})

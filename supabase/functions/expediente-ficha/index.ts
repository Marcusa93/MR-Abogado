// Ficha del caso: de qué trata el expediente y en qué está.
//
//  { accion: 'armar', expediente_id }
//      Arma la ficha completa desde el SAE, los escritos y las notas, y la guarda
//      marcada como "sin revisar". Es el punto de partida.
//  { accion: 'actualizar', expediente_id }
//      Mira los movimientos del SAE posteriores a la última revisión. Si alguno
//      cambia el caso (contestación, prueba, resoluciones…), deja una PROPUESTA
//      pendiente; nunca pisa la ficha. La llama sae-sync después de cada
//      sincronización (con service role + user_id) y también el frontend.
//  { accion: 'dictar', expediente_id, texto }
//      El abogado cuenta algo con sus palabras ("contestó negando la relación
//      laboral") y la IA lo ubica en la ficha como propuesta.
//
// LLM-guarded. Usuario por JWT, o service role con user_id (llamada interna).

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { checkLlmGuard, logLlmCall } from '../_shared/llm-guard.ts'

const FUNCTION_NAME = 'expediente-ficha'
const MODELO = 'anthropic/claude-sonnet-4.6'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

// ── Tipos ──────────────────────────────────────────────────────────────────

const ESTADOS_PRUEBA = ['ofrecida', 'producida', 'pendiente', 'desistida'] as const
const CAMPOS_TEXTO = ['resumen', 'demanda', 'contestacion', 'proximo_paso'] as const
const ETAPAS = ['Demanda', 'Contestación', 'Apertura a prueba', 'Etapa probatoria', 'Alegatos', 'Sentencia', 'Apelación', 'Ejecución', 'Archivo']

interface Prueba { id: string; medio: string; detalle: string; estado: string }
interface Resolucion { id: string; fecha: string; texto: string }
interface Ficha {
  resumen: string; demanda: string; contestacion: string; prueba: Prueba[]
  resoluciones: Resolucion[]; proximo_paso: string; completar: Record<string, string>
}
type Cambio =
  | { campo: typeof CAMPOS_TEXTO[number]; modo: 'reemplazar' | 'agregar'; texto: string; completar?: string }
  | { campo: 'prueba'; medio: string; detalle: string; estado: string; prueba_id?: string }
  | { campo: 'resolucion'; fecha: string; texto: string }
  | { campo: 'etapa'; texto: string }

interface Mov { id: string; fecha: string | null; titulo: string | null; cuerpo: string | null; tipo_movimiento: string | null; created_at: string }

// ── Selección de movimientos ───────────────────────────────────────────────

// Lo que suele cambiar el caso. El resto (cédulas de trámite, pases, consumos) no.
const RELEVANTE = /demand|contest|reconvenc|excepci|prueba|pericia|perit|testim|testig|confes|absolu|informativ|oficio.*(contest|respond|inform)|documental|apertura|clausura|alegat|sentencia|resuelv|resoluci|cautelar|embargo|apela|recurso|agravio|casaci|caduc|acuerdo|homolog|transacc|desist|allan|rebeld|audiencia|mediaci|conciliaci|liquidaci|planilla|honorari|traslado|vista|nulidad|intimac/i
const TIPOS_RELEVANTES = new Set(['sentencia', 'prueba', 'audiencia', 'traslado', 'embargo', 'planilla'])

function esRelevante(m: Mov) {
  return TIPOS_RELEVANTES.has(m.tipo_movimiento ?? '') || RELEVANTE.test(m.titulo ?? '')
}

function limpiar(t: string) {
  return t.replace(/\*H\d+\*\s*H\d+/g, '').replace(/\s+/g, ' ').trim()
}

/** Texto de un movimiento. De las sentencias se guarda el principio y sobre todo el final (lo que resuelve). */
function recorte(m: Mov): string {
  const c = limpiar(m.cuerpo ?? '')
  if (!c) return ''
  if (m.tipo_movimiento === 'sentencia' || c.length > 6000) {
    return c.length > 4200 ? `${c.slice(0, 1200)} […] ${c.slice(-3000)}` : c
  }
  return c.slice(0, 1600)
}

function fechaMov(m: Mov) {
  if (!m.fecha) return 's/f'
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(m.fecha)
  return d ? `${d[3]}/${d[2]}/${d[1]}` : new Date(m.fecha).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Tucuman' })
}

/** Arma el bloque de movimientos con un presupuesto de caracteres: todos los títulos, y el texto de los relevantes empezando por los más recientes. */
function bloqueMovimientos(movs: Mov[], presupuesto: number): string {
  const conCuerpo = new Set<string>()
  let usado = 0
  for (const m of [...movs].reverse()) {
    if (!esRelevante(m)) continue
    const r = recorte(m)
    if (!r || usado + r.length > presupuesto) continue
    conCuerpo.add(m.id); usado += r.length
  }
  return movs.map((m) => {
    const linea = `[${fechaMov(m)}] ${limpiar(m.titulo ?? '(sin título)')}`
    return conCuerpo.has(m.id) ? `${linea}\n    ${recorte(m)}` : linea
  }).join('\n')
}

// ── LLM ────────────────────────────────────────────────────────────────────

async function llm(system: string, user: string, maxTokens: number): Promise<string> {
  const key = Deno.env.get('OPENROUTER_API_KEY')
  if (!key) throw new Error('Falta OPENROUTER_API_KEY')
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELO, temperature: 0, max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  })
  if (!r.ok) throw new Error(`IA ${r.status}: ${(await r.text()).slice(0, 160)}`)
  const d = await r.json() as { choices?: { message?: { content?: string } }[] }
  return d.choices?.[0]?.message?.content ?? ''
}

function parsear(salida: string): Record<string, unknown> {
  const m = salida.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('La IA no devolvió un resultado válido')
  return JSON.parse(m[0])
}

const txt = (v: unknown, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** dd/mm/aaaa → número ordenable (las fechas sin formato van al final). */
function claveFecha(f: string): number {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(f)
  return m ? Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]) : 99999999
}

const CONTEXTO_FORO =
  'Sos abogado litigante en San Miguel de Tucumán (Argentina). Escribís para otros abogados del estudio: ' +
  'español rioplatense formal, frases cortas, sin adjetivos ni relleno, sin inventar nada que no surja de las fuentes. ' +
  'Usá los términos del foro (actora, demandada, traslado, apertura a prueba, cuaderno de prueba, proveído, sentencia).'

const REGLAS_PRUEBA =
  'Prueba: un ítem por medio y por parte (ej. "Pericial contable (actora)", "Testimonial (demandada)", "Informativa al Banco Macro"). ' +
  `Estado: ${ESTADOS_PRUEBA.join(' | ')}. "producida" solo si consta que se produjo (pericia presentada, informe contestado, audiencia de testigos realizada).`

// ── Ficha ──────────────────────────────────────────────────────────────────

function fichaVacia(): Ficha {
  return { resumen: '', demanda: '', contestacion: '', prueba: [], resoluciones: [], proximo_paso: '', completar: {} }
}

function fichaComoTexto(f: Ficha): string {
  return [
    `Resumen: ${f.resumen || '(vacío)'}`,
    `Demanda: ${f.demanda || '(vacío)'}`,
    `Contestación: ${f.contestacion || '(vacío)'}`,
    `Prueba:${f.prueba.length ? '\n' + f.prueba.map((p, i) => `  P${i + 1}. ${p.medio}${p.detalle ? ` — ${p.detalle}` : ''} [${p.estado}]`).join('\n') : ' (vacío)'}`,
    `Resoluciones:${f.resoluciones.length ? '\n' + f.resoluciones.map((r) => `  - ${r.fecha}: ${r.texto}`).join('\n') : ' (vacío)'}`,
    `Próximo paso: ${f.proximo_paso || '(vacío)'}`,
  ].join('\n')
}

/** Valida los cambios que devuelve la IA. Los de prueba que refieren a un ítem existente llegan como "P3" y se traducen a su id. */
function validarCambios(crudos: unknown, ficha: Ficha): Cambio[] {
  if (!Array.isArray(crudos)) return []
  const out: Cambio[] = []
  for (const c of crudos.slice(0, 25) as Record<string, unknown>[]) {
    const campo = c?.campo
    if ((CAMPOS_TEXTO as readonly string[]).includes(campo as string)) {
      const texto = txt(c.texto)
      if (!texto) continue
      const completar = txt(c.completar, 200)
      out.push({ campo: campo as Cambio['campo'] & typeof CAMPOS_TEXTO[number], modo: c.modo === 'reemplazar' ? 'reemplazar' : 'agregar', texto, ...(completar ? { completar } : {}) } as Cambio)
    } else if (campo === 'prueba') {
      const medio = txt(c.medio, 120)
      const estado = ESTADOS_PRUEBA.includes(c.estado as typeof ESTADOS_PRUEBA[number]) ? c.estado as string : 'ofrecida'
      const ref = typeof c.prueba === 'string' ? Number(c.prueba.replace(/\D/g, '')) : typeof c.prueba === 'number' ? c.prueba : NaN
      const existente = Number.isFinite(ref) ? ficha.prueba[ref - 1] : undefined
      if (!medio && !existente) continue
      out.push({ campo: 'prueba', medio: medio || existente!.medio, detalle: txt(c.detalle, 600) || existente?.detalle || '', estado, ...(existente ? { prueba_id: existente.id } : {}) })
    } else if (campo === 'resolucion') {
      const texto = txt(c.texto, 600)
      if (texto) out.push({ campo: 'resolucion', fecha: txt(c.fecha, 20), texto })
    } else if (campo === 'etapa') {
      const texto = txt(c.texto, 60)
      if (ETAPAS.includes(texto)) out.push({ campo: 'etapa', texto })
    }
  }
  return out
}

const FORMATO_CAMBIOS =
  'Formato de cada cambio (JSON):\n' +
  '- {"campo":"resumen"|"demanda"|"contestacion"|"proximo_paso","modo":"agregar"|"reemplazar","texto":"...","completar":"pregunta opcional"}\n' +
  '  "agregar" suma una oración al final de lo que hay; "reemplazar" solo si lo actual quedó desactualizado o está vacío (el próximo paso casi siempre se reemplaza).\n' +
  '  "completar": si sabés que algo pasó pero no su contenido (el SAE trae solo el título "CONTESTO DEMANDA"), poné la pregunta que el abogado tiene que responder, ej. "¿Qué defensas opuso?".\n' +
  '- {"campo":"prueba","prueba":"P2","estado":"producida","detalle":"..."} para actualizar un medio que ya está (referilo por su número), o {"campo":"prueba","medio":"...","detalle":"...","estado":"ofrecida"} para uno nuevo.\n' +
  '- {"campo":"resolucion","fecha":"dd/mm/aaaa","texto":"qué se resolvió, en una oración"} solo para resoluciones que importan (sentencias, autos que resuelven cautelares, excepciones, caducidad, apertura a prueba, regulación de honorarios). Nunca decretos de mero trámite.\n' +
  `- {"campo":"etapa","texto":"..."} si el expediente pasó a otra etapa. Valores posibles: ${ETAPAS.join(', ')}.\n` +
  REGLAS_PRUEBA

// ── Contexto del expediente ────────────────────────────────────────────────

async function datosExpediente(db: SupabaseClient, id: string) {
  const { data } = await db.from('expedientes')
    .select('id, caratula, numero, numero_sae, fuero, juez, juzgado_numero, etapa_procesal, observaciones, cliente:clientes(nombre, apellido, razon_social)')
    .eq('id', id).maybeSingle()
  return data as null | {
    id: string; caratula: string | null; numero: string | null; numero_sae: string | null; fuero: string | null
    juez: string | null; juzgado_numero: string | null; etapa_procesal: string | null; observaciones: string | null
    cliente: { nombre: string | null; apellido: string | null; razon_social: string | null } | null
  }
}

function cabecera(e: NonNullable<Awaited<ReturnType<typeof datosExpediente>>>) {
  const cliente = e.cliente ? (e.cliente.razon_social || [e.cliente.nombre, e.cliente.apellido].filter(Boolean).join(' ')) : ''
  return [
    `Carátula: ${e.caratula ?? '—'}`,
    e.numero_sae ? `Expediente SAE: ${e.numero_sae}` : '',
    e.fuero ? `Fuero: ${e.fuero}` : '',
    e.juzgado_numero ? `Juzgado: ${e.juzgado_numero}` : '',
    cliente && !/importado\s+sae/i.test(cliente) ? `Nuestro cliente: ${cliente}` : '',
    e.etapa_procesal ? `Etapa cargada: ${e.etapa_procesal}` : '',
    e.observaciones ? `Observaciones: ${e.observaciones.slice(0, 1500)}` : '',
  ].filter(Boolean).join('\n')
}

async function leerFicha(db: SupabaseClient, id: string): Promise<(Ficha & { revisado_hasta: string | null }) | null> {
  const { data } = await db.from('expediente_fichas').select('*').eq('expediente_id', id).maybeSingle()
  if (!data) return null
  const d = data as Record<string, unknown>
  return {
    resumen: (d.resumen as string) ?? '', demanda: (d.demanda as string) ?? '', contestacion: (d.contestacion as string) ?? '',
    prueba: (d.prueba as Prueba[]) ?? [], resoluciones: (d.resoluciones as Resolucion[]) ?? [],
    proximo_paso: (d.proximo_paso as string) ?? '', completar: (d.completar as Record<string, string>) ?? {},
    revisado_hasta: (d.revisado_hasta as string | null) ?? null,
  }
}

// ── Acciones ───────────────────────────────────────────────────────────────

async function armar(db: SupabaseClient, userId: string, expedienteId: string) {
  const exp = await datosExpediente(db, expedienteId)
  if (!exp) throw new Error('Expediente no encontrado')

  const { data: movsData } = await db.from('sae_movements')
    .select('id, fecha, titulo, cuerpo, tipo_movimiento, created_at')
    .eq('expediente_id', expedienteId).order('fecha', { ascending: true }).order('created_at', { ascending: true }).limit(600)
  const movs = (movsData ?? []) as Mov[]

  const { data: escritosData } = await db.from('escritos')
    .select('titulo, tipo, estado, contenido, presentado_at, created_at')
    .eq('expediente_id', expedienteId).neq('estado', 'borrador').order('created_at', { ascending: true }).limit(40)
  const escritos = ((escritosData ?? []) as { titulo: string | null; tipo: string | null; estado: string; contenido: unknown; presentado_at: string | null; created_at: string }[])
    .map((e) => {
      const principal = /demanda|contesta|agravio|alegato|ofrece prueba/i.test(`${e.titulo} ${e.tipo}`)
      const plano = typeof e.contenido === 'string' ? e.contenido : e.contenido ? JSON.stringify(e.contenido).replace(/"[a-z_]+":/gi, ' ') : ''
      const cuerpo = principal && plano ? `\n    ${limpiar(plano.replace(/<[^>]+>/g, ' ').replace(/[{}\[\]",]/g, ' ')).slice(0, 3000)}` : ''
      return `[${new Date(e.presentado_at ?? e.created_at).toLocaleDateString('es-AR')}] ${e.titulo ?? e.tipo ?? 'Escrito'} (${e.estado})${cuerpo}`
    })

  const { data: notasData } = await db.from('expediente_notas')
    .select('contenido, created_at').eq('expediente_id', expedienteId)
    .eq('es_privada', false).or('eliminada.is.null,eliminada.eq.false')
    .order('created_at', { ascending: false }).limit(20)
  const notas = ((notasData ?? []) as { contenido: string; created_at: string }[]).reverse()
    .map((n) => `[${new Date(n.created_at).toLocaleDateString('es-AR')}] ${n.contenido.slice(0, 400)}`)

  if (!movs.length && !escritos.length && !notas.length && !exp.observaciones) {
    throw new Error('Todavía no hay movimientos del SAE, escritos ni notas para armar la ficha. Podés escribirla a mano.')
  }

  const fuentes = [
    cabecera(exp),
    movs.length ? `\n## Movimientos del SAE (en orden; con texto solo los relevantes)\n${bloqueMovimientos(movs, 100_000)}` : '',
    escritos.length ? `\n## Escritos del estudio en este expediente\n${escritos.join('\n')}` : '',
    notas.length ? `\n## Notas del equipo\n${notas.join('\n')}` : '',
  ].filter(Boolean).join('\n')

  const inputBytes = new TextEncoder().encode(fuentes).length
  const guard = await checkLlmGuard(db, userId, FUNCTION_NAME, inputBytes)
  if (!guard.ok) return { error: guard.error, status: guard.status }

  const salida = await llm(
    `${CONTEXTO_FORO}\n\nArmá la ficha del expediente a partir de las fuentes. Devolvé SOLO un JSON con:\n` +
    '{"resumen": "de qué trata el caso en 2 o 3 oraciones: quién reclama qué a quién y por qué",\n' +
    ' "demanda": "qué se demanda (objeto, rubros, monto si consta), quién y cuándo; vacío si no surge",\n' +
    ' "contestacion": "quién contestó, cuándo y qué planteó (defensas, excepciones, reconvención); vacío si no contestaron todavía",\n' +
    ' "prueba": [{"medio": "...", "detalle": "...", "estado": "..."}],\n' +
    ' "resoluciones": [{"fecha": "dd/mm/aaaa", "texto": "..."}],\n' +
    ' "proximo_paso": "qué sigue en el expediente según el último movimiento (qué hay que hacer o esperar)",\n' +
    ` "etapa": "una de: ${ETAPAS.join(', ')}",\n` +
    ' "completar": {"campo": "pregunta"}}\n\n' +
    'Reglas:\n' +
    '- Los escritos de las partes en el SAE suelen venir solo con el título (ej. "CONTESTO DEMANDA - POR: PEREZ"). Usá los decretos y sentencias para saber su contenido. ' +
    'Si sabés que algo ocurrió pero no qué dice, registralo igual ("Contestaron X e Y el 10/03/2026") y en "completar" poné la pregunta para el abogado, corta (máximo 15 palabras), ej. {"contestacion": "¿Qué defensas de fondo opusieron?"}. Campos posibles en completar: resumen, demanda, contestacion.\n' +
    '- Detalle de cada prueba: una oración, lo esencial (quién, qué, en qué quedó).\n' +
    '- Resoluciones: solo las que importan (sentencias, autos que resuelven cautelares, excepciones, caducidad, apertura a prueba, honorarios). Nunca decretos de mero trámite. Máximo 12, en orden cronológico.\n' +
    `- ${REGLAS_PRUEBA}\n` +
    '- Si un dato no surge de las fuentes, dejalo vacío. No supongas.',
    fuentes, 3500)
  logLlmCall(db, userId, FUNCTION_NAME, inputBytes)

  const p = parsear(salida)
  const completar: Record<string, string> = {}
  if (p.completar && typeof p.completar === 'object') {
    for (const [k, v] of Object.entries(p.completar as Record<string, unknown>)) {
      if (['resumen', 'demanda', 'contestacion'].includes(k) && txt(v, 300)) completar[k] = txt(v, 300)
    }
  }
  const ficha = {
    expediente_id: expedienteId,
    resumen: txt(p.resumen, 1200), demanda: txt(p.demanda), contestacion: txt(p.contestacion), proximo_paso: txt(p.proximo_paso, 800),
    prueba: (Array.isArray(p.prueba) ? p.prueba : []).slice(0, 30).map((x: Record<string, unknown>) => ({
      id: crypto.randomUUID(), medio: txt(x.medio, 140), detalle: txt(x.detalle, 600),
      estado: ESTADOS_PRUEBA.includes(x.estado as typeof ESTADOS_PRUEBA[number]) ? x.estado : 'ofrecida',
    })).filter((x: Prueba) => x.medio),
    resoluciones: (Array.isArray(p.resoluciones) ? p.resoluciones : []).slice(0, 12).map((x: Record<string, unknown>) => ({
      id: crypto.randomUUID(), fecha: txt(x.fecha, 20), texto: txt(x.texto, 600),
    })).filter((x: Resolucion) => x.texto).sort((a: Resolucion, b: Resolucion) => claveFecha(a.fecha) - claveFecha(b.fecha)),
    completar,
    revisada: false,
    revisado_hasta: movs.length ? movs.reduce((a, m) => (m.created_at > a ? m.created_at : a), movs[0].created_at) : null,
    updated_by: userId,
  }
  const { error } = await db.from('expediente_fichas').upsert(ficha)
  if (error) throw new Error(`No se pudo guardar la ficha: ${error.message}`)
  // Al rearmar, las propuestas viejas quedan sin sentido
  await db.from('expediente_ficha_propuestas').update({ estado: 'descartada', resuelta_at: new Date().toISOString() })
    .eq('expediente_id', expedienteId).eq('estado', 'pendiente')

  const etapa = txt(p.etapa, 60)
  if (ETAPAS.includes(etapa) && !exp.etapa_procesal) {
    await db.from('expedientes').update({ etapa_procesal: etapa }).eq('id', expedienteId)
  }
  return { ok: true }
}

async function actualizar(db: SupabaseClient, userId: string, expedienteId: string) {
  const ficha = await leerFicha(db, expedienteId)
  if (!ficha) return { ok: true, sin_ficha: true }

  // Ficha escrita a mano o creada desde un dictado: arranca a mirar desde ahora,
  // no revisa el historial viejo (para eso está "armar").
  if (!ficha.revisado_hasta) {
    const { data: ult } = await db.from('sae_movements').select('created_at')
      .eq('expediente_id', expedienteId).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (ult) await db.from('expediente_fichas').update({ revisado_hasta: (ult as { created_at: string }).created_at }).eq('expediente_id', expedienteId)
    return { ok: true, sin_cambios: true }
  }

  let q = db.from('sae_movements').select('id, fecha, titulo, cuerpo, tipo_movimiento, created_at')
    .eq('expediente_id', expedienteId).order('fecha', { ascending: true }).order('created_at', { ascending: true }).limit(80)
  if (ficha.revisado_hasta) q = q.gt('created_at', ficha.revisado_hasta)
  const { data } = await q
  const nuevos = (data ?? []) as Mov[]
  if (!nuevos.length) return { ok: true, sin_cambios: true }
  const hasta = nuevos.reduce((a, m) => (m.created_at > a ? m.created_at : a), nuevos[0].created_at)
  const avanzar = () => db.from('expediente_fichas').update({ revisado_hasta: hasta }).eq('expediente_id', expedienteId)

  const relevantes = nuevos.filter(esRelevante)
  if (!relevantes.length) { await avanzar(); return { ok: true, sin_cambios: true } }

  const exp = await datosExpediente(db, expedienteId)
  const entrada = `${exp ? cabecera(exp) : ''}\n\n## Ficha actual\n${fichaComoTexto(ficha)}\n\n## Movimientos nuevos del SAE\n${bloqueMovimientos(relevantes, 40_000)}`
  const inputBytes = new TextEncoder().encode(entrada).length
  const guard = await checkLlmGuard(db, userId, FUNCTION_NAME, inputBytes)
  if (!guard.ok) return { error: guard.error, status: guard.status }

  const salida = await llm(
    `${CONTEXTO_FORO}\n\nLlegaron movimientos nuevos del SAE. Decidí si cambian la ficha del expediente y cómo. ` +
    'Solo proponé cambios que surjan de los movimientos nuevos y que un abogado querría ver en la ficha; si son de mero trámite, no propongas nada.\n' +
    'Devolvé SOLO un JSON: {"titulo": "qué pasó, en pocas palabras (ej. \\"Contestaron la demanda\\", \\"Se abrió la causa a prueba\\")", "cambios": [...]}. Si no hay nada relevante: {"titulo": "", "cambios": []}.\n' +
    FORMATO_CAMBIOS,
    entrada, 1800)
  logLlmCall(db, userId, FUNCTION_NAME, inputBytes)

  const p = parsear(salida)
  const cambios = validarCambios(p.cambios, ficha)
  if (cambios.length) {
    await db.from('expediente_ficha_propuestas').insert({
      expediente_id: expedienteId, origen: 'sae', titulo: txt(p.titulo, 140) || 'Novedades del SAE', cambios,
    })
  }
  await avanzar()
  return { ok: true, propuesta: cambios.length > 0 }
}

async function dictar(db: SupabaseClient, userId: string, expedienteId: string, texto: string) {
  const ficha = (await leerFicha(db, expedienteId)) ?? { ...fichaVacia(), revisado_hasta: null }
  const exp = await datosExpediente(db, expedienteId)
  const entrada = `${exp ? cabecera(exp) : ''}\n\n## Ficha actual\n${fichaComoTexto(ficha)}\n\n## Lo que cuenta el abogado (${new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Tucuman' })})\n${texto}`
  const inputBytes = new TextEncoder().encode(entrada).length
  const guard = await checkLlmGuard(db, userId, FUNCTION_NAME, inputBytes)
  if (!guard.ok) return { error: guard.error, status: guard.status }

  const salida = await llm(
    `${CONTEXTO_FORO}\n\nUn abogado del estudio cuenta algo del expediente con sus palabras (puede venir dictado, con errores de transcripción). ` +
    'Ubicalo en la ficha: decidí a qué campo o campos corresponde y redactalo en lenguaje de ficha, sin agregar nada que no haya dicho. ' +
    'Si responde una pregunta pendiente (ej. qué defensas opuso la demandada), completá ese campo.\n' +
    'Devolvé SOLO un JSON: {"titulo": "resumen de lo que agrega, en pocas palabras", "cambios": [...]}.\n' +
    FORMATO_CAMBIOS,
    entrada, 1500)
  logLlmCall(db, userId, FUNCTION_NAME, inputBytes)

  const p = parsear(salida)
  const cambios = validarCambios(p.cambios, ficha)
  if (!cambios.length) return { ok: true, propuesta_id: null }
  const { data, error } = await db.from('expediente_ficha_propuestas').insert({
    expediente_id: expedienteId, origen: 'dictado', titulo: txt(p.titulo, 140) || 'Lo que agregaste', cambios,
  }).select('id').single()
  if (error) throw new Error(error.message)
  return { ok: true, propuesta_id: (data as { id: string }).id }
}

// ── Handler ────────────────────────────────────────────────────────────────

/** Rol del JWT. La firma ya la verificó el gateway (la función se despliega con verify_jwt). */
function rolDelJwt(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    return (JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string }).role ?? null
  } catch { return null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  try {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey)
    const body = await req.json().catch(() => null) as { accion?: string; expediente_id?: string; texto?: string; user_id?: string } | null
    if (!body?.expediente_id) return json(req, { error: 'Falta el expediente' }, 400)

    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    let userId: string
    if (token && (token === serviceKey || rolDelJwt(token) === 'service_role')) {
      if (!body.user_id) return json(req, { error: 'Falta user_id' }, 400)
      userId = body.user_id
    } else {
      const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
      const { data: { user } } = await anon.auth.getUser()
      if (!user) return json(req, { error: 'No autorizado' }, 401)
      // Visibilidad: si RLS no le deja ver el expediente, no sigue
      const { data: visible } = await anon.from('expedientes').select('id').eq('id', body.expediente_id).maybeSingle()
      if (!visible) return json(req, { error: 'Expediente no encontrado o sin permisos' }, 404)
      userId = user.id
    }

    let r: { error?: string; status?: number } & Record<string, unknown>
    if (body.accion === 'armar') r = await armar(admin, userId, body.expediente_id)
    else if (body.accion === 'actualizar') r = await actualizar(admin, userId, body.expediente_id)
    else if (body.accion === 'dictar') {
      const texto = (body.texto ?? '').trim()
      if (!texto) return json(req, { error: 'Contá qué querés agregar' }, 400)
      if (texto.length > 8000) return json(req, { error: 'El texto es demasiado largo' }, 413)
      r = await dictar(admin, userId, body.expediente_id, texto)
    } else return json(req, { error: 'Acción desconocida' }, 400)

    if (r.error) return json(req, { error: r.error }, r.status ?? 400)
    return json(req, r)
  } catch (e) {
    console.error(`[${FUNCTION_NAME}]`, e)
    return json(req, { error: e instanceof Error ? e.message : 'Error inesperado' }, 500)
  }
})

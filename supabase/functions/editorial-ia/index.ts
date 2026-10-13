// Módulo editorial: artículos de investigación y análisis jurídico.
// Usa el system prompt de _shared/editorial-system-prompt.ts (Marco, v1.0).
//
// Modos (body.modo):
//   sentencias  (cron)  sentencias nuevas del SAE → evalúa si merecen artículo y propone
//   radar       (cron o Marco) MODO RADAR EDITORIAL: 0 a 5 temas con las novedades
//   investigar  (Marco) MODO INVESTIGACIÓN sobre una propuesta → crea el artículo
//   redactar    (Marco) MODO REDACCIÓN → nueva versión del borrador
//   revisar     (Marco) MODO REVISIÓN CRÍTICA del borrador actual
//   adaptar     (Marco) MODO ADAPTACIÓN de un artículo APROBADO (linkedin/redes/boletin)
//   chequeo     (Marco) sin IA: busca datos identificatorios de las partes en el texto
//
// Nunca publica. Todo queda para revisión de Marco.
// Auth: x-cron-secret (sentencias/radar) o JWT de un usuario con acceso_editorial.
// Deploy con --no-verify-jwt (valida adentro).
// Secrets: OPENROUTER_API_KEY, CRON_SECRET, TELEGRAM_ESCRITO_BOT_TOKEN, TELEGRAM_MARCO_CHAT_ID
//          EDITORIAL_MODEL (opcional, default anthropic/claude-sonnet-5.5)

import { corsHeaders } from '../_shared/cors.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkLlmGuard, logLlmCall } from '../_shared/llm-guard.ts'
import { EDITORIAL_SYSTEM_PROMPT } from '../_shared/editorial-system-prompt.ts'
import { jsonrepair } from 'npm:jsonrepair@3.13.1'
import { tgSendKb } from '../_shared/tareas-telegram.ts'
import { pedidoDeepResearch, parsearBloques, hallazgoDesdeIA, obtenerFuente, comprobarCita, normalizar, type Hallazgo } from '../_shared/editorial-investigacion.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>

const FUNCTION_NAME = 'editorial-ia'
const MODELO = Deno.env.get('EDITORIAL_MODEL') ?? 'anthropic/claude-sonnet-5.5'
const APP_URL = 'https://app.marcorossi.com.ar'
const MAX_SENTENCIAS_POR_CORRIDA = 4

const TIPOS = ['divulgacion', 'analisis_profesional', 'actualidad', 'reflexion', 'jurisprudencial'] as const
const TIPO_LABEL: Record<string, string> = {
  divulgacion: 'Artículo de divulgación jurídica',
  analisis_profesional: 'Artículo de análisis profesional',
  actualidad: 'Artículo de actualidad',
  reflexion: 'Artículo de reflexión o perspectiva',
  jurisprudencial: 'Artículo de análisis jurisprudencial',
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

// ── LLM ─────────────────────────────────────────────────────────────────────

/** Llamada a la IA que devuelve el texto tal cual (para formatos delimitados, no JSON). */
async function llmTexto(admin: Admin, userId: string, instruccion: string, maxTokens: number): Promise<{ raw: string; finish: string }> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) throw new Error('OPENROUTER_API_KEY no configurada')
  const body = {
    model: MODELO,
    temperature: 0.4,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: EDITORIAL_SYSTEM_PROMPT },
      { role: 'user', content: instruccion },
    ],
  }
  const bytes = new TextEncoder().encode(JSON.stringify(body)).length
  const guard = await checkLlmGuard(admin, userId, FUNCTION_NAME, bytes)
  if (!guard.ok) throw new Error(guard.error ?? 'Límite de IA alcanzado')

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': APP_URL,
      'X-Title': 'MR Abogado - Editorial',
    },
    body: JSON.stringify(body),
  })
  logLlmCall(admin, userId, FUNCTION_NAME, bytes)
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const out = await res.json() as { choices?: { message?: { content?: string }; finish_reason?: string }[] }
  return { raw: out.choices?.[0]?.message?.content ?? '', finish: out.choices?.[0]?.finish_reason ?? '' }
}

async function llm(admin: Admin, userId: string, instruccion: string, maxTokens: number): Promise<Record<string, unknown>> {
  const { raw, finish } = await llmTexto(admin, userId, instruccion, maxTokens)
  const inicio = raw.indexOf('{')
  if (inicio < 0) {
    console.error('[editorial] respuesta sin JSON', finish, raw.slice(0, 500))
    throw new Error(`La IA no devolvió el formato esperado${raw.trim() ? '' : ' (respuesta vacía)'}. Probá de nuevo.`)
  }
  const fin = raw.lastIndexOf('}')
  const candidato = fin > inicio ? raw.slice(inicio, fin + 1) : raw.slice(inicio)
  try {
    const r = JSON.parse(candidato) as Record<string, unknown>
    if (finish === 'length') r.__cortada = true
    return r
  } catch {
    // Textos largos: comillas sin escapar, comas faltantes o respuesta cortada
    // por el tope de tokens. jsonrepair cierra strings y llaves abiertas.
    for (const intento of [candidato, raw.slice(inicio)]) {
      try {
        const r = JSON.parse(jsonrepair(intento)) as Record<string, unknown>
        if (finish === 'length') { console.warn('[editorial] respuesta cortada por max_tokens, reparada'); r.__cortada = true }
        return r
      } catch { /* siguiente intento */ }
    }
    console.error('[editorial] JSON irreparable', finish, raw.slice(0, 300), '…', raw.slice(-300))
    throw new Error(finish === 'length'
      ? 'La respuesta de la IA fue demasiado larga y quedó cortada. Probá de nuevo.'
      : 'La IA devolvió un formato inválido. Probá de nuevo.')
  }
}

const NORMAS_APA = 'Citas y referencias en normativa APA 7.ª edición, adaptada a fuentes jurídicas argentinas: ' +
  'en el texto, cita autor-fecha entre paréntesis para doctrina (Apellido, año, p. x) y, para normas y fallos, la denominación con el año ' +
  '(p. ej., Ley 26.485, 2009; CSJN, "Carátula", 2019). La bibliografía final lleva cada fuente citada en el texto, una por entrada, en orden ' +
  'alfabético, con el formato APA (p. ej.: Ley 26.485 de Protección Integral a las Mujeres. (2009). Boletín Oficial de la República Argentina. / ' +
  'Apellido, N. (año). Título del libro (ed.). Editorial.). No inventes datos de edición, páginas, fechas ni URLs: si un dato no consta en las ' +
  'fuentes, omitilo o marcalo [VERIFICAR: …].'

const FORMATO_JSON = 'Respondé SOLO con un objeto JSON válido, sin texto antes ni después. Dentro de los strings usá \\n para los saltos de línea.'

/** Entradas de bibliografía: strings no vacíos, sin duplicados, en orden alfabético. */
function limpiarBibliografia(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const unicas = [...new Set(v.map((e) => String(e ?? '').trim()).filter(Boolean))]
  return unicas.slice(0, 60).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
}

/** Compara cada hallazgo pendiente con el texto de su fuente (sin IA). */
const claveEvidencia = (url: string | null, cita: string | null) => `${normalizar(url ?? '')}|${normalizar(cita ?? '').slice(0, 300)}`

async function comprobarHallazgos(admin: Admin, articuloId: string) {
  const { data: hs } = await admin.from('editorial_hallazgos').select('id, cita, url, fuente_id').eq('articulo_id', articuloId).eq('estado', 'pendiente').not('fuente_id', 'is', null)
  const lista = (hs ?? []) as { id: string; cita: string | null; url: string | null; fuente_id: string }[]
  if (lista.length) {
    const ids = [...new Set(lista.map((h) => h.fuente_id))]
    const { data: fs } = await admin.from('editorial_fuentes').select('id, estado, texto, error').in('id', ids)
    const fuentes = new Map(((fs ?? []) as { id: string; estado: string; texto: string | null; error: string | null }[]).map((f) => [f.id, f]))
    // Lo que ya se comprobó en otro artículo no depende de que la página abra hoy
    const { data: yaEnBiblio } = await admin.from('editorial_evidencia').select('clave').in('clave', lista.map((h) => claveEvidencia(h.url, h.cita)))
    const biblio = new Set(((yaEnBiblio ?? []) as { clave: string }[]).map((e) => e.clave))
    const ahora = new Date().toISOString()
    for (const h of lista) {
      const f = fuentes.get(h.fuente_id)
      if (!f || f.estado === 'pendiente') continue
      let r: { estado: string; detalle: string } = f.estado === 'sin_acceso' || !f.texto
        ? { estado: /no existe/.test(f.error ?? '') ? 'no_encontrado' : 'sin_acceso', detalle: f.error ?? 'No se pudo abrir la fuente.' }
        : comprobarCita(h.cita, f.texto)
      if (r.estado !== 'comprobado' && h.cita && biblio.has(claveEvidencia(h.url, h.cita))) {
        r = { estado: 'comprobado', detalle: 'Ya estaba comprobado en un artículo anterior (biblioteca de evidencia).' }
      }
      await admin.from('editorial_hallazgos').update({ ...r, verificado_at: ahora }).eq('id', h.id)
    }
  }
  await guardarEnBiblioteca(admin, articuloId)
}

/** Suma a la biblioteca compartida todo hallazgo comprobado del artículo. */
async function guardarEnBiblioteca(admin: Admin, articuloId: string) {
  const { data } = await admin.from('editorial_hallazgos')
    .select('afirmacion, tipo, fuente, numero, tribunal, fecha, jurisdiccion, url, cita, vigencia')
    .eq('articulo_id', articuloId).eq('estado', 'comprobado').not('url', 'is', null)
  const hs = (data ?? []) as Record<string, string | null>[]
  if (!hs.length) return
  const filas = hs.filter((h) => h.cita).map((h) => ({ ...h, clave: claveEvidencia(h.url, h.cita), articulo_origen_id: articuloId }))
  const { data: existentes } = await admin.from('editorial_evidencia').select('clave').in('clave', filas.map((f) => f.clave))
  const ya = new Set(((existentes ?? []) as { clave: string }[]).map((e) => e.clave))
  const nuevas = filas.filter((f) => !ya.has(f.clave))
  if (nuevas.length) await admin.from('editorial_evidencia').insert(nuevas)
}

/** Evidencia de la biblioteca relacionada con un tema (por palabras en común), excluyendo un artículo. */
async function evidenciaRelacionada(admin: Admin, tema: string, excluirArticulo?: string, max = 15) {
  const claves = new Set(normalizar(tema).split(' ').filter((w) => w.length > 4))
  if (!claves.size) return []
  const { data } = await admin.from('editorial_evidencia').select('tipo, afirmacion, fuente, url, cita, vigencia, articulo_origen_id').limit(800)
  return ((data ?? []) as { tipo: string; afirmacion: string; fuente: string | null; url: string | null; cita: string | null; vigencia: string | null; articulo_origen_id: string | null }[])
    .filter((e) => e.articulo_origen_id !== excluirArticulo)
    .map((e) => ({ e, n: normalizar(`${e.afirmacion} ${e.fuente ?? ''}`).split(' ').filter((w) => claves.has(w)).length }))
    .filter((x) => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, max).map((x) => x.e)
}

/** Preguntas abiertas por línea temática, para que el radar proponga continuaciones de las series. */
async function preguntasAbiertas(admin: Admin): Promise<string> {
  const { data } = await admin.from('editorial_tesis').select('texto, eje:editorial_ejes(nombre)').eq('tipo', 'pregunta').eq('vigente', true).is('propuesta_id', null).limit(30)
  const q = (data ?? []) as unknown as { texto: string; eje: { nombre: string } | null }[]
  if (!q.length) return ''
  return 'PREGUNTAS ABIERTAS DE LAS LÍNEAS TEMÁTICAS (si alguna tiene novedades que la vuelvan oportuna, proponela como continuación de la serie):\n' +
    q.map((x) => `- [${x.eje?.nombre ?? 'sin línea'}] ${x.texto}`).join('\n') + '\n\n'
}

/** Guía de estilo de Marco (reglas activas, las más confirmadas primero). */
async function guiaEstilo(admin: Admin): Promise<string> {
  const { data } = await admin.from('editorial_estilo').select('regla, antes, despues').eq('activa', true).order('veces', { ascending: false }).limit(30)
  const reglas = (data ?? []) as { regla: string; antes: string | null; despues: string | null }[]
  if (!reglas.length) return ''
  return 'GUÍA DE ESTILO DE MARCO (aprendida de sus correcciones; respetala por encima de tus preferencias):\n' +
    reglas.map((r) => `- ${r.regla}${r.antes && r.despues ? ` (en lugar de "${r.antes}" → "${r.despues}")` : ''}`).join('\n')
}

/** Línea temática del artículo: tesis ya sostenidas, preguntas abiertas y otros artículos de la serie. */
async function memoriaEje(admin: Admin, articuloId: string): Promise<string> {
  const { data: a } = await admin.from('editorial_articulos').select('eje_id').eq('id', articuloId).maybeSingle()
  const ejeId = (a as { eje_id: string | null } | null)?.eje_id
  if (!ejeId) return ''
  const [{ data: eje }, { data: tesis }, { data: otros }] = await Promise.all([
    admin.from('editorial_ejes').select('nombre, descripcion').eq('id', ejeId).maybeSingle(),
    admin.from('editorial_tesis').select('tipo, texto').eq('eje_id', ejeId).eq('vigente', true).neq('articulo_id', articuloId).limit(40),
    admin.from('editorial_articulos').select('titulo, estado').eq('eje_id', ejeId).neq('id', articuloId).in('estado', ['aprobado', 'publicado']).limit(15),
  ])
  const e = eje as { nombre: string; descripcion: string | null } | null
  const t = (tesis ?? []) as { tipo: string; texto: string }[]
  const o = (otros ?? []) as { titulo: string }[]
  return `LÍNEA TEMÁTICA: ${e?.nombre ?? ''}${e?.descripcion ? ` — ${e.descripcion}` : ''}\n` +
    `Tesis que Marco ya sostuvo en esta línea (no las contradigas sin decirlo; podés remitir a ellas):\n${t.filter((x) => x.tipo === 'tesis').map((x) => `- ${x.texto}`).join('\n') || '(ninguna todavía)'}\n` +
    `Artículos anteriores de la línea:\n${o.map((x) => `- "${x.titulo}"`).join('\n') || '(ninguno)'}`
}

/** Evidencia comprobada para la redacción. */
async function bloqueEvidencia(admin: Admin, articuloId: string): Promise<string> {
  const { data } = await admin.from('editorial_hallazgos').select('orden, afirmacion, tipo, fuente, url, cita, vigencia, estado').eq('articulo_id', articuloId).order('orden')
  const hs = (data ?? []) as { orden: number; afirmacion: string; tipo: string; fuente: string | null; url: string | null; cita: string | null; vigencia: string | null; estado: string }[]
  // Evidencia comprobada en artículos anteriores sobre el mismo tema
  const { data: a } = await admin.from('editorial_articulos').select('titulo, propuesta:editorial_propuestas!editorial_articulos_propuesta_id_fkey(problema, pregunta)').eq('id', articuloId).maybeSingle()
  const art = a as { titulo: string; propuesta: { problema: string | null; pregunta: string | null } | null } | null
  const previas = art ? await evidenciaRelacionada(admin, `${art.titulo} ${art.propuesta?.problema ?? ''} ${art.propuesta?.pregunta ?? ''}`, articuloId) : []
  const bloquePrevias = previas.length
    ? '\n\nEVIDENCIA COMPROBADA EN ARTÍCULOS ANTERIORES (biblioteca del estudio; podés citarla):\n' +
      previas.map((e) => `- (${e.tipo}) ${e.afirmacion} — Fuente: ${e.fuente ?? 's/d'}${e.url ? ` <${e.url}>` : ''}${e.cita ? `\n  Cita: "${e.cita}"` : ''}`).join('\n')
    : ''
  if (!hs.length) return bloquePrevias.trim()
  const hoy = new Date().toLocaleDateString('es-AR')
  const linea = (h: typeof hs[number]) => `- [H${h.orden}] (${h.tipo}) ${h.afirmacion} — Fuente: ${h.fuente ?? 's/d'}${h.url ? ` <${h.url}>` : ''}` +
    `${h.vigencia ? ` — Vigencia: ${h.vigencia}` : ''}${h.cita ? `\n  Cita: "${h.cita}"` : ''}`
  const ok = hs.filter((h) => h.estado === 'comprobado')
  const parcial = hs.filter((h) => h.estado === 'parcial')
  const no = hs.filter((h) => !['comprobado', 'parcial'].includes(h.estado))
  return 'EVIDENCIA DE LA INVESTIGACIÓN EXTERNA (comprobada por el sistema contra cada fuente; fecha de consulta: ' + hoy + ')\n' +
    `COMPROBADA (podés afirmarla y citarla):\n${ok.map(linea).join('\n') || '(ninguna)'}\n\n` +
    `PARCIAL (la fuente existe pero la cita no coincide exacta: usala con cautela y marcá [VERIFICAR] si afirmás el detalle):\n${parcial.map(linea).join('\n') || '(ninguna)'}\n\n` +
    `NO COMPROBADA (no la afirmes; si la mencionás, va con [VERIFICAR: …]):\n${no.map(linea).join('\n') || '(ninguna)'}\n\n` +
    'La bibliografía debe incluir las fuentes comprobadas que uses, con su URL y la fecha de consulta en formato APA.' + bloquePrevias
}

/** Pide la parte que faltó de un artículo cortado y los datos finales (referencias, bibliografía). */
async function continuarArticulo(admin: Admin, userId: string, art: { id: string; titulo: string; bajada: string | null }, cuerpo: string): Promise<{
  continuacion: string; referencias: unknown[]; bibliografia: string[]; a_verificar: unknown[]
}> {
  const evidencia = await bloqueEvidencia(admin, art.id)
  const r = await llm(admin, userId,
    'MODO CONTINUACIÓN. El borrador de abajo quedó cortado (puede terminar en mitad de una palabra). ' +
    'Escribí SOLO la continuación desde el punto exacto del corte, sin repetir nada de lo anterior, hasta el cierre del artículo. ' +
    'Si el corte quedó en mitad de una palabra, empezá completándola. Mantené el registro y las reglas de citas.\n\n' +
    ((await guiaEstilo(admin)) + '\n\n') +
    (evidencia ? `${evidencia}\n\n` : '') +
    `TÍTULO: ${art.titulo}\nBAJADA: ${art.bajada ?? ''}\n\nBORRADOR HASTA EL CORTE (últimos 12.000 caracteres):\n<<<\n${cuerpo.slice(-12000)}\n>>>\n\n` +
    `${NORMAS_APA}\n\n` +
    `${FORMATO_JSON}\n{ "continuacion_markdown": "...", "bibliografia": ["entrada APA de cada fuente citada en TODO el artículo"], ` +
    '"referencias": [{ "cita": "...", "fuente": "...", "verificada": true|false }], "a_verificar": ["..."] }',
    7000)
  return {
    continuacion: String(r.continuacion_markdown ?? ''),
    referencias: Array.isArray(r.referencias) ? r.referencias.slice(0, 40) : [],
    bibliografia: limpiarBibliografia(r.bibliografia),
    a_verificar: Array.isArray(r.a_verificar) ? r.a_verificar.slice(0, 40) : [],
  }
}

/** Une el texto cortado con su continuación respetando el corte (palabra a medias o espacio). */
function unirCorte(antes: string, despues: string): string {
  const a = antes.replace(/\s+$/, '')
  const d = despues.replace(/^\s+/, '')
  if (!d) return a
  return /[\p{L}\p{N}]$/u.test(a) && /^[\p{Ll}]/u.test(d) && !/[.!?:;»")\]]$/.test(a) ? a + d : `${a}${/^[,.;:)]/.test(d) ? '' : ' '}${d}`
}

/** Bibliografía APA de las fuentes efectivamente citadas en el texto (no toca el cuerpo). */
async function bibliografiaDesdeTexto(admin: Admin, userId: string, art: Record<string, unknown>): Promise<string[]> {
  const evidencia = await bloqueEvidencia(admin, String(art.id))
  const r = await llm(admin, userId,
    'MODO BIBLIOGRAFÍA.\n\n' +
    `ARTÍCULO:\nTítulo: ${art.titulo}\n\n${String(art.cuerpo ?? '').slice(0, 40000)}\n\n` +
    (evidencia ? `${evidencia}\n\n` : '') +
    `REFERENCIAS REGISTRADAS EN LA REDACCIÓN:\n${JSON.stringify(art.referencias ?? [], null, 2)}\n\n` +
    'Armá la bibliografía final del artículo: una entrada por cada norma, fallo u obra efectivamente citada o aludida en el texto. ' +
    'Si la fuente está en la evidencia, usá sus datos y su URL con la fecha de consulta. ' +
    `No reescribas el artículo ni agregues fuentes que el texto no use. ${NORMAS_APA}\n\n` +
    `${FORMATO_JSON}\n{ "bibliografia": ["entrada APA", "..."] }`,
    3000)
  return limpiarBibliografia(r.bibliografia)
}

// ── Contexto ────────────────────────────────────────────────────────────────

/** Memoria editorial: propuestas y artículos recientes (para no repetir y dar continuidad). */
async function memoria(admin: Admin): Promise<string> {
  const desde = new Date(Date.now() - 120 * 86_400_000).toISOString()
  const [{ data: props }, { data: arts }] = await Promise.all([
    admin.from('editorial_propuestas').select('titulo, estado, created_at').gte('created_at', desde).order('created_at', { ascending: false }).limit(40),
    admin.from('editorial_articulos').select('titulo, estado, tipo, updated_at').order('updated_at', { ascending: false }).limit(30),
  ])
  const p = ((props ?? []) as { titulo: string; estado: string; created_at: string }[])
    .map((x) => `- [propuesta ${x.estado}, ${x.created_at.slice(0, 10)}] ${x.titulo}`)
  const a = ((arts ?? []) as { titulo: string; estado: string; tipo: string; updated_at: string }[])
    .map((x) => `- [artículo ${x.estado}, ${x.tipo}] ${x.titulo}`)
  return [...a, ...p].join('\n') || '(sin producción editorial previa)'
}

interface SentenciaCtx {
  id: string
  fecha: string
  titulo: string
  cuerpo: string | null
  expediente_id: string
  fuero: string | null
  caratula: string | null
}

async function cargarSentencia(admin: Admin, movementId: string): Promise<SentenciaCtx | null> {
  const { data } = await admin.from('sae_movements')
    .select('id, fecha, titulo, cuerpo, expediente_id, expediente:expedientes(fuero, caratula)')
    .eq('id', movementId).maybeSingle()
  if (!data) return null
  const d = data as unknown as { id: string; fecha: string; titulo: string; cuerpo: string | null; expediente_id: string; expediente: { fuero: string | null; caratula: string | null } | null }
  return { id: d.id, fecha: d.fecha, titulo: d.titulo, cuerpo: d.cuerpo, expediente_id: d.expediente_id, fuero: d.expediente?.fuero ?? null, caratula: d.expediente?.caratula ?? null }
}

function bloqueSentencia(s: SentenciaCtx): string {
  return `FUENTE A (interna y confidencial — no publicable; usarla solo como disparador de un problema jurídico general):\n` +
    `Sentencia del ${s.fecha} en un expediente del fuero ${s.fuero ?? 'sin dato'}.\n` +
    `Título de la actuación: ${s.titulo}\n` +
    `Texto:\n${(s.cuerpo ?? '').slice(0, 14000)}`
}

/** Palabras que identifican a las partes del expediente (para el control de confidencialidad). */
async function nombresSensibles(admin: Admin, expedienteId: string | null): Promise<string[]> {
  if (!expedienteId) return []
  const { data } = await admin.from('expedientes')
    .select('caratula, clientes(nombre, apellido)').eq('id', expedienteId).maybeSingle()
  const e = data as unknown as { caratula: string | null; clientes: { nombre: string | null; apellido: string | null } | null } | null
  const genericas = new Set(['provincia', 'aseguradora', 'riesgos', 'trabajo', 'sociedad', 'anonima', 'responsabilidad', 'limitada',
    'amparo', 'daños', 'danos', 'perjuicios', 'cobro', 'pesos', 'despido', 'otros', 'otro', 'sobre', 'contra', 'nacional', 'argentina',
    'municipalidad', 'estado', 'importado', 'gobierno', 'tucuman', 'tucumán', 'indemnizacion', 'indemnización', 'accidente', 'laboral',
    'sucesion', 'sucesión', 'ejecutivo', 'ejecucion', 'ejecución', 'banco', 'seguros', 'compañia', 'compania'])
  const partes = (e?.caratula ?? '').split(/\s+S\/\s+/i)[0] ?? ''
  const texto = `${partes} ${e?.clientes?.nombre ?? ''} ${e?.clientes?.apellido ?? ''}`
  const palabras = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[A-Za-zÑñ]{4,}/g) ?? []
  return [...new Set(palabras.map((p) => p.toLowerCase()))].filter((p) => !genericas.has(p))
}

function chequearConfidencialidad(texto: string, nombres: string[]): string[] {
  const normal = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return nombres.filter((n) => new RegExp(`\\b${n}\\b`, 'i').test(normal))
    .map((n) => `Aparece "${n}", que figura en la carátula o en los datos del cliente del expediente de origen.`)
}

/** Aviso por Telegram a una persona del equipo (si tiene el chat vinculado). */
async function avisarPersona(admin: Admin, profileId: string | null, texto: string, url = `${APP_URL}/editorial`): Promise<boolean> {
  const token = Deno.env.get('TELEGRAM_ESCRITO_BOT_TOKEN')
  if (!profileId || !token) return false
  const { data } = await admin.from('profiles').select('telegram_chat_id').eq('id', profileId).maybeSingle()
  const chat = (data as { telegram_chat_id: number | null } | null)?.telegram_chat_id
  if (!chat) return false
  return await tgSendKb(token, chat, texto, [[{ text: 'Abrir en Editorial', url }]])
}

/** Aviso por Telegram a quien pidió un trabajo largo (por si cerró la app mientras tanto). */
async function avisarFin(admin: Admin, userId: string, articuloId: string, titulo: string, que: string) {
  const texto = `Editorial: ${que} de "${titulo}" terminó. Ya podés revisarlo en la app.`
  const url = `${APP_URL}/editorial/${articuloId}`
  const { data } = await admin.from('profiles').select('editorial_aprueba').eq('id', userId).maybeSingle()
  if ((data as { editorial_aprueba?: boolean } | null)?.editorial_aprueba) await telegramMarco(`${texto}\n${url}`)
  else await avisarPersona(admin, userId, texto, url)
}

/** Quién trabaja un artículo: el asignado o quien lo creó. */
const responsable = (a: Record<string, unknown>) => (a.asignado_a ?? a.creado_por ?? null) as string | null

async function telegramMarco(texto: string) {
  const token = Deno.env.get('TELEGRAM_ESCRITO_BOT_TOKEN')
  const chat = Number(Deno.env.get('TELEGRAM_MARCO_CHAT_ID') ?? '') || null
  if (!token || !chat) return
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chat, text: texto, disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[{ text: 'Ver propuestas', url: `${APP_URL}/editorial` }]] },
    }),
  }).catch(() => {})
}

const CAMPOS_PROPUESTA =
  '{ "titulo": "título tentativo", "problema": "problema jurídico central", "pregunta": "pregunta que debería responder el artículo", ' +
  '"fuentes": [{ "tipo": "A|B|C", "descripcion": "qué fuente y por qué (sin datos identificatorios de partes)" }], ' +
  '"hipotesis": "hipótesis argumentativa inicial", "relevancia": "relevancia para el público del estudio", ' +
  '"enfoque": "enfoque diferencial respecto de una noticia o resumen", "actualidad": 1-5, "interes": 1-5, "originalidad": 1-5, ' +
  '"riesgos": "riesgos de confidencialidad o necesidad de verificación", ' +
  '"tipo_sugerido": "divulgacion|analisis_profesional|actualidad|reflexion|jurisprudencial" }'

function propuestaDesdeIA(p: Record<string, unknown>) {
  const n = (v: unknown) => (typeof v === 'number' && v >= 1 && v <= 5 ? Math.round(v) : null)
  const t = (v: unknown, max = 2000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
  return {
    titulo: t(p.titulo, 200) ?? 'Propuesta sin título',
    problema: t(p.problema),
    pregunta: t(p.pregunta),
    fuentes: Array.isArray(p.fuentes) ? p.fuentes.slice(0, 10) : [],
    hipotesis: t(p.hipotesis),
    relevancia: t(p.relevancia),
    enfoque: t(p.enfoque),
    actualidad: n(p.actualidad),
    interes: n(p.interes),
    originalidad: n(p.originalidad),
    riesgos: t(p.riesgos),
    tipo_sugerido: TIPOS.includes(p.tipo_sugerido as typeof TIPOS[number]) ? p.tipo_sugerido as string : null,
  }
}

// ── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  try {
    const admin: Admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const modo = String(body.modo ?? '')

    // Auth
    const cronSecret = Deno.env.get('CRON_SECRET')
    const esCron = !!cronSecret && req.headers.get('x-cron-secret') === cronSecret
    let userId: string
    if (esCron) {
      if (!['sentencias', 'radar', 'seguimiento', 'actualizacion'].includes(modo)) return json(req, { error: 'Modo no permitido por cron' }, 403)
      const { data } = await admin.from('profiles').select('id').eq('acceso_editorial', true).eq('activo', true).order('editorial_aprueba', { ascending: false }).limit(1).maybeSingle()
      if (!data) return json(req, { ok: true, mensaje: 'Nadie con acceso editorial' })
      userId = (data as { id: string }).id
    } else {
      const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
      const { data: { user }, error } = await anon.auth.getUser()
      if (error || !user) return json(req, { error: 'No autorizado' }, 401)
      const { data: ok } = await anon.rpc('can_access_editorial')
      if (ok !== true) return json(req, { error: 'Sin acceso al módulo editorial' }, 403)
      userId = user.id
    }

    // ── seguimiento (cron diario): recordatorios y resumen semanal ─────────
    if (modo === 'seguimiento') {
      const hoy = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10) // fecha AR
      const { data: aprobadores } = await admin.from('profiles').select('id').eq('editorial_aprueba', true)
      const marcoIds = new Set(((aprobadores ?? []) as { id: string }[]).map((p) => p.id))
      let recordatorios = 0

      // Temas asignados con plazo vencido que todavía no llegaron a aprobación
      const { data: vencidas } = await admin.from('editorial_propuestas')
        .select('id, titulo, asignado_a, fecha_limite, estado').not('asignado_a', 'is', null)
        .neq('estado', 'descartada').lt('fecha_limite', hoy)
      for (const p of (vencidas ?? []) as { id: string; titulo: string; asignado_a: string; fecha_limite: string }[]) {
        const { data: art } = await admin.from('editorial_articulos').select('estado, aprobacion_pedida_at').eq('propuesta_id', p.id).maybeSingle()
        const a = art as { estado: string; aprobacion_pedida_at: string | null } | null
        if (a && (['aprobado', 'publicado', 'archivado'].includes(a.estado) || a.aprobacion_pedida_at)) continue
        if (await avisarPersona(admin, p.asignado_a, `Editorial: venció el plazo (${p.fecha_limite.split('-').reverse().join('/')}) del artículo "${p.titulo}". ` +
          (a ? 'Está en curso: cuando lo tengas, pedile la aprobación a Marco.' : 'Todavía no empezó la investigación.'))) recordatorios++
      }

      // Artículos de colaboradores parados hace 4 días o más (un recordatorio cada 3 días)
      const hace4 = new Date(Date.now() - 4 * 86_400_000).toISOString()
      const hace3 = new Date(Date.now() - 3 * 86_400_000).toISOString()
      const { data: parados } = await admin.from('editorial_articulos')
        .select('id, titulo, estado, asignado_a, creado_por, recordado_at, devuelto_at')
        .in('estado', ['investigacion', 'borrador']).is('aprobacion_pedida_at', null).lt('updated_at', hace4)
      for (const a of (parados ?? []) as Record<string, unknown>[]) {
        const quien = responsable(a)
        if (!quien || marcoIds.has(quien)) continue
        if (a.recordado_at && String(a.recordado_at) > hace3) continue
        const texto = `Editorial: el artículo "${a.titulo}" está sin movimiento hace más de 4 días` +
          (a.devuelto_at ? ' y tiene observaciones de Marco pendientes.' : '.')
        if (await avisarPersona(admin, quien, texto, `${APP_URL}/editorial/${a.id}`)) {
          recordatorios++
          await admin.from('editorial_articulos').update({ recordado_at: new Date().toISOString() }).eq('id', a.id)
        }
      }

      // Lunes: resumen semanal para Marco
      let resumen = false
      if (new Date(Date.now() - 3 * 3_600_000).getUTCDay() === 1) {
        const [{ data: arts }, { data: props }] = await Promise.all([
          admin.from('editorial_articulos').select('titulo, estado, aprobacion_pedida_at, devuelto_at, aprobado_at, updated_at').neq('estado', 'archivado'),
          admin.from('editorial_propuestas').select('estado, asignado_a, fecha_limite').eq('estado', 'propuesta'),
        ])
        const A = (arts ?? []) as { titulo: string; estado: string; aprobacion_pedida_at: string | null; devuelto_at: string | null; aprobado_at: string | null; updated_at: string }[]
        const hace7 = new Date(Date.now() - 7 * 86_400_000).toISOString()
        const esperan = A.filter((a) => a.estado === 'borrador' && a.aprobacion_pedida_at)
        const enCurso = A.filter((a) => ['investigacion', 'borrador'].includes(a.estado) && !a.aprobacion_pedida_at)
        const aprobados = A.filter((a) => a.aprobado_at && a.aprobado_at > hace7)
        const P = (props ?? []) as { asignado_a: string | null; fecha_limite: string | null }[]
        const vencidasN = P.filter((p) => p.asignado_a && p.fecha_limite && p.fecha_limite < hoy).length
        if (A.length || P.length) {
          await telegramMarco('Editorial — resumen de la semana\n\n' +
            `• Esperan tu aprobación: ${esperan.length}${esperan.length ? `\n${esperan.slice(0, 5).map((a) => `   – ${a.titulo}`).join('\n')}` : ''}\n` +
            `• En curso: ${enCurso.length} (${enCurso.filter((a) => a.devuelto_at).length} con tus observaciones)\n` +
            `• Aprobados en los últimos 7 días: ${aprobados.length}\n` +
            `• Propuestas sin empezar: ${P.length}${vencidasN ? ` (${vencidasN} asignadas con plazo vencido)` : ''}`)
          resumen = true
        }
      }
      return json(req, { ok: true, recordatorios, resumen })
    }

    // ── actualización (cron semanal): ¿algún artículo aprobado quedó desactualizado? ──
    if (modo === 'actualizacion') {
      const { data: arts } = await admin.from('editorial_articulos')
        .select('id, titulo, bajada, cuerpo, estado').in('estado', ['aprobado', 'publicado']).order('updated_at', { ascending: false }).limit(25)
      const articulos = (arts ?? []) as { id: string; titulo: string; bajada: string | null; cuerpo: string }[]
      if (!articulos.length) return json(req, { ok: true, propuestas: 0, mensaje: 'Sin artículos aprobados' })
      const hace8 = new Date(Date.now() - 8 * 86_400_000).toISOString()
      const [{ data: movs }, { data: juris }, { data: normas }] = await Promise.all([
        admin.from('sae_movements').select('fecha, titulo, cuerpo, expediente:expedientes(fuero)')
          .eq('tipo_movimiento', 'sentencia').gte('created_at', hace8).limit(20),
        admin.from('jurisprudencia_documentos').select('caratula, tribunal, fecha, sumario').gte('created_at', hace8).limit(15),
        admin.from('normativa_documentos').select('titulo, tipo, numero, fecha').gte('created_at', hace8).limit(15),
      ])
      const novedades = [
        ...((movs ?? []) as unknown as { fecha: string; titulo: string; cuerpo: string | null; expediente: { fuero: string | null } | null }[])
          .map((m) => `- Sentencia (interna, fuero ${m.expediente?.fuero ?? 's/d'}, ${m.fecha}): ${m.titulo} — ${(m.cuerpo ?? '').replace(/\s+/g, ' ').slice(0, 500)}`),
        ...((juris ?? []) as { caratula: string; tribunal: string | null; fecha: string | null; sumario: string | null }[])
          .map((j) => `- Fallo incorporado: ${j.tribunal ?? 's/d'}, ${j.fecha ?? 's/f'}, "${j.caratula}": ${(j.sumario ?? '').slice(0, 400)}`),
        ...((normas ?? []) as { titulo: string; tipo: string | null; numero: string | null; fecha: string | null }[])
          .map((n) => `- Norma incorporada: ${n.tipo ?? ''} ${n.numero ?? ''} ${n.titulo} (${n.fecha ?? 's/f'})`),
      ]
      if (!novedades.length) return json(req, { ok: true, propuestas: 0, mensaje: 'Sin novedades en la semana' })
      const { data: abiertas } = await admin.from('editorial_propuestas').select('articulo_id').eq('origen', 'actualizacion').eq('estado', 'propuesta')
      const conAbierta = new Set(((abiertas ?? []) as { articulo_id: string }[]).map((p) => p.articulo_id))

      const r = await llm(admin, userId,
        'MODO ACTUALIZACIÓN.\n\n' +
        `ARTÍCULOS APROBADOS O PUBLICADOS:\n${articulos.map((a) => `[${a.id}] ${a.titulo}\n${a.bajada ?? ''}\n${a.cuerpo.replace(/\s+/g, ' ').slice(0, 1200)}`).join('\n\n')}\n\n` +
        `NOVEDADES DE LA ÚLTIMA SEMANA:\n${novedades.join('\n')}\n\n` +
        'Indicá solo los artículos que una novedad concreta deja desactualizados, incompletos o en tensión (un criterio nuevo, una reforma, ' +
        'un fallo que confirma o contradice la tesis). Si ninguno, devolvé la lista vacía: es lo más común. No uses datos identificatorios de partes.\n\n' +
        `${FORMATO_JSON}\n{ "actualizaciones": [{ "articulo_id": "uuid de arriba", "motivo": "qué novedad y por qué afecta al artículo", "que_revisar": "qué pasajes o afirmaciones revisar" }] }`,
        2500)
      const ids = new Set(articulos.map((a) => a.id))
      const titulos: string[] = []
      for (const u of (Array.isArray(r.actualizaciones) ? r.actualizaciones : []) as Record<string, unknown>[]) {
        const id = String(u.articulo_id ?? '')
        if (!ids.has(id) || conAbierta.has(id)) continue
        const art = articulos.find((a) => a.id === id)!
        const { data } = await admin.from('editorial_propuestas').insert({
          origen: 'actualizacion', articulo_id: id, titulo: `Actualizar: ${art.titulo}`.slice(0, 300),
          problema: String(u.motivo ?? '').slice(0, 2000), hipotesis: String(u.que_revisar ?? '').slice(0, 2000),
        }).select('titulo').single()
        if (data) { titulos.push(art.titulo); conAbierta.add(id) }
      }
      if (titulos.length) {
        await telegramMarco(`Editorial: ${titulos.length === 1 ? 'un artículo aprobado puede haber quedado desactualizado' : `${titulos.length} artículos aprobados pueden haber quedado desactualizados`}\n\n` +
          titulos.map((t) => `• ${t}`).join('\n'))
      }
      return json(req, { ok: true, propuestas: titulos.length })
    }

    // ── sentencias: evaluar las nuevas ─────────────────────────────────────
    if (modo === 'sentencias') {
      const desde = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10)
      const { data: movs } = await admin.from('sae_movements')
        .select('id, cuerpo, created_at').eq('tipo_movimiento', 'sentencia').gte('fecha', desde)
        .order('fecha', { ascending: true }).limit(40)
      const { data: vistos } = await admin.from('editorial_movimientos_evaluados').select('movement_id')
      const yaVistos = new Set(((vistos ?? []) as { movement_id: string }[]).map((v) => v.movement_id))
      const pendientes = ((movs ?? []) as { id: string; cuerpo: string | null; created_at: string }[])
        .filter((m) => !yaVistos.has(m.id))
        // Sin texto no se puede evaluar: se espera a que se baje el cuerpo
        .filter((m) => (m.cuerpo ?? '').length >= 400)
        .slice(0, MAX_SENTENCIAS_POR_CORRIDA)

      const mem = await memoria(admin)
      const nuevas: string[] = []
      for (const m of pendientes) {
        const s = await cargarSentencia(admin, m.id)
        if (!s) continue
        try {
          const r = await llm(admin, userId,
            `MODO: evaluación de una sentencia nueva para el radar editorial.\n\n${bloqueSentencia(s)}\n\n` +
            `MEMORIA EDITORIAL (no repetir):\n${mem}\n\n` +
            'Decidí, con el criterio final del sistema, si esta sentencia permite un artículo que valga la pena: un problema jurídico ' +
            'relevante, un criterio novedoso o discutible, una tensión conceptual. Muchas sentencias no lo ameritan: en ese caso decilo. ' +
            'Si lo amerita, formulá la propuesta como problema jurídico general, sin nombres de partes ni datos que permitan reconocer el caso.\n\n' +
            `${FORMATO_JSON}\n{ "merece": true|false, "motivo": "por qué sí o por qué no, en una oración", "propuesta": ${CAMPOS_PROPUESTA} }`,
            1500)
          if (r.merece === true && r.propuesta && typeof r.propuesta === 'object') {
            const { data: prop } = await admin.from('editorial_propuestas').insert({
              ...propuestaDesdeIA(r.propuesta as Record<string, unknown>),
              origen: 'sentencia', movement_id: s.id, expediente_id: s.expediente_id,
            }).select('id, titulo').single()
            await admin.from('editorial_movimientos_evaluados').insert({
              movement_id: s.id, resultado: 'propuesta', propuesta_id: (prop as { id: string } | null)?.id ?? null,
              motivo: String(r.motivo ?? '').slice(0, 500),
            })
            if (prop) nuevas.push((prop as { titulo: string }).titulo)
          } else {
            await admin.from('editorial_movimientos_evaluados').insert({
              movement_id: s.id, resultado: 'sin_interes', motivo: String(r.motivo ?? '').slice(0, 500),
            })
          }
        } catch (err) {
          console.error('[editorial] sentencia', m.id, err)
          await admin.from('editorial_movimientos_evaluados').insert({
            movement_id: m.id, resultado: 'error', motivo: (err instanceof Error ? err.message : String(err)).slice(0, 500),
          })
        }
      }
      if (nuevas.length) {
        await telegramMarco(`Editorial: ${nuevas.length === 1 ? 'una sentencia nueva da para un artículo' : `${nuevas.length} sentencias nuevas dan para artículos`}\n\n` +
          nuevas.map((t) => `• ${t}`).join('\n') + '\n\nNo se redactó nada: revisalas y decidí.')
      }
      return json(req, { ok: true, evaluadas: pendientes.length, propuestas: nuevas.length })
    }

    // ── radar ──────────────────────────────────────────────────────────────
    if (modo === 'radar') {
      const hace7 = new Date(Date.now() - 7 * 86_400_000).toISOString()
      const hace14 = new Date(Date.now() - 14 * 86_400_000).toISOString()
      const [{ data: movs }, { data: juris }, { data: normas }] = await Promise.all([
        admin.from('sae_movements')
          .select('fecha, titulo, tipo_movimiento, ai_summary, cuerpo, expediente:expedientes(fuero)')
          .in('tipo_movimiento', ['sentencia', 'decreto', 'intimacion', 'traslado', 'informe'])
          .gte('created_at', hace7).order('fecha', { ascending: false }).limit(40),
        admin.from('jurisprudencia_documentos')
          .select('caratula, tribunal, fecha, sumario, source_url').gte('created_at', hace14).limit(15),
        admin.from('normativa_documentos').select('*').gte('created_at', hace14).limit(10),
      ])
      // La mayoría de las actuaciones no tiene resumen de IA: se usa el título y el comienzo del texto
      const a = ((movs ?? []) as unknown as { fecha: string; titulo: string; tipo_movimiento: string; ai_summary: string | null; cuerpo: string | null; expediente: { fuero: string | null } | null }[])
        .map((m) => `- ${m.fecha} · ${m.tipo_movimiento} · fuero ${m.expediente?.fuero ?? 's/d'}: ` +
          (m.ai_summary ?? `${m.titulo}${m.cuerpo ? ` — ${m.cuerpo.replace(/\s+/g, ' ').slice(0, 300)}` : ''}`).slice(0, 400))
      const b = ((juris ?? []) as { caratula: string; tribunal: string | null; fecha: string | null; sumario: string | null; source_url: string | null }[])
        .map((j) => `- ${j.tribunal ?? 'Tribunal s/d'}, ${j.fecha ?? 's/f'}, "${j.caratula}": ${(j.sumario ?? '').slice(0, 400)}${j.source_url ? ` (${j.source_url})` : ''}`)
      const c = ((normas ?? []) as Record<string, unknown>[])
        .map((n) => `- ${String(n.titulo ?? n.nombre ?? n.tipo ?? 'Norma')}${n.numero ? ` ${n.numero}` : ''}${n.fecha ? ` (${n.fecha})` : ''}`)

      const r = await llm(admin, userId,
        'MODO RADAR EDITORIAL.\n\n' +
        `FUENTE A — novedades de la última semana en expedientes del estudio (internas, resumidas; no publicables):\n${a.join('\n') || '(sin novedades)'}\n\n` +
        `FUENTE B — jurisprudencia y doctrina incorporada en las últimas dos semanas:\n${b.join('\n') || '(nada nuevo)'}\n\n` +
        `Normativa incorporada:\n${c.join('\n') || '(nada nuevo)'}\n\n` +
        'FUENTE C — no hay acceso a noticias en esta corrida: no inventes acontecimientos públicos.\n\n' +
        `MEMORIA EDITORIAL (no repetir):\n${(await memoria(admin))}\n\n` +
        (await preguntasAbiertas(admin)) +
        'Proponé entre 0 y 5 temas, solo si hay fundamentos suficientes. Si las novedades no lo justifican, podés proponer un problema de ' +
        'interés permanente o profundizar una línea anterior, y decirlo. No uses datos identificatorios de partes.\n\n' +
        `${FORMATO_JSON}\n{ "comentario": "una o dos oraciones sobre el panorama de la semana", "temas": [ ${CAMPOS_PROPUESTA} ] }`,
        4000)
      const temas = Array.isArray(r.temas) ? (r.temas as Record<string, unknown>[]).slice(0, 5) : []
      const titulos: string[] = []
      for (const t of temas) {
        const { data } = await admin.from('editorial_propuestas').insert({ ...propuestaDesdeIA(t), origen: 'radar' }).select('titulo').single()
        if (data) titulos.push((data as { titulo: string }).titulo)
      }
      if (titulos.length && esCron) {
        await telegramMarco(`Radar editorial: ${titulos.length} ${titulos.length === 1 ? 'tema' : 'temas'}\n\n` +
          titulos.map((t) => `• ${t}`).join('\n') + (r.comentario ? `\n\n${String(r.comentario).slice(0, 400)}` : ''))
      }
      return json(req, { ok: true, propuestas: titulos.length, comentario: r.comentario ?? null })
    }

    // ── investigar ─────────────────────────────────────────────────────────
    // ── asignar un tema a un colaborador (solo quien aprueba: Marco) ──────
    if (modo === 'asignar') {
      const { data: yo } = await admin.from('profiles').select('nombre, editorial_aprueba').eq('id', userId).maybeSingle()
      if (!(yo as { editorial_aprueba?: boolean } | null)?.editorial_aprueba) return json(req, { error: 'Solo Marco asigna temas' }, 403)
      const propuestaId = String(body.propuesta_id ?? '')
      const asignadoA = body.asignado_a ? String(body.asignado_a) : null
      const nota = typeof body.nota === 'string' ? body.nota.slice(0, 2000).trim() || null : null
      const { data: p } = await admin.from('editorial_propuestas').select('id, titulo, pregunta').eq('id', propuestaId).maybeSingle()
      if (!p) return json(req, { error: 'Propuesta no encontrada' }, 404)
      let destino: { nombre: string; telegram_chat_id: number | null } | null = null
      if (asignadoA) {
        const { data: d } = await admin.from('profiles').select('nombre, telegram_chat_id, acceso_editorial, activo').eq('id', asignadoA).maybeSingle()
        const dd = d as { nombre: string; telegram_chat_id: number | null; acceso_editorial: boolean; activo: boolean } | null
        if (!dd?.acceso_editorial || !dd.activo) return json(req, { error: 'Esa persona no tiene acceso al módulo editorial' }, 400)
        destino = dd
      }
      const fechaLimite = typeof body.fecha_limite === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha_limite) ? body.fecha_limite : null
      await admin.from('editorial_propuestas').update({
        asignado_a: asignadoA, nota_asignacion: asignadoA ? nota : null, fecha_limite: asignadoA ? fechaLimite : null,
        asignado_at: asignadoA ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
      }).eq('id', propuestaId)
      let avisado = false
      const token = Deno.env.get('TELEGRAM_ESCRITO_BOT_TOKEN')
      if (destino?.telegram_chat_id && token) {
        const prop = p as { id: string; titulo: string; pregunta: string | null }
        avisado = await tgSendKb(token, destino.telegram_chat_id,
          `Editorial: ${(yo as { nombre: string }).nombre} te propone un tema para un artículo.\n\n` +
          `"${prop.titulo}"${prop.pregunta ? `\n${prop.pregunta}` : ''}${nota ? `\n\nIndicaciones: ${nota}` : ''}` +
          (fechaLimite ? `\n\nPara el ${fechaLimite.split('-').reverse().join('/')}` : ''),
          [[{ text: 'Abrir en Editorial', url: `${APP_URL}/editorial` }]])
      }
      return json(req, { ok: true, avisado })
    }

    // ── proponer un artículo desde una actuación concreta (botón en el expediente) ──
    if (modo === 'proponer_movimiento') {
      const s = await cargarSentencia(admin, String(body.movement_id ?? ''))
      if (!s) return json(req, { error: 'Actuación no encontrada' }, 404)
      if ((s.cuerpo ?? '').length < 200) return json(req, { error: 'La actuación todavía no tiene texto: bajá el cuerpo desde SAE primero' }, 400)
      const r = await llm(admin, userId,
        `MODO: propuesta editorial a partir de una actuación elegida por el equipo.\n\n${bloqueSentencia(s)}\n\n` +
        `MEMORIA EDITORIAL (no repetir):\n${await memoria(admin)}\n\n` +
        'El equipo eligió esta actuación porque cree que da para un artículo. Formulá la mejor propuesta posible como problema jurídico ' +
        'general, sin nombres de partes ni datos que permitan reconocer el caso. Si de verdad no da para un artículo, decilo en "advertencia".\n\n' +
        `${FORMATO_JSON}\n{ "advertencia": "vacío o por qué no da", "propuesta": ${CAMPOS_PROPUESTA} }`,
        1500)
      if (!r.propuesta || typeof r.propuesta !== 'object') throw new Error('La IA no devolvió la propuesta')
      const { data: prop, error } = await admin.from('editorial_propuestas').insert({
        ...propuestaDesdeIA(r.propuesta as Record<string, unknown>),
        origen: 'actuacion', movement_id: s.id, expediente_id: s.expediente_id, creado_por: userId,
      }).select('id, titulo').single()
      if (error || !prop) throw new Error(`No se pudo crear la propuesta: ${error?.message}`)
      await admin.from('editorial_movimientos_evaluados').upsert({
        movement_id: s.id, resultado: 'propuesta', propuesta_id: (prop as { id: string }).id, motivo: 'Propuesta pedida desde el expediente',
      }, { onConflict: 'movement_id' })
      return json(req, { ok: true, propuesta_id: (prop as { id: string }).id, titulo: (prop as { titulo: string }).titulo, advertencia: r.advertencia || null })
    }

    // ── investigación externa: pedido para Gemini Deep Research (sin IA) ───
    if (modo === 'pedido_externo') {
      let base: Record<string, unknown> | null = null
      if (body.propuesta_id) {
        const { data } = await admin.from('editorial_propuestas').select('titulo, problema, pregunta, hipotesis, enfoque').eq('id', String(body.propuesta_id)).maybeSingle()
        base = data as Record<string, unknown> | null
      } else if (body.articulo_id) {
        const { data } = await admin.from('editorial_articulos').select('titulo, propuesta:editorial_propuestas!editorial_articulos_propuesta_id_fkey(titulo, problema, pregunta, hipotesis, enfoque)').eq('id', String(body.articulo_id)).maybeSingle()
        const a = data as { titulo: string; propuesta: Record<string, unknown> | null } | null
        base = a ? (a.propuesta ?? { titulo: a.titulo }) : null
      }
      if (!base) return json(req, { error: 'Propuesta no encontrada' }, 404)
      const b = base as { titulo: string; problema?: string | null; pregunta?: string | null }
      const previas = await evidenciaRelacionada(admin, `${b.titulo} ${b.problema ?? ''} ${b.pregunta ?? ''}`, undefined, 20)
      const yaVerificado = previas.length
        ? '\n\nYA VERIFICADO EN INVESTIGACIONES ANTERIORES (no hace falta volver a buscarlo; concentrate en lo que falta):\n' +
          previas.map((e) => `- ${e.fuente ?? e.afirmacion}${e.url ? ` — ${e.url}` : ''}`).join('\n')
        : ''
      return json(req, { ok: true, pedido: pedidoDeepResearch(b) + yaVerificado, ya_verificadas: previas.length })
    }

    // ── investigación externa: importar el informe ─────────────────────────
    if (modo === 'importar_informe') {
      const texto = typeof body.texto === 'string' ? body.texto.trim() : ''
      if (texto.length < 300) return json(req, { error: 'El informe es muy corto: pegá el texto completo' }, 400)
      if (texto.length > 400_000) return json(req, { error: 'El informe es demasiado largo' }, 400)

      // Artículo destino: el indicado, o uno nuevo desde la propuesta
      let articuloId = body.articulo_id ? String(body.articulo_id) : ''
      if (!articuloId) {
        const { data: p } = await admin.from('editorial_propuestas').select('*').eq('id', String(body.propuesta_id ?? '')).maybeSingle()
        if (!p) return json(req, { error: 'Propuesta no encontrada' }, 404)
        const prop = p as Record<string, unknown>
        const { data: nuevo, error } = await admin.from('editorial_articulos').insert({
          propuesta_id: prop.id, estado: 'investigacion', creado_por: userId, asignado_a: prop.asignado_a ?? null,
          tipo: TIPOS.includes(String(prop.tipo_sugerido) as typeof TIPOS[number]) ? String(prop.tipo_sugerido) : 'analisis_profesional',
          titulo: String(prop.titulo).slice(0, 300), modelo_ia: MODELO,
        }).select('id').single()
        if (error || !nuevo) throw new Error(`No se pudo crear el artículo: ${error?.message}`)
        articuloId = (nuevo as { id: string }).id
        await admin.from('editorial_propuestas').update({ estado: 'en_curso', updated_at: new Date().toISOString() }).eq('id', prop.id)
      }

      // 1) Formato pedido (sin IA). 2) Si vino en prosa, la IA lo pasa a hallazgos sin agregar nada.
      let hallazgos: Hallazgo[] = parsearBloques(texto)
      let normalizadoConIA = false
      if (hallazgos.length < 2) {
        const r = await llm(admin, userId,
          'MODO NORMALIZACIÓN DE INFORME. Recibís un informe de investigación jurídica hecho por otra herramienta. ' +
          'Separalo en hallazgos: cada afirmación jurídica relevante con su fuente. No agregues nada que no esté en el informe, ' +
          'no corrijas ni completes datos. Si el informe numera las fuentes al final, asociá cada afirmación con la URL que le corresponde. ' +
          '"cita" solo si el informe trae un fragmento entre comillas atribuido a esa fuente; copialo exacto. Si no, dejala vacía.\n\n' +
          `INFORME:\n<<<\n${texto.slice(0, 180_000)}\n>>>\n\n` +
          `${FORMATO_JSON}\n{ "hallazgos": [{ "afirmacion": "...", "tipo": "norma|fallo|doctrina|dato", "fuente": "nombre de la fuente", "url": "...", ` +
          '"cita": "", "vigencia": "", "confianza": "alta|media|baja", "numero": "", "tribunal": "", "fecha": "", "jurisdiccion": "" }] }',
          12000)
        hallazgos = ((Array.isArray(r.hallazgos) ? r.hallazgos : []) as Record<string, unknown>[]).map(hallazgoDesdeIA).filter((h): h is Hallazgo => !!h)
        normalizadoConIA = true
      }
      if (!hallazgos.length) return json(req, { error: 'No se encontraron hallazgos con fuente en el informe' }, 400)
      hallazgos = hallazgos.slice(0, 120)

      // Reemplaza una importación anterior del mismo artículo
      await admin.from('editorial_hallazgos').delete().eq('articulo_id', articuloId)
      await admin.from('editorial_fuentes').delete().eq('articulo_id', articuloId)
      const urls = [...new Set(hallazgos.map((h) => h.url).filter((u): u is string => !!u))]
      const fuenteId = new Map<string, string>()
      if (urls.length) {
        const { data: fs } = await admin.from('editorial_fuentes').insert(urls.map((url) => ({ articulo_id: articuloId, url }))).select('id, url')
        for (const f of (fs ?? []) as { id: string; url: string }[]) fuenteId.set(f.url, f.id)
      }
      const { error: eh } = await admin.from('editorial_hallazgos').insert(hallazgos.map((h, i) => ({
        articulo_id: articuloId, orden: i + 1, ...h, fuente_id: h.url ? fuenteId.get(h.url) ?? null : null,
        estado: h.url ? 'pendiente' : 'sin_fuente', detalle: h.url ? null : 'El informe no indica de dónde sale.',
      })))
      if (eh) throw new Error(`No se pudieron guardar los hallazgos: ${eh.message}`)
      await admin.from('editorial_articulos').update({
        informe_externo: texto, informe_cargado_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', articuloId)
      return json(req, { ok: true, articulo_id: articuloId, hallazgos: hallazgos.length, fuentes: urls.length, normalizado_con_ia: normalizadoConIA })
    }

    // ── investigación externa: visitar fuentes y comprobar citas (por tandas) ──
    if (modo === 'verificar_fuentes') {
      const articuloId = String(body.articulo_id ?? '')
      const { data: pend } = await admin.from('editorial_fuentes').select('id, url').eq('articulo_id', articuloId).eq('estado', 'pendiente').limit(3)
      // Se marcan antes de abrirlas: si un archivo pesado agota la función, no queda trabada en "pendiente"
      const tomadas = ((pend ?? []) as { id: string; url: string }[])
      if (tomadas.length) {
        await admin.from('editorial_fuentes').update({
          estado: 'sin_acceso', error: 'La lectura no terminó (archivo demasiado pesado). Pegá el texto de la fuente.', obtenida_at: new Date().toISOString(),
        }).in('id', tomadas.map((f) => f.id))
      }
      await Promise.all(tomadas.map(async (f) => {
        const r = await obtenerFuente(f.url)
        await admin.from('editorial_fuentes').update(r.ok
          ? { estado: 'ok', texto: r.texto, titulo: r.titulo, error: null, obtenida_at: new Date().toISOString() }
          : { estado: 'sin_acceso', error: r.error, obtenida_at: new Date().toISOString() }).eq('id', f.id)
      }))
      await comprobarHallazgos(admin, articuloId)
      const { count } = await admin.from('editorial_fuentes').select('id', { count: 'exact', head: true }).eq('articulo_id', articuloId).eq('estado', 'pendiente')
      return json(req, { ok: true, procesadas: (pend ?? []).length, pendientes: count ?? 0 })
    }

    // ── investigación externa: texto de una fuente que no se pudo abrir ───
    if (modo === 'texto_fuente') {
      const texto = typeof body.texto === 'string' ? body.texto.trim() : ''
      if (texto.length < 200) return json(req, { error: 'Pegá el texto completo de la fuente' }, 400)
      const { data: f } = await admin.from('editorial_fuentes').select('id, articulo_id').eq('id', String(body.fuente_id ?? '')).maybeSingle()
      if (!f) return json(req, { error: 'Fuente no encontrada' }, 404)
      const fuente = f as { id: string; articulo_id: string }
      await admin.from('editorial_fuentes').update({ estado: 'manual', texto: texto.slice(0, 3_000_000), error: null, obtenida_at: new Date().toISOString() }).eq('id', fuente.id)
      await admin.from('editorial_hallazgos').update({ estado: 'pendiente' }).eq('fuente_id', fuente.id)
      await comprobarHallazgos(admin, fuente.articulo_id)
      return json(req, { ok: true })
    }

    if (modo === 'investigar') {
      const { data: p } = await admin.from('editorial_propuestas').select('*').eq('id', String(body.propuesta_id ?? '')).maybeSingle()
      if (!p) return json(req, { error: 'Propuesta no encontrada' }, 404)
      const prop = p as Record<string, unknown>
      const s = prop.movement_id ? await cargarSentencia(admin, String(prop.movement_id)) : null

      // Jurisprudencia del estudio relacionada (búsqueda semántica existente)
      let juris = ''
      try {
        const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/match-jurisprudencia`, {
          method: 'POST',
          headers: { Authorization: req.headers.get('Authorization') ?? '', 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: `${prop.problema ?? ''} ${prop.pregunta ?? ''}`.slice(0, 1000), limit: 8 }),
        })
        const out = await res.json().catch(() => null) as { results?: Record<string, unknown>[]; resultados?: Record<string, unknown>[] } | Record<string, unknown>[] | null
        const lista = (Array.isArray(out) ? out : (out?.results ?? out?.resultados ?? [])) as Record<string, unknown>[]
        juris = lista.slice(0, 8).map((j) =>
          `- ${j.tribunal ?? 'Tribunal s/d'}, ${j.fecha ?? 's/f'}, "${j.caratula ?? ''}": ${String(j.fragmento ?? j.contenido ?? '').slice(0, 600)}`).join('\n')
      } catch (err) {
        console.warn('[editorial] match-jurisprudencia', err)
      }

      const r = await llm(admin, userId,
        'MODO INVESTIGACIÓN.\n\n' +
        `PROPUESTA:\n${JSON.stringify({ titulo: prop.titulo, problema: prop.problema, pregunta: prop.pregunta, hipotesis: prop.hipotesis, fuentes: prop.fuentes, enfoque: prop.enfoque }, null, 2)}\n\n` +
        (s ? `${bloqueSentencia(s)}\n\n` : '') +
        `FUENTE B — jurisprudencia de la base del estudio relacionada (la única que podés citar como comprobada):\n${juris || '(no se encontraron precedentes en la base)'}\n\n` +
        'Desarrollá la investigación: identificación normativa (con jurisdicción y fuero), análisis de la jurisprudencia disponible, contraste de ' +
        'interpretaciones, objeciones y una tesis editorial. Lo que no esté en las fuentes de arriba y no puedas afirmar con certeza, ' +
        'marcalo como [VERIFICAR: …]. No inventes fallos ni citas. Sé sintético: la investigación completa no debe pasar de 1500 palabras.\n\n' +
        `${FORMATO_JSON}\n{ "titulo": "título de trabajo", "tesis": "tesis editorial en 2-3 oraciones", ` +
        '"tipo_sugerido": "divulgacion|analisis_profesional|actualidad|reflexion|jurisprudencial", "investigacion_markdown": "la investigación completa en markdown" }',
        9000)

      const tipo = TIPOS.includes(r.tipo_sugerido as typeof TIPOS[number]) ? String(r.tipo_sugerido) : (String(prop.tipo_sugerido ?? '') || 'analisis_profesional')
      const investigacion = `**Tesis:** ${String(r.tesis ?? '')}\n\n${String(r.investigacion_markdown ?? '')}`
      const { data: art, error } = await admin.from('editorial_articulos').insert({
        creado_por: userId, asignado_a: prop.asignado_a ?? null,
        propuesta_id: prop.id, estado: 'investigacion', tipo: TIPOS.includes(tipo as typeof TIPOS[number]) ? tipo : 'analisis_profesional',
        titulo: String(r.titulo ?? prop.titulo).slice(0, 300), investigacion, modelo_ia: MODELO,
      }).select('id').single()
      if (error || !art) throw new Error(`No se pudo crear el artículo: ${error?.message}`)
      await admin.from('editorial_propuestas').update({ estado: 'en_curso', updated_at: new Date().toISOString() }).eq('id', prop.id)
      return json(req, { ok: true, articulo_id: (art as { id: string }).id })
    }

    // Modos sobre un artículo existente
    const { data: a, error: errArt } = await admin.from('editorial_articulos').select('*, propuesta:editorial_propuestas!editorial_articulos_propuesta_id_fkey(*)').eq('id', String(body.articulo_id ?? '')).maybeSingle()
    if (errArt) throw new Error(`No se pudo leer el artículo: ${errArt.message}`)
    const art = a as (Record<string, unknown> & { propuesta: Record<string, unknown> | null }) | null
    if (!art && ['redactar', 'revisar', 'adaptar', 'apa', 'refinar', 'pedir_aprobacion', 'devolver', 'verificar_citas', 'continuar', 'resolver_marcas', 'depurar', 'al_aprobar', 'chequeo'].includes(modo)) return json(req, { error: 'Artículo no encontrado' }, 404)

    // ── redactar ───────────────────────────────────────────────────────────
    if (modo === 'redactar' && art) {
      const tipo = TIPOS.includes(body.tipo as typeof TIPOS[number]) ? String(body.tipo) : String(art.tipo)
      const indicaciones = typeof body.indicaciones === 'string' ? body.indicaciones.slice(0, 3000) : ''
      const prop = art.propuesta
      const s = prop?.movement_id ? await cargarSentencia(admin, String(prop.movement_id)) : null
      const evidencia = await bloqueEvidencia(admin, String(art.id))
      const [estilo, lineaEje] = await Promise.all([guiaEstilo(admin), memoriaEje(admin, String(art.id))])

      const r = await llm(admin, userId,
        `MODO REDACCIÓN. Tipo: ${TIPO_LABEL[tipo]}.\n\n` +
        (estilo ? `${estilo}\n\n` : '') + (lineaEje ? `${lineaEje}\n\n` : '') +
        (prop ? `PROPUESTA:\n${JSON.stringify({ titulo: prop.titulo, problema: prop.problema, pregunta: prop.pregunta, hipotesis: prop.hipotesis, enfoque: prop.enfoque }, null, 2)}\n\n` : '') +
        (art.investigacion ? `INVESTIGACIÓN PREVIA:\n${String(art.investigacion).slice(0, 20000)}\n\n` : '') +
        (evidencia ? `${evidencia}\n\n` : '') +
        (s ? `${bloqueSentencia(s)}\n\n` : '') +
        (String(art.cuerpo ?? '').trim() ? `BORRADOR ACTUAL (mejoralo; respetá lo que Marco haya editado):\nTítulo: ${art.titulo}\nBajada: ${art.bajada ?? ''}\n${String(art.cuerpo).slice(0, 20000)}\n\n` : '') +
        (indicaciones ? `INDICACIONES DE MARCO (prioritarias):\n${indicaciones}\n\n` : '') +
        'Redactá el artículo completo, listo para revisión profesional: título, bajada y cuerpo argumentativo en markdown (pocos subtítulos, ' +
        'párrafos desarrollados). Cada afirmación que no puedas respaldar con las fuentes de arriba, marcala en el texto como [VERIFICAR: …]. ' +
        'Nada de datos que permitan reconocer el caso de origen. No le atribuyas a Marco experiencias ni opiniones no autorizadas.\n\n' +
        `${NORMAS_APA} No incluyas la bibliografía dentro del cuerpo: va aparte, en "bibliografia".\n\n` +
        `${FORMATO_JSON}\n{ "titulo": "...", "bajada": "...", "cuerpo_markdown": "...", "bibliografia": ["entrada APA", "..."], ` +
        '"referencias": [{ "cita": "norma o fallo citado", "fuente": "de dónde sale (base del estudio, norma vigente, etc.)", "verificada": true|false }], ' +
        '"a_verificar": ["afirmaciones que Marco tiene que comprobar antes de aprobar"] }',
        10000)

      const titulo = String(r.titulo ?? art.titulo).slice(0, 300)
      const bajada = String(r.bajada ?? '').slice(0, 1000)
      let cuerpo = String(r.cuerpo_markdown ?? '')
      if (!cuerpo.trim()) throw new Error('La IA no devolvió el cuerpo del artículo')
      // Respuesta cortada por el tope: se pide la continuación y los datos finales
      if (r.__cortada || !Array.isArray(r.bibliografia)) {
        const c = await continuarArticulo(admin, userId, { id: String(art.id), titulo, bajada }, cuerpo)
        cuerpo = unirCorte(cuerpo, c.continuacion)
        r.referencias = c.referencias; r.bibliografia = c.bibliografia; r.a_verificar = c.a_verificar
      }
      const alertas = chequearConfidencialidad(`${titulo}\n${bajada}\n${cuerpo}`, await nombresSensibles(admin, (prop?.expediente_id as string) ?? null))
      const version = Number(art.version ?? 0) + 1
      await admin.from('editorial_versiones').insert({ articulo_id: art.id, version, origen: 'ia', modo: 'redaccion', titulo, bajada, cuerpo, autor_id: userId })
      await admin.from('editorial_articulos').update({
        estado: 'borrador', tipo, titulo, bajada, cuerpo, version, modelo_ia: MODELO,
        referencias: Array.isArray(r.referencias) ? r.referencias.slice(0, 40) : [],
        bibliografia: limpiarBibliografia(r.bibliografia),
        a_verificar: Array.isArray(r.a_verificar) ? r.a_verificar.slice(0, 40) : [],
        alertas_confidencialidad: alertas, aprobado_at: null, updated_at: new Date().toISOString(),
      }).eq('id', art.id)
      await avisarFin(admin, userId, String(art.id), titulo, 'La redacción')
      return json(req, { ok: true, version, alertas: alertas.length })
    }

    // ── resolver las marcas [VERIFICAR] con la evidencia disponible ───────
    if (modo === 'resolver_marcas' && art) {
      const cuerpo = typeof body.cuerpo === 'string' && body.cuerpo.trim() ? body.cuerpo : String(art.cuerpo ?? '')
      // Cada marca con la oración (o el tramo) que la contiene
      const marcas: { i: number; marca: string; contexto: string }[] = []
      const re = /\[VERIFICAR[^\]]*\]/g
      let m: RegExpExecArray | null
      while ((m = re.exec(cuerpo)) && marcas.length < 30) {
        const ini = Math.max(cuerpo.lastIndexOf('\n', m.index), cuerpo.slice(0, m.index).search(/[^.!?]*$/) - 1, 0)
        const desde = Math.max(0, Math.min(ini, m.index - 400))
        marcas.push({ i: marcas.length, marca: m[0], contexto: cuerpo.slice(desde, m.index + m[0].length).trim() })
      }
      if (!marcas.length) return json(req, { ok: true, propuestas: [] })
      const evidencia = await bloqueEvidencia(admin, String(art.id))
      // Normas y fallos de la base relacionados (texto, sin IA)
      const { data: normas } = await admin.from('normativa_documentos').select('titulo, tipo, numero, fecha, source_url').limit(60)
      const { data: fallos } = await admin.from('jurisprudencia_documentos').select('caratula, tribunal, fecha, sumario, source_url').limit(60)
      const base = [
        ...((normas ?? []) as Record<string, unknown>[]).map((n) => `- Norma: ${n.tipo ?? ''} ${n.numero ?? ''} ${n.titulo} (${n.fecha ?? 's/f'})${n.source_url ? ` <${n.source_url}>` : ''}`),
        ...((fallos ?? []) as Record<string, unknown>[]).map((f) => `- Fallo: ${f.tribunal ?? ''}, "${f.caratula}", ${f.fecha ?? 's/f'}: ${String(f.sumario ?? '').slice(0, 300)}`),
      ].join('\n')
      const r = await llm(admin, userId,
        'MODO RESOLUCIÓN DE MARCAS. El borrador tiene marcas [VERIFICAR: …] en afirmaciones que no estaban respaldadas. ' +
        'Para cada marca decidí, usando SOLO la evidencia comprobada y la base del estudio que figuran abajo:\n' +
        '- "respaldada": la evidencia la sostiene → reescribí el tramo citando la fuente en APA y sin la marca.\n' +
        '- "reformular": la evidencia no alcanza pero la idea es defendible como opinión o inferencia → reescribí el tramo presentándolo como tal, sin la marca.\n' +
        '- "eliminar": es un dato que no se puede sostener → reescribí el tramo sin esa afirmación (y sin la marca).\n' +
        '- "mantener": hace falta que Marco lo compruebe a mano → no cambies nada.\n' +
        'El "original" debe ser una copia EXACTA, carácter por carácter, de un tramo del contexto que incluya la marca. El "nuevo" lo reemplaza tal cual.\n\n' +
        (evidencia ? `${evidencia}\n\n` : 'No hay investigación externa cargada.\n\n') +
        `BASE DEL ESTUDIO:\n${base || '(vacía)'}\n\n` +
        `MARCAS:\n${marcas.map((x) => `#${x.i}\nMarca: ${x.marca}\nContexto: ${x.contexto}`).join('\n\n')}\n\n` +
        `${NORMAS_APA}\n\n` +
        `${FORMATO_JSON}\n{ "propuestas": [{ "i": 0, "decision": "respaldada|reformular|eliminar|mantener", "motivo": "una oración", "fuente": "fuente usada o vacío", "original": "...", "nuevo": "..." }] }`,
        6000)
      const props = ((Array.isArray(r.propuestas) ? r.propuestas : []) as Record<string, unknown>[]).map((p) => {
        const x = marcas[Number(p.i)]
        if (!x) return null
        let original = String(p.original ?? '')
        // Si la IA no copió exacto, se reemplaza solo la marca
        if (!original || !cuerpo.includes(original) || !original.includes('[VERIFICAR')) original = x.marca
        const decision = ['respaldada', 'reformular', 'eliminar', 'mantener'].includes(String(p.decision)) ? String(p.decision) : 'mantener'
        return { i: x.i, marca: x.marca, decision, motivo: String(p.motivo ?? ''), fuente: String(p.fuente ?? ''), original, nuevo: decision === 'mantener' ? original : String(p.nuevo ?? '') }
      }).filter(Boolean)
      return json(req, { ok: true, propuestas: props })
    }

    // ── al aprobar: aprender del estilo de Marco y ubicar el artículo en su línea ──
    if (modo === 'al_aprobar' && art) {
      if (!['aprobado', 'publicado'].includes(String(art.estado))) return json(req, { error: 'El artículo no está aprobado' }, 400)
      // Primer borrador de la IA vs versión final aprobada
      const { data: vs } = await admin.from('editorial_versiones').select('version, origen, modo, cuerpo').eq('articulo_id', art.id).order('version')
      const versiones = (vs ?? []) as { version: number; origen: string; modo: string | null; cuerpo: string }[]
      const borradorIA = [...versiones].reverse().find((v) => v.origen === 'ia' && v.version < Number(art.version)) ?? versiones.find((v) => v.origen === 'ia')
      const final = String(art.cuerpo ?? '')
      const huboEdicion = !!borradorIA && borradorIA.cuerpo.trim() !== final.trim() && versiones.some((v) => v.origen === 'marco')
      const [{ data: reglas }, { data: ejes }] = await Promise.all([
        admin.from('editorial_estilo').select('id, regla').order('veces', { ascending: false }).limit(60),
        admin.from('editorial_ejes').select('id, nombre, descripcion'),
      ])
      const R = (reglas ?? []) as { id: string; regla: string }[]
      const E = (ejes ?? []) as { id: string; nombre: string; descripcion: string | null }[]

      const r = await llm(admin, userId,
        'MODO APRENDIZAJE AL APROBAR. Marco aprobó este artículo.\n\n' +
        (huboEdicion
          ? 'TAREA 1 — ESTILO: compará el borrador de la IA con la versión final de Marco y deducí reglas de estilo concretas y reutilizables ' +
            '(léxico, tono, estructura, cómo abre y cierra, cómo cita, qué evita). Solo reglas que se vean en sus correcciones, no gustos genéricos. ' +
            'Si una regla ya existe en la guía, no la repitas: indicá su id en "reforzadas".\n\n' +
            `BORRADOR DE LA IA:\n<<<\n${borradorIA!.cuerpo.slice(0, 18000)}\n>>>\n\nVERSIÓN FINAL DE MARCO:\n<<<\n${final.slice(0, 18000)}\n>>>\n\n` +
            `GUÍA ACTUAL:\n${R.map((x) => `[${x.id}] ${x.regla}`).join('\n') || '(vacía)'}\n\n`
          : `TAREA 1 — ESTILO: no hubo correcciones de Marco sobre el borrador; devolvé listas vacías.\n\nARTÍCULO:\n${final.slice(0, 18000)}\n\n`) +
        'TAREA 2 — LÍNEA TEMÁTICA: ubicá el artículo en una de las líneas existentes o proponé una nueva (nombre corto y amplio, ' +
        'que sirva para varios artículos futuros, p. ej. "Tutela urgente y proceso", "Violencia y familia").\n' +
        `LÍNEAS EXISTENTES:\n${E.map((x) => `[${x.id}] ${x.nombre}${x.descripcion ? ` — ${x.descripcion}` : ''}`).join('\n') || '(ninguna)'}\n\n` +
        'TAREA 3 — MEMORIA: extraé las tesis que el artículo sostiene (1 a 4, una oración cada una) y las preguntas que deja abiertas ' +
        'y podrían ser un artículo siguiente (0 a 3).\n\n' +
        `TÍTULO: ${art.titulo}\n\n` +
        `${FORMATO_JSON}\n{ "reglas_nuevas": [{ "regla": "...", "antes": "ejemplo breve de la IA o vacío", "despues": "cómo lo escribió Marco o vacío" }], ` +
        '"reforzadas": ["id"], "linea": { "id_existente": "id o vacío", "nombre_nuevo": "si no encaja en ninguna", "descripcion": "una oración" }, ' +
        '"tesis": ["..."], "preguntas_abiertas": ["..."] }',
        3500)

      // Estilo
      const nuevas = (Array.isArray(r.reglas_nuevas) ? r.reglas_nuevas : []) as Record<string, unknown>[]
      const filas = nuevas.map((x) => ({ regla: String(x.regla ?? '').trim(), antes: String(x.antes ?? '').trim() || null, despues: String(x.despues ?? '').trim() || null, articulo_id: art.id }))
        .filter((x) => x.regla.length > 8).slice(0, 8)
      if (filas.length) await admin.from('editorial_estilo').insert(filas)
      const ids = new Set(R.map((x) => x.id))
      for (const id of ((Array.isArray(r.reforzadas) ? r.reforzadas : []) as string[]).filter((x) => ids.has(String(x)))) {
        const { data: cur } = await admin.from('editorial_estilo').select('veces').eq('id', id).maybeSingle()
        await admin.from('editorial_estilo').update({ veces: Number((cur as { veces: number } | null)?.veces ?? 1) + 1, updated_at: new Date().toISOString() }).eq('id', id)
      }

      // Línea temática
      const l = (r.linea ?? {}) as Record<string, unknown>
      let ejeId = E.find((x) => x.id === String(l.id_existente ?? ''))?.id ?? null
      if (!ejeId && String(l.nombre_nuevo ?? '').trim()) {
        const nombre = String(l.nombre_nuevo).trim().slice(0, 80)
        const { data: ex } = await admin.from('editorial_ejes').select('id').ilike('nombre', nombre).maybeSingle()
        ejeId = (ex as { id: string } | null)?.id ?? null
        if (!ejeId) {
          const { data: ne } = await admin.from('editorial_ejes').insert({ nombre, descripcion: String(l.descripcion ?? '').slice(0, 300) || null }).select('id').single()
          ejeId = (ne as { id: string } | null)?.id ?? null
        }
      }
      if (ejeId && !art.eje_id) await admin.from('editorial_articulos').update({ eje_id: ejeId }).eq('id', art.id)
      const eje = (art.eje_id as string | null) ?? ejeId

      // Tesis y preguntas abiertas (reemplaza las de una aprobación anterior del mismo artículo)
      await admin.from('editorial_tesis').delete().eq('articulo_id', art.id)
      const t = ((Array.isArray(r.tesis) ? r.tesis : []) as string[]).map((x) => ({ tipo: 'tesis', texto: String(x).trim() }))
      const q = ((Array.isArray(r.preguntas_abiertas) ? r.preguntas_abiertas : []) as string[]).map((x) => ({ tipo: 'pregunta', texto: String(x).trim() }))
      const memo = [...t, ...q].filter((x) => x.texto.length > 10).map((x) => ({ ...x, eje_id: eje, articulo_id: art.id }))
      if (memo.length) await admin.from('editorial_tesis').insert(memo)

      await admin.from('editorial_articulos').update({ aprendido_at: new Date().toISOString() }).eq('id', art.id)
      return json(req, { ok: true, reglas_nuevas: filas.length, eje_id: eje, tesis: t.length, preguntas: q.length })
    }

    // ── depurar: sacar lo no verificable y dejar el artículo coherente ────
    if (modo === 'depurar' && art) {
      const cuerpoActual = String(art.cuerpo ?? '')
      if (!cuerpoActual.trim()) return json(req, { error: 'Todavía no hay borrador' }, 400)
      const evidencia = await bloqueEvidencia(admin, String(art.id))
      const [{ data: normas }, { data: fallos }] = await Promise.all([
        admin.from('normativa_documentos').select('titulo, tipo, numero, fecha').limit(80),
        admin.from('jurisprudencia_documentos').select('caratula, tribunal, fecha').limit(80),
      ])
      const base = [
        ...((normas ?? []) as Record<string, unknown>[]).map((n) => `- Norma: ${n.tipo ?? ''} ${n.numero ?? ''} ${n.titulo} (${n.fecha ?? 's/f'})`),
        ...((fallos ?? []) as Record<string, unknown>[]).map((f) => `- Fallo: ${f.tribunal ?? ''}, "${f.caratula}", ${f.fecha ?? 's/f'}`),
      ].join('\n')
      const citas = ((art.verificacion_citas as { entrada: string; estado: string }[] | null) ?? [])
        .map((c) => `- ${c.entrada}: ${c.estado === 'encontrada' ? 'está en la base' : c.estado === 'no_encontrada' ? 'NO está en la base' : 'sin comprobar'}`).join('\n')

      const { raw, finish } = await llmTexto(admin, userId,
        'MODO DEPURACIÓN DEL ARTÍCULO. Regla principal, por encima de cualquier otra: el error más grave de un artículo jurídico es citar ' +
        'normativa o jurisprudencia que no se puede verificar.\n\n' +
        'Reescribí el artículo completo aplicando estas reglas:\n' +
        '1. Toda norma (ley, decreto, artículo, código) y todo fallo (tribunal, carátula, fecha, número) que NO figure en la evidencia comprobada ' +
        'ni en la base del estudio de abajo se ELIMINA del texto, incluidas sus menciones indirectas ("la jurisprudencia sostiene que…", ' +
        '"la Corte resolvió…"). No lo reemplaces por otra cita que no esté verificada.\n' +
        '2. Al eliminar, reescribí las oraciones vecinas para que el argumento siga siendo coherente: si la idea se sostiene sola, presentala como ' +
        'razonamiento o propuesta propia; si dependía de esa cita, sacala o reformulá la conclusión con la cautela que corresponda.\n' +
        '3. Las normas y fallos que SÍ están en la evidencia comprobada o en la base se mantienen, citados en APA.\n' +
        '4. Resolvé todas las marcas [VERIFICAR: …]: con respaldo comprobado → citá la fuente y quitá la marca; sin respaldo → reformulá como ' +
        'opinión o inferencia, o eliminá. No dejes ninguna marca.\n' +
        '5. No agregues datos, normas ni fallos nuevos. Conservá el estilo, la estructura, el título y la extensión aproximada.\n\n' +
        ((await guiaEstilo(admin)) + '\n\n') +
        (evidencia ? `${evidencia}\n\n` : 'No hay investigación externa cargada.\n\n') +
        `BASE DEL ESTUDIO (normas y fallos verificables):\n${base || '(vacía)'}\n\n` +
        (citas ? `RESULTADO DE LA VERIFICACIÓN DE CITAS:\n${citas}\n\n` : '') +
        `ARTÍCULO ACTUAL:\nTítulo: ${art.titulo}\nBajada: ${art.bajada ?? ''}\n\n${cuerpoActual.slice(0, 40000)}\n\n` +
        'FORMATO DE RESPUESTA (texto plano, sin JSON), exactamente con estos separadores:\n' +
        '===CUERPO===\n(el artículo completo depurado, en markdown)\n' +
        '===CAMBIOS===\n(una línea por cambio: "- ELIMINADO | REFORMULADO | RESPALDADO: qué se cambió — por qué", máximo 25 líneas)\n' +
        '===BIBLIOGRAFIA===\n(una entrada APA por línea, solo de fuentes que quedaron citadas)\n===FIN===',
        14000)
      const parte = (nombre: string) => {
        const m = new RegExp(`===${nombre}===\\s*([\\s\\S]*?)(?====[A-Z]+===|$)`).exec(raw)
        return m ? m[1]!.trim() : ''
      }
      let cuerpo = parte('CUERPO')
      if (cuerpo.length < cuerpoActual.length * 0.4) {
        console.error('[editorial] depurar sin cuerpo', finish, raw.slice(0, 300))
        throw new Error('La IA no devolvió el artículo depurado completo. Probá de nuevo.')
      }
      let cambios = parte('CAMBIOS').split('\n').map((l) => l.replace(/^[-*•]\s*/, '').trim()).filter(Boolean).slice(0, 30)
      let bibliografia = limpiarBibliografia(parte('BIBLIOGRAFIA').split('\n').map((l) => l.replace(/^[-*•]\s*/, '').trim()))
      if (finish === 'length' && !raw.includes('===CAMBIOS===')) {
        // Cortado dentro del cuerpo: se completa
        const c = await continuarArticulo(admin, userId, { id: String(art.id), titulo: String(art.titulo), bajada: (art.bajada as string | null) ?? null }, cuerpo)
        cuerpo = unirCorte(cuerpo, c.continuacion)
        if (!bibliografia.length) bibliografia = c.bibliografia
        cambios = cambios.length ? cambios : ['El texto se depuró; la respuesta se completó en dos partes.']
      }
      try {
        const b = await bibliografiaDesdeTexto(admin, userId, { ...art, cuerpo })
        if (b.length) bibliografia = b
      } catch (err) { console.warn('[editorial] bibliografía tras depurar', err) }
      const version = Number(art.version ?? 0) + 1
      await admin.from('editorial_versiones').insert({ articulo_id: art.id, version, origen: 'ia', modo: 'depuracion', titulo: art.titulo, bajada: art.bajada, cuerpo, autor_id: userId })
      await admin.from('editorial_articulos').update({
        cuerpo, version, ...(bibliografia.length ? { bibliografia } : {}),
        revision_critica: `**Depuración del ${new Date().toLocaleDateString('es-AR')}** (se quitó lo no verificable)\n\n${cambios.map((c) => `- ${c}`).join('\n')}`,
        citas_verificadas_at: null, updated_at: new Date().toISOString(),
      }).eq('id', art.id)
      await avisarFin(admin, userId, String(art.id), String(art.titulo), 'La depuración')
      return json(req, { ok: true, version, version_anterior: Number(art.version ?? 0), cambios })
    }

    // ── continuar un artículo que quedó cortado ────────────────────────────
    if (modo === 'continuar' && art) {
      const cuerpoActual = String(art.cuerpo ?? '')
      if (!cuerpoActual.trim()) return json(req, { error: 'Todavía no hay borrador' }, 400)
      const c = await continuarArticulo(admin, userId, { id: String(art.id), titulo: String(art.titulo), bajada: (art.bajada as string | null) ?? null }, cuerpoActual)
      if (!c.continuacion.trim()) throw new Error('La IA no devolvió la continuación')
      const cuerpo = unirCorte(cuerpoActual, c.continuacion)
      const version = Number(art.version ?? 0) + 1
      await admin.from('editorial_versiones').insert({ articulo_id: art.id, version, origen: 'ia', modo: 'continuacion', titulo: art.titulo, bajada: art.bajada, cuerpo, autor_id: userId })
      await admin.from('editorial_articulos').update({
        cuerpo, version,
        ...(c.bibliografia.length ? { bibliografia: c.bibliografia } : {}),
        ...(c.referencias.length && !(art.referencias as unknown[] | null)?.length ? { referencias: c.referencias } : {}),
        ...(c.a_verificar.length && !(art.a_verificar as unknown[] | null)?.length ? { a_verificar: c.a_verificar } : {}),
        updated_at: new Date().toISOString(),
      }).eq('id', art.id)
      await avisarFin(admin, userId, String(art.id), String(art.titulo), 'El completado del texto')
      return json(req, { ok: true, version })
    }

    // ── revisar ────────────────────────────────────────────────────────────
    if (modo === 'revisar' && art) {
      if (!String(art.cuerpo ?? '').trim()) return json(req, { error: 'Todavía no hay borrador para revisar' }, 400)
      const r = await llm(admin, userId,
        'MODO REVISIÓN CRÍTICA.\n\n' +
        `BORRADOR:\nTítulo: ${art.titulo}\nBajada: ${art.bajada ?? ''}\n\n${String(art.cuerpo).slice(0, 30000)}\n\n` +
        'Identificá problemas de precisión jurídica, coherencia argumentativa, razonamiento circular, afirmaciones sin sustento, posibles ' +
        'objeciones, riesgos de confidencialidad y mejoras de claridad. Sé concreto: citá el pasaje y proponé cómo corregirlo. No reescribas el artículo.\n\n' +
        `${FORMATO_JSON}\n{ "revision_markdown": "..." }`,
        4000)
      const revision = String(r.revision_markdown ?? '')
      await admin.from('editorial_articulos').update({ revision_critica: revision, updated_at: new Date().toISOString() }).eq('id', art.id)
      return json(req, { ok: true })
    }

    // ── adaptar ────────────────────────────────────────────────────────────
    if (modo === 'adaptar' && art) {
      if (!['aprobado', 'publicado'].includes(String(art.estado))) {
        return json(req, { error: 'Solo se adaptan artículos aprobados' }, 400)
      }
      const formato = String(body.formato ?? '')
      const guia: Record<string, string> = {
        linkedin: 'una publicación de LinkedIn (hasta 1.300 caracteres, primera línea que enganche, sin hashtags de relleno; como mucho 3 hashtags al final)',
        redes: 'una versión breve para Instagram/Facebook (hasta 600 caracteres, tono cercano)',
        boletin: 'una pieza para boletín o newsletter (300-500 palabras, con un cierre que invite a leer el artículo completo)',
      }
      if (!guia[formato]) return json(req, { error: 'Formato inválido' }, 400)
      const r = await llm(admin, userId,
        `MODO ADAPTACIÓN a ${guia[formato]}.\n\nARTÍCULO APROBADO:\nTítulo: ${art.titulo}\nBajada: ${art.bajada ?? ''}\n\n${String(art.cuerpo).slice(0, 30000)}\n\n` +
        'No alteres sus conclusiones ni agregues afirmaciones nuevas.\n\n' +
        `${FORMATO_JSON}\n{ "texto": "..." }`,
        2000)
      const adaptaciones = { ...(art.adaptaciones as Record<string, unknown> ?? {}), [formato]: String(r.texto ?? '') }
      await admin.from('editorial_articulos').update({ adaptaciones, updated_at: new Date().toISOString() }).eq('id', art.id)
      return json(req, { ok: true, texto: adaptaciones[formato] })
    }

    // ── refinar un fragmento (Marco elige el pasaje y da la instrucción) ───
    if (modo === 'refinar' && art) {
      const fragmento = typeof body.fragmento === 'string' ? body.fragmento.slice(0, 8000) : ''
      const instruccion = typeof body.instruccion === 'string' ? body.instruccion.slice(0, 2000) : ''
      const contexto = typeof body.contexto === 'string' ? body.contexto.slice(0, 30000) : String(art.cuerpo ?? '')
      if (!fragmento.trim() || !instruccion.trim()) return json(req, { error: 'Falta el fragmento o la instrucción' }, 400)
      const r = await llm(admin, userId,
        'MODO EDICIÓN DE FRAGMENTO.\n\n' + ((await guiaEstilo(admin)) + '\n\n') +
        `ARTÍCULO COMPLETO (solo de contexto, no lo reescribas):\nTítulo: ${art.titulo}\n\n${contexto}\n\n` +
        `FRAGMENTO A MODIFICAR:\n<<<\n${fragmento}\n>>>\n\nINSTRUCCIÓN DE MARCO:\n${instruccion}\n\n` +
        'Devolvé solo el fragmento reescrito según la instrucción, en el mismo formato markdown, para reemplazarlo tal cual en el texto. ' +
        `Mantené el registro del resto del artículo. Lo que no puedas respaldar, marcalo [VERIFICAR: …]. ${NORMAS_APA}\n\n` +
        `${FORMATO_JSON}\n{ "texto": "..." }`,
        3000)
      const texto = String(r.texto ?? '').trim()
      if (!texto) throw new Error('La IA no devolvió el fragmento')
      return json(req, { ok: true, texto })
    }

    // ── bibliografía APA (no toca el cuerpo: solo arma la lista final) ─────
    if (modo === 'apa' && art) {
      if (!String(art.cuerpo ?? '').trim()) return json(req, { error: 'Todavía no hay texto' }, 400)
      const r = { bibliografia: await bibliografiaDesdeTexto(admin, userId, art) }
      const bibliografia = limpiarBibliografia(r.bibliografia)
      if (!bibliografia.length) throw new Error('La IA no devolvió entradas de bibliografía')
      await admin.from('editorial_articulos').update({ bibliografia, updated_at: new Date().toISOString() }).eq('id', art.id)
      return json(req, { ok: true, bibliografia })
    }

    // ── pedir aprobación a Marco (colaborador sin permiso de aprobar) ──────
    if (modo === 'pedir_aprobacion' && art) {
      const { data: autor } = await admin.from('profiles').select('nombre, apellido').eq('id', userId).maybeSingle()
      const quien = autor ? `${(autor as { nombre: string }).nombre} ${(autor as { apellido: string | null }).apellido ?? ''}`.trim() : 'Un colaborador'
      const nota = typeof body.nota === 'string' ? body.nota.slice(0, 500).trim() : ''
      await admin.from('editorial_articulos').update({ aprobacion_pedida_at: new Date().toISOString(), devuelto_at: null }).eq('id', art.id)
      await telegramMarco(`Editorial: ${quien} te pide que revises y apruebes un artículo.\n\n` +
        `"${art.titulo}"${nota ? `\n\n${nota}` : ''}\n\n${APP_URL}/editorial/${art.id}`)
      return json(req, { ok: true })
    }

    // ── devolver con observaciones (solo quien aprueba) ────────────────────
    if (modo === 'devolver' && art) {
      const { data: yo } = await admin.from('profiles').select('nombre, editorial_aprueba').eq('id', userId).maybeSingle()
      if (!(yo as { editorial_aprueba?: boolean } | null)?.editorial_aprueba) return json(req, { error: 'Solo Marco devuelve artículos' }, 403)
      const obs = typeof body.observaciones === 'string' ? body.observaciones.slice(0, 6000).trim() : ''
      if (!obs) return json(req, { error: 'Escribí las observaciones' }, 400)
      await admin.from('editorial_articulos').update({
        observaciones: obs, devuelto_at: new Date().toISOString(), aprobacion_pedida_at: null,
        estado: ['aprobado', 'publicado'].includes(String(art.estado)) ? String(art.estado) : 'borrador',
        updated_at: new Date().toISOString(),
      }).eq('id', art.id)
      const quien = responsable(art)
      const avisado = quien && quien !== userId
        ? await avisarPersona(admin, quien, `Editorial: Marco te devolvió "${art.titulo}" con observaciones.\n\n${obs.slice(0, 1500)}`, `${APP_URL}/editorial/${art.id}`)
        : false
      return json(req, { ok: true, avisado })
    }

    // ── verificar citas contra la base de normativa y jurisprudencia ───────
    if (modo === 'verificar_citas' && art) {
      const entradas = [
        ...((art.bibliografia as string[] | null) ?? []),
        ...(((art.referencias as { cita?: string }[] | null) ?? []).map((r) => r.cita ?? '')),
      ].map((e) => String(e).trim()).filter(Boolean)
      // Citas en el texto que no estén en la bibliografía (Ley N, Decreto N, fallos entre comillas)
      const enTexto = [...String(art.cuerpo ?? '').matchAll(/\b(Ley|Decreto|Resoluci[oó]n|Acordada)\s+(?:N[°º.]?\s*)?[\d.\/]+/gi)].map((m) => m[0])
      const todas = [...new Set([...entradas, ...enTexto])].slice(0, 40)
      if (!todas.length) return json(req, { error: 'El artículo no tiene citas para verificar' }, 400)

      const r = await llm(admin, userId,
        'MODO EXTRACCIÓN DE CITAS. Para cada cita, identificá qué fuente es. No evalúes si es correcta: solo clasificala.\n\n' +
        `CITAS:\n${todas.map((c, i) => `${i}. ${c}`).join('\n')}\n\n` +
        `${FORMATO_JSON}\n{ "citas": [{ "i": 0, "tipo": "norma|fallo|doctrina|otro", "numero": "número de la norma, solo dígitos y puntos, o vacío", ` +
        '"nombre": "nombre corto de la norma, carátula del fallo o título de la obra", "tribunal": "si es un fallo", "articulos": ["artículos citados, si hay"] }] }',
        2500)
      const soloDigitos = (t: string | null | undefined) => String(t ?? '').replace(/\D/g, '')
      const [{ data: normas }, { data: fallos }] = await Promise.all([
        admin.from('normativa_documentos').select('id, titulo, tipo, numero, fecha, source_url'),
        admin.from('jurisprudencia_documentos').select('id, caratula, tribunal, fecha, source_url'),
      ])
      const { data: hsOk } = await admin.from('editorial_hallazgos').select('fuente, numero, url, tipo').eq('articulo_id', art.id).eq('estado', 'comprobado')
      const { data: bib } = await admin.from('editorial_evidencia').select('fuente, numero, url, tipo').limit(800)
      const H = [...((hsOk ?? []) as { fuente: string | null; numero: string | null; url: string | null; tipo: string }[]),
        ...((bib ?? []) as { fuente: string | null; numero: string | null; url: string | null; tipo: string }[])]
      const N = (normas ?? []) as { id: string; titulo: string; tipo: string | null; numero: string | null; fecha: string | null; source_url: string | null }[]
      const F = (fallos ?? []) as { id: string; caratula: string; tribunal: string | null; fecha: string | null; source_url: string | null }[]
      const palabras = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 3)

      const resultado = []
      for (const c of (Array.isArray(r.citas) ? r.citas : []) as Record<string, unknown>[]) {
        const entrada = todas[Number(c.i)]
        if (!entrada) continue
        const tipo = String(c.tipo ?? 'otro')
        let estado: 'encontrada' | 'no_encontrada' | 'manual' = 'manual'
        let documento: { titulo: string; url: string | null } | null = null
        let nota = ''
        // Primero: ¿está en la evidencia comprobada de la investigación externa?
        const numC = soloDigitos(String(c.numero ?? ''))
        const clavesC = palabras(String(c.nombre ?? entrada))
        const enEvidencia = H.find((h) => (numC.length >= 3 && (soloDigitos(h.numero) === numC || soloDigitos(h.fuente).includes(numC))) ||
          (tipo === 'fallo' && clavesC.filter((w) => new Set(palabras(h.fuente ?? '')).has(w)).length >= 2))
        if (enEvidencia && (tipo === 'norma' || tipo === 'fallo')) {
          resultado.push({ entrada, tipo, estado: 'encontrada' as const, documento: { titulo: `${enEvidencia.fuente ?? 'Fuente'} (investigación comprobada)`, url: enEvidencia.url }, nota: '' })
          continue
        }
        if (tipo === 'norma') {
          const num = soloDigitos(String(c.numero ?? ''))
          const hit = num.length >= 3 ? N.find((n) => soloDigitos(n.numero) === num || soloDigitos(n.titulo).includes(num)) : undefined
          if (hit) {
            estado = 'encontrada'; documento = { titulo: `${hit.tipo ?? ''} ${hit.numero ?? ''} ${hit.titulo}`.trim(), url: hit.source_url }
            const arts = (Array.isArray(c.articulos) ? c.articulos : []) as string[]
            if (arts.length) {
              const faltan: string[] = []
              for (const a of arts.slice(0, 6)) {
                const n = soloDigitos(a)
                if (!n) continue
                const { count } = await admin.from('normativa_chunks').select('id', { count: 'exact', head: true })
                  .eq('documento_id', hit.id).or(`contenido.ilike.%art. ${n}%,contenido.ilike.%artículo ${n}%,contenido.ilike.%articulo ${n}%`)
                if (!count) faltan.push(a)
              }
              if (faltan.length) nota = `No se ubicó en el texto cargado: ${faltan.join(', ')}`
            }
          } else { estado = 'no_encontrada'; nota = 'La norma no está cargada en la base de normativa' }
        } else if (tipo === 'fallo') {
          const claves = palabras(String(c.nombre ?? entrada))
          let mejor: { f: typeof F[number]; score: number } | null = null
          for (const f of F) {
            const pf = new Set(palabras(f.caratula))
            const score = claves.filter((w) => pf.has(w)).length
            if (score >= 2 && (!mejor || score > mejor.score)) mejor = { f, score }
          }
          if (mejor) { estado = 'encontrada'; documento = { titulo: `${mejor.f.tribunal ?? ''} "${mejor.f.caratula}" ${mejor.f.fecha ?? ''}`.trim(), url: mejor.f.source_url } }
          else { estado = 'no_encontrada'; nota = 'El fallo no está en la base de jurisprudencia' }
        } else {
          nota = tipo === 'doctrina' ? 'Doctrina: verificar en la obra' : 'Verificar manualmente'
        }
        resultado.push({ entrada, tipo, estado, documento, nota })
      }
      await admin.from('editorial_articulos').update({
        verificacion_citas: resultado, citas_verificadas_at: new Date().toISOString(),
      }).eq('id', art.id)
      return json(req, { ok: true, verificacion: resultado })
    }

    // ── chequeo de confidencialidad (sin IA) ───────────────────────────────
    if (modo === 'chequeo' && art) {
      const alertas = chequearConfidencialidad(`${art.titulo}\n${art.bajada ?? ''}\n${art.cuerpo}`,
        await nombresSensibles(admin, (art.propuesta?.expediente_id as string) ?? null))
      await admin.from('editorial_articulos').update({ alertas_confidencialidad: alertas }).eq('id', art.id)
      return json(req, { ok: true, alertas })
    }

    return json(req, { error: 'Modo inválido' }, 400)
  } catch (err) {
    console.error('[editorial-ia]', err)
    return json(req, { error: err instanceof Error ? err.message : 'error interno' }, 500)
  }
})

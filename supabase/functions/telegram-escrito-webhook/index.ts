// Webhook de Telegram para GENERAR ESCRITOS desde el celular (bot nuevo,
// separado del de contenidos). Marco manda una nota de voz o texto diciendo el
// expediente (por actor/demandado o número) y la idea del escrito. El bot
// resuelve el expediente, llama a escritos-generate (mismo motor que la app) en
// nombre del DIRECTOR, y responde con un link a la solapa Escritos.
//
// Seguridad (verify_jwt=false):
//   1. Header X-Telegram-Bot-Api-Secret-Token == TELEGRAM_ESCRITO_WEBHOOK_SECRET
//   2. from.id ∈ TELEGRAM_ALLOWED_USER_IDS
//
// Secrets: TELEGRAM_ESCRITO_BOT_TOKEN, TELEGRAM_ESCRITO_WEBHOOK_SECRET,
//          TELEGRAM_ALLOWED_USER_IDS, (GROQ|OPENAI para transcripción)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { transcribeAudio } from '../_shared/guion-reel-core.ts'
import {
  type Admin, APP_URL, PRIO_LABEL, completarTarea, formatLista, hoyAR, listarPendientes, nombreCorto,
  parseFecha, parsePrioridad, tgAnswerCallback, tgSendKb, vencimientoLabel,
} from '../_shared/tareas-telegram.ts'
import { redactarPropuesta } from '../_shared/procuracion-redactar.ts'
import {
  type Cambio, type Contenido, abogadoDe, aplicarCambios, configurarMenu, conAccion, nombreArchivo, pdfEscrito, pendientes,
  resolverRevision, resumenEscrito, tgAccion, tgDocumento,
} from '../_shared/escrito-bot.ts'

const TG_API = 'https://api.telegram.org'

interface TgUpdate {
  message?: {
    chat: { id: number }
    from?: { id: number }
    text?: string
    caption?: string
    voice?: { file_id: string }
    audio?: { file_id: string }
  }
  callback_query?: {
    id: string
    from: { id: number }
    data?: string
    message?: { chat: { id: number } }
  }
}

interface Exp { id: string; numero: string | null; numero_sae: string | null; caratula: string | null }

// Estado de la sesión conversacional por chat_id.
// pending: se llena cuando el bot pregunta el tipo al usuario (texto corto sin tipo detectado).
interface TelegramSession {
  chat_id: number
  expediente_id: string | null
  last_escrito_id: string | null
  last_tipo: string | null
  pending: TelegramPending | null
  updated_at: string
}

type TelegramPending = {
  step: 'await_tipo'
  expediente_id: string
  caratula: string | null
  idea_limpia: string
  responde_a?: string | null
} | {
  // Varios expedientes posibles: se eligió con botones
  step: 'await_exp'
  idea: string
  responde_a?: string | null
} | {
  // Revisión: "Devolver con observaciones"; el próximo mensaje son las observaciones
  step: 'await_obs'
  escrito_id: string
  titulo: string
} | {
  // "Pedir cambios": el próximo mensaje (texto o audio) es la instrucción
  step: 'await_cambios'
  escrito_id: string
  titulo: string
} | {
  // Editorial: Marco tocó "Devolver" y el próximo mensaje (texto o audio) son las observaciones
  step: 'ed_devolver'
  articulo_id: string
  titulo: string
}

async function tgSend(token: string, chatId: number, text: string) {
  await fetch(`${TG_API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  }).catch(() => {})
}

async function tgDownload(token: string, fileId: string): Promise<{ data: ArrayBuffer; mime: string }> {
  const r = await fetch(`${TG_API}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`)
  const j = await r.json() as { ok: boolean; result?: { file_path?: string } }
  if (!j.ok || !j.result?.file_path) throw new Error('No se pudo obtener el archivo de Telegram')
  const fileRes = await fetch(`${TG_API}/file/bot${token}/${j.result.file_path}`)
  if (!fileRes.ok) throw new Error(`No se pudo bajar el audio (${fileRes.status})`)
  const p = j.result.file_path.toLowerCase()
  const mime = p.endsWith('.oga') || p.endsWith('.ogg') ? 'audio/ogg'
    : p.endsWith('.m4a') || p.endsWith('.mp4') ? 'audio/mp4'
    : p.endsWith('.mp3') || p.endsWith('.mpeg') ? 'audio/mpeg' : 'audio/ogg'
  return { data: await fileRes.arrayBuffer(), mime }
}

const STOPWORDS = new Set([
  'expediente','escrito','presenta','presentar','adjunto','adjunta','adjuntamos','bono','movilidad',
  'cedula','cédula','para','sobre','contra','demanda','contestacion','contestación','que','del','los',
  'las','una','este','esta','como','pedi','pedí','solicito','solicitar','favor','porfa','decile','decir',
  'oficio','libre','libramiento','notificar','domicilio','pone','poner','hace','hacer','tramite','trámite',
])

function palabrasSignificativas(texto: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const w of texto.toLowerCase().match(/[a-záéíóúñ]{4,}/gi) ?? []) {
    const lw = w.toLowerCase()
    if (STOPWORDS.has(lw) || seen.has(lw)) continue
    seen.add(lw); out.push(w)
    if (out.length >= 6) break
  }
  return out
}

// Resuelve el expediente por número (687/22, dígitos) o por palabras de la
// carátula (actor/demandado), rankeando por cantidad de coincidencias.
async function resolverExpediente(admin: Admin, texto: string): Promise<{ unico?: Exp; candidatos: Exp[] }> {
  const sel = 'id, numero, numero_sae, caratula'

  // 1) Por número
  const nums = texto.match(/\d{1,6}\s*\/\s*\d{2,4}|\b\d{4,}\b/g) ?? []
  const porNumero = new Map<string, Exp>()
  for (const n of nums) {
    const clean = n.replace(/\s+/g, '')
    const { data } = await admin.from('expedientes').select(sel).is('deleted_at', null)
      .or(`numero.ilike.%${clean}%,numero_sae.ilike.%${clean}%`).limit(10)
    for (const e of (data ?? []) as Exp[]) porNumero.set(e.id, e)
  }
  if (porNumero.size === 1) return { unico: [...porNumero.values()][0], candidatos: [] }
  if (porNumero.size > 1) return { candidatos: [...porNumero.values()] }

  // 2) Por carátula (palabras significativas), rankeado por hits
  const scored = new Map<string, { e: Exp; hits: number }>()
  for (const w of palabrasSignificativas(texto)) {
    const { data } = await admin.from('expedientes').select(sel).is('deleted_at', null)
      .ilike('caratula', `%${w}%`).limit(20)
    for (const e of (data ?? []) as Exp[]) {
      const cur = scored.get(e.id) ?? { e, hits: 0 }
      cur.hits++; scored.set(e.id, cur)
    }
  }
  if (scored.size === 0) return { candidatos: [] }
  const maxHits = Math.max(...[...scored.values()].map(s => s.hits))
  const top = [...scored.values()].filter(s => s.hits === maxHits).map(s => s.e)
  if (top.length === 1) return { unico: top[0], candidatos: [] }
  return { candidatos: top.slice(0, 6) }
}

function listaExpes(cands: Exp[]): string {
  return cands.map(e => `• ${e.numero_sae ?? e.numero ?? 's/n'} — ${(e.caratula ?? 's/carátula').slice(0, 70)}`).join('\n')
}

// Extrae el tipo de escrito desde el texto del abogado usando keywords.
// Si lo detecta, se manda como `tipo` explícito (más confiable que dejar
// que la IA infiera). El texto completo va como `instrucciones`.
// NOTA: sin normalize/NFD — se usan alternativas [oó], [aá] para cubrir
// tanto texto con tilde como transcripciones sin tilde de notas de voz.
function inferirTipoEscrito(texto: string): string | null {
  const t = texto.toLowerCase()
  // Embargo preventivo — detecta "embargo preventivo", "embargo de/por honorarios"
  if (/embargo\s+preventivo/.test(t)) return 'Embargo preventivo'
  if (/embargo\s+(de|por)\s+honorarios/.test(t)) return 'Embargo preventivo'
  if (/embargo\s+(preventibo|pribentivo|pribentibo)/.test(t)) return 'Embargo preventivo'
  if (/levantamiento\s+de\s+embargo/.test(t)) return 'Levantamiento de embargo'
  if (/recurso\s+de\s+apelaci[oó]n/.test(t)) return 'Recurso de apelación'
  if (/recurso\s+de\s+(reposici[oó]n|revocatoria)/.test(t)) return 'Recurso de reposición'
  if (/regulaci[oó]n\s+de\s+honorarios|regular\s+honorarios/.test(t)) return 'Regulación de honorarios'
  if (/contestaci[oó]n\s+de\s+traslado|contest[ao]r?\s+(?:el\s+)?traslado/.test(t)) return 'Contestación de traslado'
  if (/apertura\s+a\s+prueba|abrir\s+a\s+prueba/.test(t)) return 'Apertura a prueba'
  if (/ofrecimiento\s+de\s+prueba|ofrec[eo]\s+prueba/.test(t)) return 'Ofrecimiento de prueba'
  if (/beneficio\s+de\s+litigar\s+sin\s+gastos/.test(t)) return 'Beneficio de litigar sin gastos'
  if (/desistimiento/.test(t)) return 'Desistimiento'
  if (/caducidad\s+de\s+instancia|perenci[oó]n/.test(t)) return 'Caducidad de instancia'
  if (/prescripci[oó]n/.test(t)) return 'Excepción de prescripción'
  if (/opone\s+excepci[oó]n|excepciones\s+previas/.test(t)) return 'Oposición de excepciones'
  if (/nulidad/.test(t)) return 'Planteo de nulidad'
  if (/ampliaci[oó]n\s+de\s+demanda/.test(t)) return 'Ampliación de demanda'
  if (/pronto\s+despacho/.test(t)) return 'Pronto despacho'
  return null
}

// ── Editorial: llamadas internas a editorial-ia (mismo secreto que los crons) ──
async function llamarEditorial(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/editorial-ia`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': Deno.env.get('CRON_SECRET') ?? '' },
    body: JSON.stringify(body),
  })
  const out = await res.json().catch(() => ({})) as Record<string, unknown>
  if (!res.ok || out.error) throw new Error(String(out.error ?? `editorial-ia ${res.status}`))
  return out
}

const IDEA_ARTICULO_RE = /^\s*(?:\/art[ií]culo\b|idea\s+para\s+(?:un\s+)?art[ií]culo\b|art[ií]culo\s*[:,.-])\s*/i

async function proponerArticulo(admin: Admin, token: string, chatId: number, idea: string, perfilId?: string) {
  if (idea.trim().length < 15) {
    await tgSend(token, chatId, 'Contame la idea del artículo: /articulo seguido del tema, o una nota de voz que empiece con "Artículo…".')
    return
  }
  await tgSend(token, chatId, '📝 Armando la propuesta editorial…')
  const r = await llamarEditorial({ modo: 'propuesta_idea', texto: idea, ...(perfilId ? { perfil_id: perfilId } : {}) })
  const p = r.propuesta as { id: string; titulo: string; pregunta: string | null }
  await tgSendKb(token, chatId, `Propuesta creada: "${p.titulo}"${p.pregunta ? `\n\n${p.pregunta}` : ''}\n\nNo se investigó ni se redactó nada todavía.`,
    [[{ text: 'Abrir en Editorial', url: `${APP_URL}/editorial` }]])
  return p
}

// Helpers de sesión conversacional
async function loadSession(admin: Admin, chatId: number): Promise<TelegramSession | null> {
  const { data } = await admin
    .from('telegram_escrito_sessions')
    .select('*')
    .eq('chat_id', chatId)
    .maybeSingle()
  return data as TelegramSession | null
}

async function saveSession(admin: Admin, s: Partial<TelegramSession> & { chat_id: number }) {
  try {
    await admin.from('telegram_escrito_sessions').upsert({
      ...s,
      updated_at: new Date().toISOString(),
    })
  } catch (e) {
    console.warn('[telegram-escrito] session save error', e)
  }
}

// La sesión pending expira a los 30 minutos para no confundir mensajes viejos
function isPendingValid(session: TelegramSession | null): session is TelegramSession & { pending: TelegramPending } {
  if (!session?.pending || !session.updated_at) return false
  return Date.now() - new Date(session.updated_at).getTime() < 30 * 60 * 1000
}

// Palabras clave de "reintentá" — sin número de expediente en el texto
const REINTENTAR_RE = /\b(reintent[aá]|de\s+nuevo|regenera[rl]?|hacé?\s+otro|volvé?\s+a\s+hacer|repetí?)\b/i

// ── GESTIÓN: comandos /tareas /tarea /audiencias /sae /ayuda ──────────────

const PRIO_ORDER: Record<string, number> = { URGENTE: 3, ALTA: 2, MEDIA: 1, BAJA: 0 }
const PRIO_BADGE: Record<string, string> = { URGENTE: '🔴 Urgente', ALTA: '🟠 Alta', MEDIA: '🟡 Media', BAJA: '⚪ Baja' }

const AYUDA_TAREA =
  'Usá: /tarea [qué hacer] para [nombre] [para el viernes | mañana | 15/10] [urgente|alta|media|baja]\n\n' +
  'Ej: /tarea demanda laboral Medina Vives Luciana para Claudio para el viernes alta\n\n' +
  'Podés cargar varias, una por línea:\n' +
  '/tarea demanda laboral Medina Vives Luciana para Claudio alta\n' +
  'demanda laboral Moreno Paula para el lunes\n\n' +
  'Si una línea no dice "para [nombre]", va al último nombrado. ' +
  'El expediente (o la consulta) se vincula solo si el nombre del cliente está en el texto.'

type PerfilBot = { id: string; nombre: string | null; apellido: string | null; telegram_chat_id: number | null }

async function findPerfilByNombre(
  admin: Admin,
  nombre: string,
): Promise<PerfilBot[]> {
  const q = nombre.trim().replace(/[,()%*]/g, '')
  if (!q) return []
  const { data } = await admin.from('profiles')
    .select('id, nombre, apellido, telegram_chat_id')
    .or(`nombre.ilike.%${q}%,apellido.ilike.%${q}%,nombre_completo.ilike.%${q}%`)
    .eq('activo', true)
    .limit(5)
  return (data ?? []) as PerfilBot[]
}

// ── Parser de /tarea: fecha, prioridad y asignado dentro de una línea ───────

async function parseLineaTarea(
  admin: Admin,
  linea: string,
): Promise<{ titulo: string; prioridad: string; fecha: string | null; asignado: PerfilBot | null } | { error: string }> {
  let resto = linea
  const f = parseFecha(resto, hoyAR()); resto = f.resto
  let p = parsePrioridad(resto); resto = p.resto

  // "para X" / "para X Y": se prueba cada aparición hasta encontrar un perfil.
  let asignado: PerfilBot | null = null
  const paraRe = /\bpara\s+([a-záéíóúñ]{2,})(?:\s+([a-záéíóúñ]{2,}))?/gi
  const matches = [...resto.matchAll(paraRe)].reverse()
  for (const m of matches) {
    // Primero "para Nombre Apellido", después solo "para Nombre".
    const conApellido = m[0]
    const soloNombre = /^para\s+\S+/i.exec(m[0])![0]
    const candidatos: [string, string][] = m[2] ? [[`${m[1]} ${m[2]}`, conApellido], [m[1], soloNombre]] : [[m[1], soloNombre]]
    for (const [nombre, fragmento] of candidatos) {
      const perfiles = await findPerfilByNombre(admin, nombre)
      if (perfiles.length > 1) {
        return { error: `Hay varios "${nombre}": ${perfiles.map(nombreCorto).join(', ')}. Usá el apellido.` }
      }
      if (perfiles.length === 1) {
        asignado = perfiles[0]
        resto = (resto.slice(0, m.index!) + ' ' + resto.slice(m.index! + fragmento.length)).replace(/\s{2,}/g, ' ').trim()
        break
      }
    }
    if (asignado) break
  }

  // La prioridad puede venir después del nombre ("para Claudio alta").
  if (!p.prioridad) { p = parsePrioridad(resto); resto = p.resto }

  const titulo = resto.replace(/^[,.\s]+|[,.\s]+$/g, '').trim()
  if (!titulo) return { error: 'Falta qué hay que hacer.' }
  const tituloFinal = titulo.charAt(0).toUpperCase() + titulo.slice(1)
  return { titulo: tituloFinal, prioridad: p.prioridad ?? 'MEDIA', fecha: f.fecha, asignado }
}

// Palabras del título de una tarea que no identifican al cliente.
const STOP_TAREA = new Set([
  'laboral', 'civil', 'familia', 'previsional', 'redactar', 'preparar', 'armar', 'revisar', 'llamar',
  'enviar', 'mandar', 'presentar', 'hacer', 'cobro', 'pesos', 'despido', 'indemnizacion', 'indemnización',
  'reclamo', 'carta', 'documento', 'telegrama', 'urgente', 'cliente', 'clienta', 'audiencia',
])

/**
 * Busca el expediente (por carátula) o la consulta (por nombre/apellido)
 * mencionado en el título. Solo vincula si hay un único candidato claro:
 * al menos 2 palabras coincidentes (nombre + apellido), o 1 si el título
 * tiene una sola palabra significativa.
 */
async function buscarAsunto(
  admin: Admin,
  titulo: string,
): Promise<{ tipo: 'expediente' | 'consulta'; id: string; label: string } | null> {
  const palabras = palabrasSignificativas(titulo).filter(w => !STOP_TAREA.has(w.toLowerCase()))
  if (palabras.length === 0) return null
  const minHits = palabras.length === 1 ? 1 : 2

  function mejor<T>(scored: Map<string, { e: T; hits: number }>): T | null {
    if (scored.size === 0) return null
    const max = Math.max(...[...scored.values()].map(s => s.hits))
    const top = [...scored.values()].filter(s => s.hits === max)
    return max >= minHits && top.length === 1 ? top[0].e : null
  }

  const exps = new Map<string, { e: Exp; hits: number }>()
  for (const w of palabras) {
    const { data } = await admin.from('expedientes').select('id, numero, numero_sae, caratula')
      .is('deleted_at', null).ilike('caratula', `%${w}%`).limit(20)
    for (const e of (data ?? []) as Exp[]) {
      const cur = exps.get(e.id) ?? { e, hits: 0 }
      cur.hits++; exps.set(e.id, cur)
    }
  }
  const exp = mejor(exps)
  if (exp) return { tipo: 'expediente', id: exp.id, label: `Expediente: ${(exp.caratula ?? exp.numero_sae ?? exp.numero ?? '').slice(0, 70)}` }

  type Cons = { id: string; nombre: string | null; apellido: string | null }
  const cons = new Map<string, { e: Cons; hits: number }>()
  for (const w of palabras) {
    const { data } = await admin.from('consultas').select('id, nombre, apellido')
      .or(`nombre.ilike.%${w}%,apellido.ilike.%${w}%`)
      .not('estado', 'in', '(descartada,convertida)')
      .limit(20)
    for (const c of (data ?? []) as Cons[]) {
      const cur = cons.get(c.id) ?? { e: c, hits: 0 }
      cur.hits++; cons.set(c.id, cur)
    }
  }
  const c = mejor(cons)
  if (c) return { tipo: 'consulta', id: c.id, label: `Consulta: ${`${c.apellido ?? ''} ${c.nombre ?? ''}`.trim()}` }
  return null
}

/** /hecho N sobre la lista de pendientes de `profileId`. */
async function responderHecho(
  admin: Admin,
  token: string,
  chatId: number,
  profileId: string,
  args: string,
  esDirector: boolean,
) {
  const n = Number(args.trim().match(/^\d+/)?.[0])
  const tareas = await listarPendientes(admin, profileId)
  if (!n || n < 1 || n > tareas.length) {
    const { text, keyboard } = formatLista(tareas, 'Decime el número de la tarea, ej. /hecho 1. Tus pendientes:')
    await tgSendKb(token, chatId, text, keyboard)
    return
  }
  const res = await completarTarea(admin, tareas[n - 1].id, profileId, esDirector)
  await tgSend(token, chatId, res.ok ? `Listo, marcada como hecha: "${res.titulo}".` : res.error)
}

/**
 * Bot para colaboradores con Telegram vinculado (no están en la allowlist):
 * solo ven y cierran sus propias tareas. No generan escritos ni ven datos del estudio.
 */
async function handleColaborador(
  admin: Admin,
  token: string,
  chatId: number,
  perfil: PerfilBot,
  texto: string,
) {
  const t = texto.trim()
  const hecho = /^\/?(?:hecho|listo|terminada?)\s*(.*)$/i.exec(t)
  if (hecho) {
    await responderHecho(admin, token, chatId, perfil.id, hecho[1], false)
    return
  }
  if (IDEA_ARTICULO_RE.test(t)) {
    const { data: acc } = await admin.from('profiles').select('acceso_editorial').eq('id', perfil.id).maybeSingle()
    if ((acc as { acceso_editorial?: boolean } | null)?.acceso_editorial) {
      const p = await proponerArticulo(admin, token, chatId, t.replace(IDEA_ARTICULO_RE, ''), perfil.id)
      const marco = Number(Deno.env.get('TELEGRAM_MARCO_CHAT_ID') ?? '') || null
      if (p && marco) await tgSend(token, marco, `Editorial: ${perfil.nombre ?? 'Un colaborador'} propuso un tema: "${p.titulo}".`)
      return
    }
  }
  if (/^\/(ayuda|help)\b/i.test(t)) {
    await tgSend(token, chatId,
      'Acá te aviso cuando tengas una tarea nueva y cada mañana te mando tus pendientes.\n\n' +
      '/articulo + tu idea — proponer un tema para Editorial\n' +
      '/tareas — ver tus pendientes\n' +
      '/hecho N — marcar como hecha la tarea N de la lista\n\n' +
      `También las ves en ${APP_URL}/inicio`)
    return
  }
  const tareas = await listarPendientes(admin, perfil.id)
  const { text, keyboard } = formatLista(tareas, `Tus tareas pendientes (${tareas.length}):`)
  await tgSendKb(token, chatId, text, keyboard)
}

/** "/start <código>": vincula este chat con el perfil que generó el código en la app. */
async function vincularChat(
  admin: Admin,
  token: string,
  chatId: number,
  code: string,
): Promise<boolean> {
  const { data } = await admin.from('telegram_link_codes')
    .select('profile_id, expires_at')
    .eq('code', code)
    .maybeSingle()
  const row = data as { profile_id: string; expires_at: string } | null
  if (!row) return false
  await admin.from('telegram_link_codes').delete().eq('code', code)
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await tgSend(token, chatId, 'El enlace venció. Generá uno nuevo desde la app (Inicio → Vincular Telegram).')
    return true
  }
  // El chat queda vinculado a un solo perfil.
  await admin.from('profiles').update({ telegram_chat_id: null }).eq('telegram_chat_id', chatId)
  const { error } = await admin.from('profiles').update({ telegram_chat_id: chatId }).eq('id', row.profile_id)
  if (error) {
    await tgSend(token, chatId, `No pude vincular la cuenta: ${error.message}`)
    return true
  }
  const { data: p } = await admin.from('profiles').select('nombre').eq('id', row.profile_id).maybeSingle()
  const nombre = (p as { nombre?: string | null } | null)?.nombre
  const tareas = await listarPendientes(admin, row.profile_id)
  const { text, keyboard } = formatLista(tareas, `Listo${nombre ? `, ${nombre}` : ''}. Tu cuenta quedó vinculada.\n\nDesde ahora te aviso acá cuando tengas una tarea nueva, y cada mañana (lun a vie, 6 hs) te mando tus pendientes.\n\nTus tareas pendientes (${tareas.length}):`)
  await tgSendKb(token, chatId, text, keyboard)
  return true
}

async function handleGestion(
  admin: Admin,
  token: string,
  chatId: number,
  texto: string,
  directorId: string,
): Promise<void> {
  const raw = texto.slice(1).trimStart()
  const spaceIdx = raw.indexOf(' ')
  const cmd = (spaceIdx === -1 ? raw : raw.slice(0, spaceIdx)).toLowerCase()
  const args = spaceIdx === -1 ? '' : raw.slice(spaceIdx + 1).trim()

  // /ayuda /help /start
  if (cmd === 'ayuda' || cmd === 'help' || cmd === 'start') {
    await tgSend(token, chatId,
      'Escritos: mandame un audio o un texto con el expediente (número o apellido de una parte) y qué hay que presentar. ' +
      'Te mando el borrador en PDF con botones para pedir cambios (por audio), revisarlo antes de firmar o abrirlo en la app.\n' +
      '"Reintentá …" mejora el último borrador.\n\n' +
      '/escritos — sin terminar, para presentar y esperando proveído\n' +
      '/hoy — resumen diario (audiencias + SAE urgentes + tareas vencidas)\n' +
      '/tareas [nombre] — pendientes de un colaborador\n' +
      '/tarea [texto] — crear tareas (una por línea)\n' +
      '  Ej: /tarea demanda laboral Medina Vives Luciana para Claudio para el viernes alta\n' +
      '/hecho N — marcar como hecha tu tarea N\n' +
      '/audiencias — próximas 7 días\n' +
      '/sae — notificaciones SAE recientes\n' +
      '/articulo [idea] — proponer un tema para Editorial (o un audio que empiece con "Artículo…")',
    )
    return
  }

  // /tareas [nombre]
  if (cmd === 'tareas' || cmd === 'pendientes') {
    type TareaRow = {
      id: string; titulo: string; prioridad: string | null; fecha_vencimiento: string | null
      asignado: { nombre: string | null; apellido: string | null } | null
      expediente: { caratula: string | null; numero: string | null } | null
    }
    let query = admin.from('tareas')
      .select('id, titulo, prioridad, fecha_vencimiento, asignado:profiles!asignado_a(nombre, apellido), expediente:expedientes(caratula, numero)')
      .in('estado', ['PENDIENTE', 'EN_PROGRESO'])

    let headerName = 'todos'
    if (args) {
      const perfiles = await findPerfilByNombre(admin, args)
      if (perfiles.length === 0) {
        await tgSend(token, chatId, `No encontré colaborador "${args}".`)
        return
      }
      if (perfiles.length > 1) {
        const lista = perfiles.map(p => `• ${p.nombre ?? ''} ${p.apellido ?? ''}`.trim()).join('\n')
        await tgSend(token, chatId, `Varios con "${args}":\n${lista}\n\nUsá el apellido.`)
        return
      }
      query = query.eq('asignado_a', perfiles[0].id)
      headerName = `${perfiles[0].nombre ?? ''} ${perfiles[0].apellido ?? ''}`.trim()
    }

    const { data: tareas } = await query.limit(20)
    if (!tareas?.length) {
      await tgSend(token, chatId, `Sin tareas pendientes${args ? ` para ${args}` : ''}.`)
      return
    }

    const sorted = [...(tareas as TareaRow[])].sort((a, b) =>
      (PRIO_ORDER[b.prioridad ?? 'BAJA'] ?? 0) - (PRIO_ORDER[a.prioridad ?? 'BAJA'] ?? 0)
    )

    const lines = sorted.map(t => {
      const badge = PRIO_BADGE[t.prioridad ?? 'BAJA'] ?? '⚪'
      const exp = t.expediente?.caratula ?? t.expediente?.numero ?? ''
      const venc = t.fecha_vencimiento ? ` · ${t.fecha_vencimiento.slice(0, 10)}` : ''
      const quien = t.asignado ? ` (${(`${t.asignado.nombre ?? ''} ${t.asignado.apellido ?? ''}`).trim()})` : ''
      return `${badge} — ${t.titulo}${exp ? `\n   ${exp.slice(0, 50)}` : ''}${quien}${venc}`
    })

    await tgSend(token, chatId, `Pendientes — ${headerName} (${sorted.length}):\n\n${lines.join('\n\n')}`)
    return
  }

  // /tarea [texto] — una tarea por línea
  if (cmd === 'tarea' || cmd === 'nueva') {
    if (!args) {
      await tgSend(token, chatId, AYUDA_TAREA)
      return
    }

    const { data: dir } = await admin.from('profiles').select('id').eq('rol', 'DIRECTOR').eq('activo', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
    const createdBy = (dir as { id?: string } | null)?.id
    if (!createdBy) {
      await tgSend(token, chatId, 'No encontré perfil del director.')
      return
    }

    const lineas = args.split('\n')
      .map(l => l.replace(/^\s*(?:\/(?:tarea|nueva)\b|[-•*]|\d+[.)])\s*/i, '').trim())
      .filter(Boolean)

    // Si una línea no dice "para X", hereda el último asignado mencionado.
    let ultimoAsignado: PerfilBot | null = null
    const informe: string[] = []
    const sinTelegram = new Set<string>()

    for (const linea of lineas) {
      const parsed = await parseLineaTarea(admin, linea)
      if ('error' in parsed) {
        informe.push(`No creada: "${linea.slice(0, 60)}"\n   ${parsed.error}`)
        continue
      }
      const asignado = parsed.asignado ?? ultimoAsignado
      if (parsed.asignado) ultimoAsignado = parsed.asignado
      const asignadoId = asignado?.id ?? createdBy

      const asunto = await buscarAsunto(admin, parsed.titulo)
      const { error } = await admin.from('tareas').insert({
        titulo: parsed.titulo,
        prioridad: parsed.prioridad,
        fecha_vencimiento: parsed.fecha,
        asignado_a: asignadoId,
        asignados: [asignadoId],
        created_by: createdBy,
        estado: 'PENDIENTE',
        expediente_id: asunto?.tipo === 'expediente' ? asunto.id : null,
        consulta_id: asunto?.tipo === 'consulta' ? asunto.id : null,
      })
      if (error) {
        informe.push(`No creada: "${parsed.titulo.slice(0, 60)}"\n   ${error.message}`)
        continue
      }

      if (asignado && !asignado.telegram_chat_id) sinTelegram.add(nombreCorto(asignado))
      const detalle = [
        asignado ? `Para ${nombreCorto(asignado)}` : 'Para vos',
        PRIO_LABEL[parsed.prioridad] ?? 'Media',
        parsed.fecha ? vencimientoLabel(parsed.fecha) : 'sin fecha',
      ].join(' · ')
      const vinculo = asunto ? `\n   ${asunto.label}` : '\n   (sin expediente ni consulta vinculada)'
      informe.push(`Creada: "${parsed.titulo}"\n   ${detalle}${vinculo}`)
    }

    const aviso = sinTelegram.size
      ? `\n\n${[...sinTelegram].join(', ')} todavía no vinculó Telegram: lo va a ver al entrar a la app (Inicio).`
      : ''
    await tgSend(token, chatId, `${informe.join('\n\n')}${aviso}`)
    return
  }

  // /hecho N — marca como hecha la N-ésima de tus pendientes
  if (cmd === 'hecho' || cmd === 'listo') {
    await responderHecho(admin, token, chatId, directorId, args, true)
    return
  }

  // /hoy — resumen diario: audiencias + SAE urgentes + tareas vencidas
  if (cmd === 'hoy') {
    const todayAR = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

    type AudHoyRow = { hora: string | null; expediente: { id: string; caratula: string | null; numero: string | null } | null }
    type SaeUrgRow = { titulo: string | null; ia_resumen: string | null; expediente_id: string | null; expediente: { caratula: string | null } | null }
    type TareaVencRow = { titulo: string; prioridad: string | null; fecha_vencimiento: string | null; expediente: { caratula: string | null; numero: string | null } | null }

    const [{ data: auds }, { data: saeUrg }, { data: tareasVenc }] = await Promise.all([
      admin.from('audiencias')
        .select('hora, expediente:expedientes!inner(id, caratula, numero)')
        .eq('fecha', todayAR)
        .neq('estado', 'CANCELADA')
        .order('hora', { ascending: true })
        .limit(5),
      admin.from('sae_notificaciones')
        .select('titulo, ia_resumen, expediente_id, expediente:expedientes(caratula)')
        .eq('prioridad', 'urgente')
        .gte('fecha_captura', since48h)
        .order('fecha_captura', { ascending: false })
        .limit(5),
      admin.from('tareas')
        .select('titulo, prioridad, fecha_vencimiento, expediente:expedientes(caratula, numero)')
        .in('estado', ['PENDIENTE', 'EN_PROGRESO'])
        .lte('fecha_vencimiento', todayAR)
        .order('prioridad', { ascending: false })
        .limit(5),
    ])

    const parts: string[] = [`Resumen ${todayAR}`]

    if ((auds as AudHoyRow[] | null)?.length) {
      const lines = (auds as AudHoyRow[]).map(a => {
        const hora = a.hora ? ` ${a.hora.slice(0, 5)}hs` : ''
        const exp = (a.expediente?.caratula ?? a.expediente?.numero ?? 'Expediente').slice(0, 55)
        return `•${hora} ${exp}`
      })
      parts.push(`\n\n🏛 Audiencias hoy (${(auds as AudHoyRow[]).length}):\n${lines.join('\n')}`)
    } else {
      parts.push('\n\n🏛 Sin audiencias hoy')
    }

    if ((saeUrg as SaeUrgRow[] | null)?.length) {
      const lines = (saeUrg as SaeUrgRow[]).map(n => {
        const exp = n.expediente?.caratula ?? ''
        const txt = (n.ia_resumen ?? n.titulo ?? 'Sin título').slice(0, 65)
        return `• ${txt}${exp ? `\n  ${exp.slice(0, 50)}` : ''}`
      })
      parts.push(`\n\n⚠️ SAE urgentes (${(saeUrg as SaeUrgRow[]).length}):\n${lines.join('\n')}`)
    } else {
      parts.push('\n\n⚠️ Sin SAE urgentes')
    }

    if ((tareasVenc as TareaVencRow[] | null)?.length) {
      const lines = (tareasVenc as TareaVencRow[]).map(t => {
        const badge = t.prioridad === 'URGENTE' ? '🔴' : t.prioridad === 'ALTA' ? '🟠' : '🟡'
        const exp = (t.expediente?.caratula ?? t.expediente?.numero ?? '').slice(0, 45)
        const venc = t.fecha_vencimiento ? ` · ${t.fecha_vencimiento.slice(5, 10)}` : ''
        return `${badge} ${t.titulo.slice(0, 55)}${venc}${exp ? `\n  ${exp}` : ''}`
      })
      parts.push(`\n\n📌 Tareas vencidas (${(tareasVenc as TareaVencRow[]).length}):\n${lines.join('\n')}`)
    } else {
      parts.push('\n\n📌 Sin tareas vencidas')
    }

    parts.push(`\n\n${APP_URL}/hoy`)
    await tgSend(token, chatId, parts.join(''))
    return
  }

  // /audiencias
  if (cmd === 'audiencias') {
    const today = new Date().toISOString().split('T')[0]
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    type AudRow = { fecha: string; hora: string | null; expediente: { caratula: string | null; numero: string | null } | null }
    const { data: auds } = await admin.from('audiencias')
      .select('fecha, hora, expediente:expedientes!inner(caratula, numero)')
      .gte('fecha', today)
      .lte('fecha', nextWeek)
      .neq('estado', 'CANCELADA')
      .order('fecha', { ascending: true })
      .order('hora', { ascending: true })
      .limit(10)

    if (!auds?.length) {
      await tgSend(token, chatId, 'Sin audiencias en los próximos 7 días.')
      return
    }

    const lines = (auds as AudRow[]).map(a => {
      const hora = a.hora ? ` ${a.hora.slice(0, 5)}hs` : ''
      const exp = a.expediente?.caratula ?? a.expediente?.numero ?? 'Expediente'
      return `📅 ${a.fecha}${hora} — ${exp.slice(0, 60)}`
    })

    await tgSend(token, chatId, `Audiencias próximas:\n\n${lines.join('\n')}`)
    return
  }

  // /sae
  if (cmd === 'sae') {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    type SaeRow = { titulo: string | null; prioridad: string | null; fecha_emision: string | null; expediente: { caratula: string | null; numero: string | null } | null }
    const { data: notifs } = await admin.from('sae_notificaciones')
      .select('titulo, prioridad, fecha_emision, expediente:expedientes(caratula, numero)')
      .gte('fecha_captura', since)
      .in('prioridad', ['urgente', 'normal'])
      .order('prioridad', { ascending: true })
      .order('fecha_emision', { ascending: false })
      .limit(10)

    if (!notifs?.length) {
      await tgSend(token, chatId, 'Sin notificaciones SAE en las últimas 48hs.')
      return
    }

    const lines = (notifs as SaeRow[]).map(n => {
      const badge = n.prioridad === 'urgente' ? '⚠️' : '·'
      const exp = n.expediente?.caratula ?? n.expediente?.numero ?? ''
      return `${badge} ${(n.titulo ?? 'Sin título').slice(0, 60)}${exp ? `\n   ${exp.slice(0, 50)}` : ''}`
    })

    await tgSend(token, chatId, `SAE (últimas 48hs):\n\n${lines.join('\n\n')}`)
    return
  }

  // Comando desconocido
  await tgSend(token, chatId, `Comando desconocido "/${cmd}".\n\n/ayuda para ver los disponibles.`)
}

// ── ESCRITOS: flujo con botones, PDF y cambios dictados ─────────────────────

interface Ctx { admin: Admin; token: string; url: string; key: string; dir: string }

const TIPOS_RAPIDOS = [
  'Pronto despacho', 'Apertura a prueba', 'Contestación de traslado', 'Recurso de apelación',
  'Recurso de reposición', 'Regulación de honorarios', 'Embargo preventivo', 'Ofrecimiento de prueba',
]

function limpiarIdea(t: string) {
  return t
    .replace(/\b(en\s+)?expediente\s+[\d\/\-]+[,.]?\s*/gi, '')
    .replace(/^(quiero que hagamos escrito|quiero hacer|hacer un escrito|redactá|redactar)\s*[:\-]?\s*/i, '')
    .trim()
}

function etiquetaExp(e: Exp) {
  return `${e.numero_sae ?? e.numero ?? 's/n'} — ${(e.caratula ?? '').slice(0, 38)}`.slice(0, 60)
}

async function llamarFn(ctx: Ctx, fn: string, body: Record<string, unknown>, ms: number): Promise<{ ok: boolean; out: Record<string, unknown> | null; timeout?: boolean }> {
  const ac = new AbortController()
  const tid = setTimeout(() => ac.abort(), ms)
  try {
    const res = await fetch(`${ctx.url}/functions/v1/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ctx.key}` },
      body: JSON.stringify(body), signal: ac.signal,
    })
    const out = await res.json().catch(() => null) as Record<string, unknown> | null
    return { ok: res.ok && !out?.error, out }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return { ok: false, out: null, timeout: true }
    throw e
  } finally { clearTimeout(tid) }
}

/** Expediente elegido: si no se sabe el tipo y el pedido es corto, pregunta con botones; si no, redacta. */
async function continuarConExpediente(ctx: Ctx, chatId: number, exp: Exp, ideaCruda: string, respondeA: string | null = null) {
  const idea = limpiarIdea(ideaCruda) || ideaCruda
  const tipo = inferirTipoEscrito(idea)
  if (!tipo && idea.length < 80) {
    await saveSession(ctx.admin, {
      chat_id: chatId, expediente_id: exp.id,
      pending: { step: 'await_tipo', expediente_id: exp.id, caratula: exp.caratula, idea_limpia: idea, responde_a: respondeA },
    })
    const filas = []
    for (let i = 0; i < TIPOS_RAPIDOS.length; i += 2) {
      filas.push(TIPOS_RAPIDOS.slice(i, i + 2).map((t, k) => ({ text: t, callback_data: `et:${i + k}` })))
    }
    filas.push([{ text: 'Así está bien, deducilo', callback_data: 'et:libre' }])
    filas.push([{ text: 'Cancelar', callback_data: 'et:no' }])
    await tgSendKb(ctx.token, chatId,
      `📄 ${exp.caratula ?? exp.numero_sae ?? exp.numero}\n\n¿Qué escrito es? Tocá uno o escribilo.`, filas)
    return
  }
  await generarYEnviar(ctx, chatId, { exp, tipo, idea, respondeA })
}

async function generarYEnviar(ctx: Ctx, chatId: number, p: { exp: Exp; tipo: string | null; idea: string; respondeA?: string | null; borradorPrevio?: unknown }) {
  await tgSend(ctx.token, chatId, `📝 ${p.tipo ? `"${p.tipo}" para ` : ''}${p.exp.caratula ?? p.exp.numero_sae ?? 'el expediente'}.\nRedactando el borrador; suele tardar un minuto. Te aviso acá cuando esté.`)
  const body: Record<string, unknown> = { expediente_id: p.exp.id, on_behalf_of_user_id: ctx.dir }
  if (p.tipo) { body.tipo = p.tipo; body.instrucciones = p.idea } else body.idea_libre = p.idea
  if (p.respondeA) body.responde_a_movimiento_id = p.respondeA
  if (p.borradorPrevio) body.borrador_previo = p.borradorPrevio
  const r = await conAccion(ctx.token, chatId, llamarFn(ctx, 'escritos-generate', body, 145_000))
  const escritoId = typeof r.out?.escrito_id === 'string' ? r.out.escrito_id : null
  await saveSession(ctx.admin, { chat_id: chatId, expediente_id: p.exp.id, last_escrito_id: escritoId, last_tipo: p.tipo, pending: null })
  if (!r.ok || !escritoId) {
    await tgSendKb(ctx.token, chatId,
      r.timeout
        ? 'Se está demorando más de lo normal. Si termina, aparece en Escritos de la app; si no, decime "reintentá".'
        : `No pude generar el escrito: ${String(r.out?.error ?? 'error interno')}.`,
      [[{ text: 'Abrir Escritos', url: `${APP_URL}/escritos` }]])
    return
  }
  await enviarBorrador(ctx, chatId, escritoId)
}

/** PDF del borrador + qué pide + botones. */
async function enviarBorrador(ctx: Ctx, chatId: number, escritoId: string, encabezado = '✅ Borrador listo', extra: TgBtn[][] = []) {
  const { data } = await ctx.admin.from('escritos')
    .select('id, titulo, contenido, user_id, expediente:expedientes(caratula)').eq('id', escritoId).maybeSingle()
  const e = data as { id: string; titulo: string | null; contenido: Contenido; user_id: string; expediente: { caratula: string | null } | null } | null
  if (!e) { await tgSend(ctx.token, chatId, 'No encontré el escrito.'); return }
  const titulo = e.titulo || e.contenido?.titulo || 'Escrito'
  try {
    const abogado = await abogadoDe(ctx.admin, e.user_id)
    if (abogado && e.contenido?.secciones) {
      await tgAccion(ctx.token, chatId, 'upload_document')
      const pdf = await pdfEscrito(e.contenido, abogado)
      await tgDocumento(ctx.token, chatId, pdf, `${nombreArchivo(titulo)}.pdf`, 'Borrador para leer. Para firmar, bajalo desde la app después de revisarlo.')
    }
  } catch (err) { console.error('[telegram-escrito] pdf', err) }
  const faltan = e.contenido ? pendientes(e.contenido).length : 0
  const pide = e.contenido ? resumenEscrito(e.contenido) : ''
  const texto = `${encabezado}: "${titulo}"${e.expediente?.caratula ? `\n${e.expediente.caratula.slice(0, 90)}` : ''}` +
    (pide ? `\n\nQué pide:\n${pide}` : '') +
    (faltan ? `\n\nQuedan ${faltan} ${faltan === 1 ? 'dato' : 'datos'} entre corchetes para completar.` : '')
  await tgSendKb(ctx.token, chatId, texto, [
    ...extra,
    [{ text: 'Pedir cambios', callback_data: `ec:${e.id}` }, { text: 'Revisar antes de firmar', callback_data: `er:${e.id}` }],
    [{ text: 'Abrir el escrito', url: `${APP_URL}/escritos/${e.id}` }],
  ])
}

type TgBtn = { text: string; callback_data?: string; url?: string }

async function aplicarCambiosDictados(ctx: Ctx, chatId: number, escritoId: string, instruccion: string) {
  const { data } = await ctx.admin.from('escritos').select('id, titulo, contenido, user_id').eq('id', escritoId).maybeSingle()
  const e = data as { id: string; titulo: string | null; contenido: Contenido; user_id: string } | null
  if (!e?.contenido?.secciones) { await tgSend(ctx.token, chatId, 'No encontré el escrito.'); return }
  await tgSend(ctx.token, chatId, '✏️ Aplicando los cambios…')
  const r = await conAccion(ctx.token, chatId, llamarFn(ctx, 'escrito-asistente', {
    escrito_id: e.id, contenido: e.contenido, on_behalf_of_user_id: e.user_id,
    mensajes: [{ role: 'user', content: instruccion }],
  }, 120_000))
  if (!r.ok || !r.out) {
    await tgSendKb(ctx.token, chatId, r.timeout ? 'El asistente tardó demasiado. Probá de nuevo.' : `No pude aplicar los cambios: ${String(r.out?.error ?? 'error interno')}.`,
      [[{ text: 'Pedir cambios', callback_data: `ec:${e.id}` }]])
    return
  }
  const cambios = (Array.isArray(r.out.cambios) ? r.out.cambios : []) as Cambio[]
  const respuesta = typeof r.out.respuesta === 'string' ? r.out.respuesta.trim() : ''
  if (!cambios.length) {
    await tgSendKb(ctx.token, chatId, respuesta || 'No encontré qué cambiar. Probá decirlo de otra forma.',
      [[{ text: 'Pedir otro cambio', callback_data: `ec:${e.id}` }, { text: 'Abrir el escrito', url: `${APP_URL}/escritos/${e.id}` }]])
    return
  }
  // La versión anterior queda en el historial (se puede deshacer acá o restaurar en la app).
  await ctx.admin.rpc('push_escrito_snapshot', { p_escrito_id: e.id, p_snapshot: { contenido: e.contenido, saved_at: new Date().toISOString() } })
  const nuevo = aplicarCambios(e.contenido, cambios)
  const { error } = await ctx.admin.from('escritos').update({ contenido: nuevo, updated_at: new Date().toISOString() }).eq('id', e.id)
  if (error) { await tgSend(ctx.token, chatId, `No pude guardar los cambios: ${error.message}`); return }
  const lista = cambios.slice(0, 8).map((c) => `• ${c.motivo || c.accion}`).join('\n')
  await tgSend(ctx.token, chatId, `Apliqué ${cambios.length} ${cambios.length === 1 ? 'cambio' : 'cambios'}:\n${lista}${respuesta ? `\n\n${respuesta.slice(0, 800)}` : ''}`)
  await enviarBorrador(ctx, chatId, e.id, '✅ Versión corregida', [[{ text: 'Deshacer estos cambios', callback_data: `eu:${e.id}` }]])
}

async function deshacerCambios(ctx: Ctx, chatId: number, escritoId: string) {
  const { data } = await ctx.admin.from('escritos').select('id, historial').eq('id', escritoId).maybeSingle()
  const h = ((data as { historial: { contenido: Contenido; saved_at: string }[] | null } | null)?.historial ?? [])
  const ultimo = h[h.length - 1]
  if (!ultimo?.contenido) { await tgSend(ctx.token, chatId, 'No hay una versión anterior para volver.'); return }
  const { error } = await ctx.admin.from('escritos').update({ contenido: ultimo.contenido, historial: h.slice(0, -1), updated_at: new Date().toISOString() }).eq('id', escritoId)
  if (error) { await tgSend(ctx.token, chatId, `No pude deshacer: ${error.message}`); return }
  await tgSendKb(ctx.token, chatId, 'Listo, volví a la versión anterior.', [
    [{ text: 'Pedir cambios', callback_data: `ec:${escritoId}` }, { text: 'Abrir el escrito', url: `${APP_URL}/escritos/${escritoId}` }],
  ])
}

const EVALUACION: Record<string, string> = {
  presentable_con_correcciones_menores: 'Presentable con correcciones menores',
  requiere_reescritura_parcial: 'Requiere reescritura parcial',
  requiere_reescritura_estructural: 'Requiere reescritura estructural',
}

async function revisarEscrito(ctx: Ctx, chatId: number, escritoId: string) {
  const { data } = await ctx.admin.from('escritos').select('id, titulo, user_id').eq('id', escritoId).maybeSingle()
  const e = data as { id: string; titulo: string | null; user_id: string } | null
  if (!e) { await tgSend(ctx.token, chatId, 'No encontré el escrito.'); return }
  await tgSend(ctx.token, chatId, `🔎 Revisando "${e.titulo ?? 'el escrito'}": forma, fundamentos, citas y plazos…`)
  const r = await conAccion(ctx.token, chatId, llamarFn(ctx, 'diagnose-escrito', { escrito_id: e.id, on_behalf_of_user_id: e.user_id }, 140_000))
  const d = (r.out?.diagnostico ?? null) as {
    control_formal?: { requisito: string; estado: string; detalle?: string }[]
    peticiones_sin_fundamento?: { peticion: string; falta: string }[]
    alertas_plazo_fatal?: { norma: string; plazo: string; vencimiento_estimado?: string | null }[]
    argumentos_sin_norma?: { argumento: string }[]
    sintesis?: { evaluacion?: string; resumen?: string }
  } | null
  if (!r.ok || !d) {
    await tgSendKb(ctx.token, chatId, r.timeout ? 'La revisión tardó demasiado. Probala desde la app.' : `No pude revisarlo: ${String(r.out?.error ?? 'error interno')}.`,
      [[{ text: 'Abrir el escrito', url: `${APP_URL}/escritos/${e.id}` }]])
    return
  }
  const partes: string[] = [`Revisión de "${e.titulo ?? 'el escrito'}"`]
  if (d.sintesis?.evaluacion) partes.push(EVALUACION[d.sintesis.evaluacion] ?? d.sintesis.evaluacion)
  const faltan = (d.control_formal ?? []).filter((x) => x.estado === 'falta')
  const revisar = (d.control_formal ?? []).filter((x) => x.estado === 'revisar')
  if (faltan.length) partes.push(`Requisitos que faltan:\n${faltan.slice(0, 6).map((x) => `• ${x.requisito}${x.detalle ? `: ${x.detalle}` : ''}`).join('\n')}`)
  if (revisar.length) partes.push(`Para revisar: ${revisar.slice(0, 6).map((x) => x.requisito).join('; ')}`)
  const sinFund = d.peticiones_sin_fundamento ?? []
  if (sinFund.length) partes.push(`Pedidos sin fundamento:\n${sinFund.slice(0, 4).map((x) => `• ${x.peticion}: ${x.falta}`).join('\n')}`)
  const plazos = d.alertas_plazo_fatal ?? []
  if (plazos.length) partes.push(`Plazos:\n${plazos.slice(0, 3).map((x) => `• ${x.norma}: ${x.plazo}${x.vencimiento_estimado ? ` (vence aprox. ${x.vencimiento_estimado})` : ''}`).join('\n')}`)
  if (!faltan.length && !revisar.length && !sinFund.length) partes.push('No encontré requisitos faltantes ni pedidos sin fundamento.')
  if (d.sintesis?.resumen) partes.push(d.sintesis.resumen.slice(0, 700))
  await tgSendKb(ctx.token, chatId, partes.join('\n\n').slice(0, 4000), [
    [{ text: 'Pedir cambios', callback_data: `ec:${e.id}` }, { text: 'Abrir el escrito', url: `${APP_URL}/escritos/${e.id}` }],
  ])
}

/** /escritos: lo que está abierto, con un botón por escrito. */
async function listarEscritos(ctx: Ctx, chatId: number) {
  const { data } = await ctx.admin.from('escritos')
    .select('id, titulo, tipo, estado, updated_at, proveido_movement_id, expediente:expedientes(caratula)')
    .in('estado', ['borrador', 'final', 'firmado', 'presentado', 'presentado_sae'])
    .is('proveido_movement_id', null)
    .order('updated_at', { ascending: false }).limit(40)
  const rows = (data ?? []) as unknown as { id: string; titulo: string | null; tipo: string | null; estado: string; updated_at: string; expediente: { caratula: string | null } | null }[]
  if (!rows.length) { await tgSendKb(ctx.token, chatId, 'No hay escritos abiertos.', [[{ text: 'Abrir Escritos', url: `${APP_URL}/escritos` }]]); return }
  const grupos: [string, typeof rows][] = [
    ['Sin terminar', rows.filter((r) => r.estado === 'borrador' || r.estado === 'final')],
    ['Para presentar', rows.filter((r) => r.estado === 'firmado')],
    ['Esperando proveído', rows.filter((r) => r.estado === 'presentado' || r.estado === 'presentado_sae')],
  ]
  const lineas: string[] = []
  const botones: TgBtn[][] = []
  let n = 0
  for (const [nombre, lista] of grupos) {
    if (!lista.length) continue
    lineas.push(`\n${nombre} (${lista.length}):`)
    for (const r of lista.slice(0, 6)) {
      n++
      const dias = Math.floor((Date.now() - new Date(r.updated_at).getTime()) / 86_400_000)
      lineas.push(`${n}. ${(r.titulo || r.tipo || 'Escrito').slice(0, 60)}${r.expediente?.caratula ? ` — ${r.expediente.caratula.slice(0, 40)}` : ''} (${dias === 0 ? 'hoy' : `hace ${dias} d`})`)
      botones.push([{ text: `${n}. ${(r.titulo || r.tipo || 'Escrito').slice(0, 40)}`, url: `${APP_URL}/escritos/${r.id}` }])
    }
  }
  await tgSendKb(ctx.token, chatId, `Escritos abiertos${lineas.join('\n')}`, botones)
}

/** "Responder con un escrito" desde un aviso (notificación del SAE o actuación). */
async function responderDesde(ctx: Ctx, chatId: number, tipo: 'n' | 'm', id: string) {
  let exp: Exp | null = null
  let idea = ''
  let respondeA: string | null = null
  if (tipo === 'n') {
    const { data } = await ctx.admin.from('sae_notificaciones')
      .select('titulo, ia_resumen, expediente:expedientes(id, numero, numero_sae, caratula)').eq('id', id).maybeSingle()
    const n = data as { titulo: string | null; ia_resumen: string | null; expediente: Exp | null } | null
    exp = n?.expediente ?? null
    idea = `Responder a la notificación del SAE: ${n?.titulo ?? ''}. ${n?.ia_resumen ?? ''}`.trim()
  } else {
    const { data } = await ctx.admin.from('sae_movements')
      .select('id, titulo, tipo_movimiento, ai_summary, expediente:expedientes(id, numero, numero_sae, caratula)').eq('id', id).maybeSingle()
    const m = data as { id: string; titulo: string | null; tipo_movimiento: string | null; ai_summary: string | null; expediente: Exp | null } | null
    exp = m?.expediente ?? null
    respondeA = m?.id ?? null
    idea = `Responder a la actuación (${m?.tipo_movimiento ?? 'actuación'}): ${m?.titulo ?? ''}. ${m?.ai_summary ?? ''}`.trim()
  }
  if (!exp) { await tgSend(ctx.token, chatId, 'No encontré el expediente de ese aviso.'); return }
  await continuarConExpediente(ctx, chatId, exp, idea, respondeA)
}

/** Texto de un mensaje: transcribe si es audio. */
async function textoDe(token: string, chatId: number, msg: NonNullable<TgUpdate['message']>, aviso: string): Promise<string> {
  let texto = (msg.text ?? msg.caption ?? '').trim()
  if (msg.voice || msg.audio) {
    await tgSend(token, chatId, aviso)
    const { data, mime } = await tgDownload(token, (msg.voice ?? msg.audio)!.file_id)
    texto = (await transcribeAudio(data, mime, Deno.env.get('GROQ_API_KEY'), Deno.env.get('OPENAI_API_KEY'))).trim()
  }
  return texto
}

async function devolverConObservaciones(admin: Admin, token: string, chatId: number, escritoId: string, texto: string) {
  await saveSession(admin, { chat_id: chatId, pending: null })
  if (/^\s*\/?(cancelar|cancel)\s*$/i.test(texto)) { await tgSend(token, chatId, 'Listo, no lo devolví.'); return }
  const r = await resolverRevision(admin, token, escritoId, 'cambios', texto)
  await tgSend(token, chatId, r.ok
    ? `Devuelto "${r.titulo}" con tus observaciones.${r.avisado ? ' Le llegó el aviso por Telegram.' : ' Las va a ver al abrir el escrito en la app.'}`
    : `No pude devolverlo: ${r.error}`)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok')

  const token = Deno.env.get('TELEGRAM_ESCRITO_BOT_TOKEN')
  const secret = Deno.env.get('TELEGRAM_ESCRITO_WEBHOOK_SECRET')
  const allowed = (Deno.env.get('TELEGRAM_ALLOWED_USER_IDS') ?? '').split(',').map(s => s.trim()).filter(Boolean)

  if (secret && req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return new Response('forbidden', { status: 403 })
  }
  if (!token) { console.error('[telegram-escrito] falta TELEGRAM_ESCRITO_BOT_TOKEN'); return new Response('ok') }

  const update = await req.json().catch(() => null) as TgUpdate | null
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)
  const esAutorizado = (id: string) => allowed.length === 0 || allowed.includes(id)

  async function perfilPorChat(id: number): Promise<PerfilBot | null> {
    const { data } = await admin.from('profiles')
      .select('id, nombre, apellido, telegram_chat_id')
      .eq('telegram_chat_id', id)
      .eq('activo', true)
      .maybeSingle()
    return data as PerfilBot | null
  }

  async function directorId(): Promise<string | null> {
    const { data } = await admin.from('profiles').select('id').eq('rol', 'DIRECTOR').eq('activo', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
    return (data as { id?: string } | null)?.id ?? null
  }

  // Menú de comandos de Telegram (una vez por instancia)
  // @ts-ignore EdgeRuntime existe en Supabase Edge Functions
  EdgeRuntime.waitUntil(configurarMenu(token, allowed).catch(() => {}))

  /** Corre el trabajo largo después de contestarle a Telegram (evita reintentos y duplicados). */
  const enFondo = (chat: number, trabajo: () => Promise<void>) => {
    // @ts-ignore EdgeRuntime existe en Supabase Edge Functions
    EdgeRuntime.waitUntil(trabajo().catch(async (err) => {
      console.error('[telegram-escrito]', err)
      await tgSend(token, chat, `Uf, algo falló: ${err instanceof Error ? err.message : 'error interno'}. Probá de nuevo en un rato.`)
    }))
  }
  const ctxEscritos = async (): Promise<Ctx | null> => {
    const dir = await directorId()
    return dir ? { admin, token, url: supabaseUrl, key: serviceKey, dir } : null
  }

  // Botón "Hecho" de una tarea
  const cq = update?.callback_query
  if (cq) {
    try {
      // "Redactar N" del resumen de la procuración: solo usuarios autorizados (Marco).
      const red = /^redactar:(e|d):([0-9a-f-]{36})$/.exec(cq.data ?? '')
      if (red) {
        if (!esAutorizado(String(cq.from.id))) { await tgAnswerCallback(token, cq.id, 'No autorizado.'); return new Response('ok') }
        const dir = await directorId()
        if (!dir) { await tgAnswerCallback(token, cq.id, 'No encontré el perfil del director.'); return new Response('ok') }
        await tgAnswerCallback(token, cq.id, 'Redactando el borrador…')
        const chat = cq.message?.chat.id ?? cq.from.id
        enFondo(chat, async () => {
          const r = await conAccion(token, chat, redactarPropuesta(admin, { tipo: red[1] === 'e' ? 'evento' : 'diligencia', id: red[2] }, dir, dir))
          const escId = (r as { escrito_id?: string }).escrito_id
          const c = await ctxEscritos()
          if (r.ok && escId && c) await enviarBorrador(c, chat, escId, r.ya_existia ? 'Ya estaba redactado' : '✅ Borrador listo')
          else await tgSend(token, chat, r.ok
            ? `${r.ya_existia ? 'Ya estaba redactado' : 'Borrador listo'}: "${r.titulo}"${r.caratula ? `\n${r.caratula.slice(0, 80)}` : ''}\n\nRevisalo en ${APP_URL}/expedientes/${r.expediente_id}?tab=escritos`
            : `No pude redactar el borrador: ${r.error}`)
        })
        return new Response('ok')
      }

      // Editorial: aprobar o devolver un artículo desde el chat (solo Marco)
      const ed = /^ed_(aprobar|devolver):([0-9a-f-]{36})$/.exec(cq.data ?? '')
      if (ed) {
        if (!esAutorizado(String(cq.from.id))) { await tgAnswerCallback(token, cq.id, 'Solo Marco aprueba artículos.'); return new Response('ok') }
        const chat = cq.message?.chat.id ?? cq.from.id
        const { data: a } = await admin.from('editorial_articulos').select('id, titulo, estado, asignado_a, creado_por').eq('id', ed[2]).maybeSingle()
        const art = a as { id: string; titulo: string; estado: string; asignado_a: string | null; creado_por: string | null } | null
        if (!art) { await tgAnswerCallback(token, cq.id, 'No encontré el artículo.'); return new Response('ok') }
        if (ed[1] === 'devolver') {
          await saveSession(admin, { chat_id: chat, pending: { step: 'ed_devolver', articulo_id: art.id, titulo: art.titulo } })
          await tgAnswerCallback(token, cq.id, 'Mandame las observaciones')
          await tgSend(token, chat, `Escribí o dictá las observaciones para devolver "${art.titulo}". (Para no devolverlo: "cancelar")`)
          return new Response('ok')
        }
        if (art.estado !== 'borrador') { await tgAnswerCallback(token, cq.id, `El artículo ya está ${art.estado}.`); return new Response('ok') }
        const ahora = new Date().toISOString()
        const { error } = await admin.from('editorial_articulos').update({ estado: 'aprobado', aprobado_at: ahora, aprobacion_pedida_at: null, devuelto_at: null, updated_at: ahora }).eq('id', art.id)
        if (error) { await tgAnswerCallback(token, cq.id, 'No se pudo aprobar.'); return new Response('ok') }
        await tgAnswerCallback(token, cq.id, 'Aprobado')
        await tgSendKb(token, chat, `Aprobado: "${art.titulo}". Ya se puede descargar en Word o PDF.`, [[{ text: 'Abrir', url: `${APP_URL}/editorial/${art.id}` }]])
        // Aviso a quien lo trabajó y aprendizaje (estilo, línea temática) en segundo plano
        const quien = art.asignado_a ?? art.creado_por
        const dir = await directorId()
        const tareas: Promise<unknown>[] = [llamarEditorial({ modo: 'al_aprobar', articulo_id: art.id }).catch((e) => console.error('[telegram-escrito] al_aprobar', e))]
        if (quien && quien !== dir) {
          tareas.push((async () => {
            const { data: p } = await admin.from('profiles').select('telegram_chat_id').eq('id', quien).maybeSingle()
            const c = (p as { telegram_chat_id: number | null } | null)?.telegram_chat_id
            if (c) await tgSend(token, c, `Editorial: Marco aprobó "${art.titulo}". ¡Buen trabajo!`)
          })())
        }
        // @ts-ignore EdgeRuntime existe en Supabase Edge Functions
        EdgeRuntime.waitUntil(Promise.all(tareas))
        return new Response('ok')
      }

      // Revisión pedida desde la app: aprobar o devolver (quien revisa, o Marco)
      const rv = /^(ra|rd):([0-9a-f-]{36})$/.exec(cq.data ?? '')
      if (rv) {
        const chat = cq.message?.chat.id ?? cq.from.id
        const { data: ed } = await admin.from('escritos').select('id, titulo, tipo, revision_pedida_a, revision_resultado').eq('id', rv[2]).maybeSingle()
        const e = ed as { id: string; titulo: string | null; tipo: string | null; revision_pedida_a: string | null; revision_resultado: string | null } | null
        if (!e?.revision_pedida_a) { await tgAnswerCallback(token, cq.id, 'Ese escrito ya no está en revisión.'); return new Response('ok') }
        const perfil = await perfilPorChat(cq.from.id)
        if (perfil?.id !== e.revision_pedida_a && !esAutorizado(String(cq.from.id))) { await tgAnswerCallback(token, cq.id, 'La revisión está pedida a otra persona.'); return new Response('ok') }
        if (e.revision_resultado) { await tgAnswerCallback(token, cq.id, e.revision_resultado === 'aprobado' ? 'Ya estaba aprobado.' : 'Ya estaba devuelto.'); return new Response('ok') }
        if (rv[1] === 'ra') {
          const r = await resolverRevision(admin, token, e.id, 'aprobado', null)
          await tgAnswerCallback(token, cq.id, r.ok ? 'Aprobado' : 'No se pudo aprobar')
          await tgSend(token, chat, r.ok ? `Aprobado: "${r.titulo}".${r.avisado ? ' Le avisé a quien lo pidió.' : ''}` : `No pude aprobarlo: ${r.error}`)
          return new Response('ok')
        }
        const titulo = e.titulo || e.tipo || 'el escrito'
        await saveSession(admin, { chat_id: chat, pending: { step: 'await_obs', escrito_id: e.id, titulo } })
        await tgAnswerCallback(token, cq.id, 'Mandame las observaciones')
        await tgSend(token, chat, `Escribí o dictá las observaciones para "${titulo}". (Para no devolverlo: "cancelar")`)
        return new Response('ok')
      }

      // Escritos: elegir expediente/tipo, pedir cambios, revisar, deshacer, responder un aviso.
      // Solo autorizados; quien revisa un escrito puede además corregirlo y revisarlo.
      const esc = /^(ex|et|ec|er|eu|rn|rm):([\w-]{1,40})$/.exec(cq.data ?? '')
      if (esc) {
        let permitido = esAutorizado(String(cq.from.id))
        if (!permitido && ['ec', 'er', 'eu'].includes(esc[1])) {
          const perfil = await perfilPorChat(cq.from.id)
          const { data: ed } = await admin.from('escritos').select('revision_pedida_a').eq('id', esc[2]).maybeSingle()
          permitido = !!perfil && (ed as { revision_pedida_a: string | null } | null)?.revision_pedida_a === perfil.id
        }
        if (!permitido) { await tgAnswerCallback(token, cq.id, 'No autorizado.'); return new Response('ok') }
        const chat = cq.message?.chat.id ?? cq.from.id
        const c = await ctxEscritos()
        if (!c) { await tgAnswerCallback(token, cq.id, 'No encontré el perfil del director.'); return new Response('ok') }
        const [, accion, arg] = esc
        if (accion === 'ex' || accion === 'et') {
          const ses = await loadSession(admin, chat)
          if (arg === 'no') { await saveSession(admin, { chat_id: chat, pending: null }); await tgAnswerCallback(token, cq.id, 'Cancelado'); await tgSend(token, chat, 'Cancelado.'); return new Response('ok') }
          if (accion === 'ex') {
            if (!isPendingValid(ses) || ses.pending.step !== 'await_exp') { await tgAnswerCallback(token, cq.id, 'Se venció; mandame el pedido de nuevo.'); return new Response('ok') }
            const pend = ses.pending
            const { data: e } = await admin.from('expedientes').select('id, numero, numero_sae, caratula').eq('id', arg).maybeSingle()
            if (!e) { await tgAnswerCallback(token, cq.id, 'No encontré el expediente.'); return new Response('ok') }
            await tgAnswerCallback(token, cq.id, 'Expediente elegido')
            await saveSession(admin, { chat_id: chat, pending: null })
            enFondo(chat, () => continuarConExpediente(c, chat, e as Exp, pend.idea, pend.responde_a ?? null))
            return new Response('ok')
          }
          if (!isPendingValid(ses) || ses.pending.step !== 'await_tipo') { await tgAnswerCallback(token, cq.id, 'Se venció; mandame el pedido de nuevo.'); return new Response('ok') }
          const pend = ses.pending
          const tipo = arg === 'libre' ? null : TIPOS_RAPIDOS[Number(arg)] ?? null
          await tgAnswerCallback(token, cq.id, tipo ?? 'Lo deduzco del pedido')
          await saveSession(admin, { chat_id: chat, pending: null })
          const exp: Exp = { id: pend.expediente_id, numero: null, numero_sae: null, caratula: pend.caratula }
          enFondo(chat, () => generarYEnviar(c, chat, { exp, tipo, idea: pend.idea_limpia, respondeA: pend.responde_a ?? null }))
          return new Response('ok')
        }
        if (accion === 'ec') {
          const { data: e } = await admin.from('escritos').select('id, titulo').eq('id', arg).maybeSingle()
          if (!e) { await tgAnswerCallback(token, cq.id, 'No encontré el escrito.'); return new Response('ok') }
          const t = (e as { titulo: string | null }).titulo ?? 'el escrito'
          await saveSession(admin, { chat_id: chat, pending: { step: 'await_cambios', escrito_id: arg, titulo: t } })
          await tgAnswerCallback(token, cq.id, 'Decime qué cambiar')
          await tgSend(token, chat, `¿Qué cambio en "${t}"? Escribilo o mandá un audio.\nEj.: "sacá el tercer punto del petitorio y citá el art. 330".\n\n(Para no cambiar nada: "cancelar")`)
          return new Response('ok')
        }
        await tgAnswerCallback(token, cq.id, accion === 'er' ? 'Revisando…' : accion === 'eu' ? 'Deshaciendo…' : 'Preparando el escrito…')
        if (accion === 'er') enFondo(chat, () => revisarEscrito(c, chat, arg))
        else if (accion === 'eu') enFondo(chat, () => deshacerCambios(c, chat, arg))
        else enFondo(chat, () => responderDesde(c, chat, accion === 'rn' ? 'n' : 'm', arg))
        return new Response('ok')
      }

      const m = /^hecho:([0-9a-f-]{36})$/.exec(cq.data ?? '')
      if (!m) { await tgAnswerCallback(token, cq.id, ''); return new Response('ok') }
      const autorizado = esAutorizado(String(cq.from.id))
      const perfil = await perfilPorChat(cq.from.id)
      const profileId = perfil?.id ?? (autorizado ? await directorId() : null)
      if (!profileId) { await tgAnswerCallback(token, cq.id, 'Tu Telegram no está vinculado.'); return new Response('ok') }
      const res = await completarTarea(admin, m[1], profileId, autorizado)
      await tgAnswerCallback(token, cq.id, res.ok ? 'Marcada como hecha' : res.error)
      if (res.ok && cq.message) await tgSend(token, cq.message.chat.id, `Listo, marcada como hecha: "${res.titulo}".`)
    } catch (err) {
      console.error('[telegram-escrito] callback', err)
      await tgAnswerCallback(token, cq.id, 'Algo falló, probá de nuevo.')
    }
    return new Response('ok')
  }

  const msg = update?.message
  if (!msg) return new Response('ok')
  const chatId = msg.chat.id
  const fromId = String(msg.from?.id ?? '')

  // "/start <código>" desde el enlace de la app: vincula este chat con el perfil.
  const start = /^\/start\s+([A-Za-z0-9_-]{8,64})\s*$/.exec((msg.text ?? '').trim())
  if (start) {
    try {
      if (await vincularChat(admin, token, chatId, start[1])) return new Response('ok')
    } catch (err) {
      console.error('[telegram-escrito] vincular', err)
    }
    await tgSend(token, chatId, 'El enlace no es válido. Generá uno nuevo desde la app (Inicio → Vincular Telegram).')
    return new Response('ok')
  }

  if (!esAutorizado(fromId)) {
    // Colaborador con Telegram vinculado: solo sus tareas.
    try {
      const perfil = await perfilPorChat(chatId)
      if (perfil) {
        // Revisor que no es Marco: observaciones o cambios pendientes
        const ses = await loadSession(admin, chatId)
        const pend = isPendingValid(ses) ? ses.pending : null
        if (pend?.step === 'await_obs' || pend?.step === 'await_cambios') {
          const c = await ctxEscritos()
          enFondo(chatId, async () => {
            const texto = await textoDe(token, chatId, msg, '🎙️ Recibido. Transcribiendo…')
            if (!texto) { await tgSend(token, chatId, 'No te entendí. Escribilo o mandá otro audio.'); return }
            if (pend.step === 'await_obs') { await devolverConObservaciones(admin, token, chatId, pend.escrito_id, texto); return }
            await saveSession(admin, { chat_id: chatId, pending: null })
            if (/^\s*(cancelar|cancel|no|nada)\s*$/i.test(texto)) { await tgSend(token, chatId, 'Listo, no cambié nada.'); return }
            if (c) await aplicarCambiosDictados(c, chatId, pend.escrito_id, texto)
          })
          return new Response('ok')
        }
        await handleColaborador(admin, token, chatId, perfil, (msg.text ?? msg.caption ?? '').trim())
        return new Response('ok')
      }
    } catch (err) {
      console.error('[telegram-escrito] colaborador', err)
      await tgSend(token, chatId, 'Algo falló, probá de nuevo en un rato.')
      return new Response('ok')
    }
    await tgSend(token, chatId, `Para usar este bot, vinculá tu cuenta desde la app: ${APP_URL}/inicio → "Vincular Telegram".`)
    return new Response('ok')
  }

  const ctx = await ctxEscritos()
  if (!ctx) { await tgSend(token, chatId, 'No encontré el perfil del director para firmar. Avisale al admin.'); return new Response('ok') }
  // Se contesta enseguida a Telegram y el trabajo sigue en segundo plano.
  enFondo(chatId, () => procesarMensaje(ctx, chatId, msg))
  return new Response('ok')
})

async function procesarMensaje(ctx: Ctx, chatId: number, msg: NonNullable<TgUpdate['message']>) {
  const { admin, token } = ctx
  const targetProfile = ctx.dir

  // ¿Estamos esperando observaciones (Editorial) o cambios (escrito)?
  const sesion = await loadSession(admin, chatId)
  const pend = isPendingValid(sesion) ? sesion.pending : null
  const devolviendo = pend?.step === 'ed_devolver' ? pend : null
  const cambiando = pend?.step === 'await_cambios' ? pend : null
  const observando = pend?.step === 'await_obs' ? pend : null

  // Texto base: voz → transcripción, o texto directo
  let texto = (msg.text ?? msg.caption ?? '').trim()
  if (msg.voice || msg.audio) {
    await tgSend(token, chatId, devolviendo || observando ? '🎙️ Recibí tus observaciones. Transcribiendo…' : cambiando ? '🎙️ Recibí los cambios. Transcribiendo…' : '🎙️ Recibí tu audio. Transcribiendo…')
    const { data, mime } = await tgDownload(token, (msg.voice ?? msg.audio)!.file_id)
    texto = (await transcribeAudio(data, mime, Deno.env.get('GROQ_API_KEY'), Deno.env.get('OPENAI_API_KEY'))).trim()
    if (texto) await tgSend(token, chatId, `Entendí: "${texto.slice(0, 300)}${texto.length > 300 ? '…' : ''}"`)
  }
  if (!texto) {
    await tgSend(token, chatId, 'Mandame una nota de voz o un texto diciendo el expediente (por actor/demandado o número) y qué hay que presentar.')
    return
  }
  if (devolviendo) {
    await saveSession(admin, { chat_id: chatId, pending: null })
    if (/^\s*\/?(cancelar|cancel|no)\s*$/i.test(texto)) { await tgSend(token, chatId, 'Listo, no lo devolví.'); return }
    const r = await llamarEditorial({ modo: 'devolver', articulo_id: devolviendo.articulo_id, observaciones: texto })
    await tgSend(token, chatId, `Devuelto "${devolviendo.titulo}" con tus observaciones.${r.avisado ? ' Le llegó el aviso por Telegram.' : ''}`)
    return
  }
  if (observando && !texto.startsWith('/')) {
    await devolverConObservaciones(admin, token, chatId, observando.escrito_id, texto)
    return
  }
  if (cambiando && !texto.startsWith('/')) {
    await saveSession(admin, { chat_id: chatId, pending: null })
    if (/^\s*(cancelar|cancel|no|nada)\s*$/i.test(texto)) { await tgSend(token, chatId, 'Listo, no cambié nada.'); return }
    await aplicarCambiosDictados(ctx, chatId, cambiando.escrito_id, texto)
    return
  }
  // Editorial: idea para un artículo (/articulo … o audio que empieza con "Artículo…")
  if (IDEA_ARTICULO_RE.test(texto)) {
    await proponerArticulo(admin, token, chatId, texto.replace(IDEA_ARTICULO_RE, ''))
    return
  }
  // Comandos (/escritos, /tareas, /tarea, /audiencias, /sae, /ayuda)
  if (texto.startsWith('/')) {
    if (/^\/escritos\b/i.test(texto)) { await listarEscritos(ctx, chatId); return }
    await handleGestion(admin, token, chatId, texto, targetProfile)
    return
  }

  const tieneNumeroExpediente = /\d{3,}\/\d{2,}|\b\d{4,}\b/.test(texto)

  // CASO A: respuesta escrita a "¿Qué escrito es?"
  if (pend?.step === 'await_tipo' && !tieneNumeroExpediente) {
    await saveSession(admin, { chat_id: chatId, pending: null })
    if (/^\s*(no|cancelar|cancel)\s*$/i.test(texto)) { await tgSend(token, chatId, 'Cancelado. Mandame un nuevo mensaje cuando quieras.'); return }
    const esSi = /^\s*(sí|si|ok|dale|yes|generar?|generá|adelante)\s*$/i.test(texto)
    const tipo = esSi ? null : inferirTipoEscrito(texto) ?? texto.trim()
    const exp: Exp = { id: pend.expediente_id, numero: null, numero_sae: null, caratula: pend.caratula }
    await generarYEnviar(ctx, chatId, { exp, tipo, idea: pend.idea_limpia, respondeA: pend.responde_a ?? null })
    return
  }

  // CASO B: "reintentá …" sobre el último borrador (lo mejora en vez de rehacerlo)
  if (REINTENTAR_RE.test(texto) && !tieneNumeroExpediente && sesion?.expediente_id) {
    const { data: expData } = await admin.from('expedientes').select('id, numero, numero_sae, caratula').eq('id', sesion.expediente_id).maybeSingle()
    if (expData) {
      let borradorPrevio: unknown = undefined
      if (sesion.last_escrito_id) {
        const { data: ult } = await admin.from('escritos').select('contenido').eq('id', sesion.last_escrito_id).maybeSingle()
        borradorPrevio = (ult as { contenido?: unknown } | null)?.contenido
      }
      const idea = texto.replace(REINTENTAR_RE, '').replace(/^\s*[:\-,]\s*/, '').trim()
      await generarYEnviar(ctx, chatId, {
        exp: expData as Exp, tipo: sesion.last_tipo, idea: idea || 'Mejorá el borrador anterior.', borradorPrevio,
      })
      return
    }
  }

  // CASO C: pedido nuevo → resolver el expediente
  const { unico, candidatos } = await resolverExpediente(admin, texto)
  if (unico) { await continuarConExpediente(ctx, chatId, unico, texto); return }
  if (candidatos.length === 0) {
    await tgSend(token, chatId, `No encontré el expediente. Decime el número (SAE o interno), ej. "687/22", o el apellido de una de las partes.\n\nTe entendí: "${texto.slice(0, 200)}"`)
    return
  }
  await saveSession(admin, { chat_id: chatId, pending: { step: 'await_exp', idea: texto } })
  await tgSendKb(token, chatId, '¿En cuál expediente?',
    [...candidatos.slice(0, 6).map((e) => [{ text: etiquetaExp(e), callback_data: `ex:${e.id}` }]), [{ text: 'Cancelar', callback_data: 'ex:no' }]])
}

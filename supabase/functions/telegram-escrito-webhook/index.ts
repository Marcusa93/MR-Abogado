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

interface TelegramPending {
  step: 'await_tipo'
  expediente_id: string
  caratula: string | null
  idea_limpia: string
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
  if (/^\/(ayuda|help)\b/i.test(t)) {
    await tgSend(token, chatId,
      'Acá te aviso cuando tengas una tarea nueva y cada mañana te mando tus pendientes.\n\n' +
      '/tareas — ver tus pendientes\n' +
      '/hecho N — marcar como hecha la tarea N de la lista\n\n' +
      `También las ves en ${APP_URL}/mi-trabajo`)
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
    await tgSend(token, chatId, 'El enlace venció. Generá uno nuevo desde la app (Mi Trabajo → Vincular Telegram).')
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
      'Comandos de gestión:\n\n' +
      '/hoy — resumen diario (audiencias + SAE urgentes + tareas vencidas)\n' +
      '/tareas [nombre] — pendientes de un colaborador\n' +
      '/tarea [texto] — crear tareas (una por línea)\n' +
      '  Ej: /tarea demanda laboral Medina Vives Luciana para Claudio para el viernes alta\n' +
      '/hecho N — marcar como hecha tu tarea N\n' +
      '/audiencias — próximas 7 días\n' +
      '/sae — notificaciones SAE recientes\n\n' +
      'Sin / → generás un escrito por expediente.',
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

    const { data: dir } = await admin.from('profiles').select('id').eq('rol', 'DIRECTOR').limit(1).maybeSingle()
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
      ? `\n\n${[...sinTelegram].join(', ')} todavía no vinculó Telegram: lo va a ver al entrar a la app (Mi Trabajo).`
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
    const { data } = await admin.from('profiles').select('id').eq('rol', 'DIRECTOR').limit(1).maybeSingle()
    return (data as { id?: string } | null)?.id ?? null
  }

  // Botón "Hecho" de una tarea
  const cq = update?.callback_query
  if (cq) {
    try {
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
    await tgSend(token, chatId, 'El enlace no es válido. Generá uno nuevo desde la app (Mi Trabajo → Vincular Telegram).')
    return new Response('ok')
  }

  if (!esAutorizado(fromId)) {
    // Colaborador con Telegram vinculado: solo sus tareas.
    try {
      const perfil = await perfilPorChat(chatId)
      if (perfil) {
        await handleColaborador(admin, token, chatId, perfil, (msg.text ?? msg.caption ?? '').trim())
        return new Response('ok')
      }
    } catch (err) {
      console.error('[telegram-escrito] colaborador', err)
      await tgSend(token, chatId, 'Algo falló, probá de nuevo en un rato.')
      return new Response('ok')
    }
    await tgSend(token, chatId, `Para usar este bot, vinculá tu cuenta desde la app: ${APP_URL}/mi-trabajo → "Vincular Telegram".`)
    return new Response('ok')
  }

  try {
    // Perfil firmante = DIRECTOR
    const targetProfile = await directorId()
    if (!targetProfile) { await tgSend(token, chatId, 'No encontré el perfil del director para firmar. Avisale al admin.'); return new Response('ok') }

    // Texto base: voz → transcripción, o texto directo
    let texto = (msg.text ?? msg.caption ?? '').trim()
    if (msg.voice || msg.audio) {
      await tgSend(token, chatId, '🎙️ Recibí tu audio. Transcribiendo y buscando el expediente…')
      const { data, mime } = await tgDownload(token, (msg.voice ?? msg.audio)!.file_id)
      texto = (await transcribeAudio(data, mime, Deno.env.get('GROQ_API_KEY'), Deno.env.get('OPENAI_API_KEY'))).trim()
    }
    if (!texto) {
      await tgSend(token, chatId, 'Mandame una nota de voz o un texto diciendo el expediente (por actor/demandado o número) y qué hay que presentar.')
      return new Response('ok')
    }

    // Comandos de gestión (/tareas, /tarea, /audiencias, /sae, /ayuda)
    if (texto.startsWith('/')) {
      await handleGestion(admin, token, chatId, texto, targetProfile)
      return new Response('ok')
    }

    // Sesión conversacional
    const session = await loadSession(admin, chatId)

    // Helper para llamar a escritos-generate con timeout de 30s
    async function callEscritosGenerate(body: Record<string, unknown>): Promise<{ ok: boolean; out: { escrito_id?: string; contenido?: { titulo?: string }; error?: string } | null }> {
      const ac = new AbortController()
      const tid = setTimeout(() => ac.abort(), 30_000)
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/escritos-generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify(body),
          signal: ac.signal,
        })
        const out = await res.json().catch(() => null) as { escrito_id?: string; contenido?: { titulo?: string }; error?: string } | null
        return { ok: res.ok, out }
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') {
          await tgSend(token, chatId, 'El escrito tardó demasiado en generarse (timeout). Probá desde la app o reintentá en unos minutos.')
          return { ok: false, out: null }
        }
        throw e
      } finally {
        clearTimeout(tid)
      }
    }

    // CASO A: respuesta a una confirmación pendiente de tipo de escrito
    // El usuario respondió "Recurso de apelación" o "sí" a nuestra pregunta anterior.
    const tieneNumeroExpediente = /\d{3,}\/\d{2,}|\b\d{4,}\b/.test(texto)
    if (isPendingValid(session) && !tieneNumeroExpediente) {
      const { expediente_id, caratula, idea_limpia } = session.pending

      // Cancelar
      if (/^\s*(no|cancelar|cancel)\s*$/i.test(texto.trim())) {
        await saveSession(admin, { chat_id: chatId, pending: null })
        await tgSend(token, chatId, 'Cancelado. Mandame un nuevo mensaje cuando quieras.')
        return new Response('ok')
      }

      // "sí / ok / dale" → generar con idea_libre original
      const esSi = /^\s*(sí|si|ok|dale|yes|generar?|generá|adelante)\s*$/i.test(texto.trim())
      const tipoRespuesta = esSi ? null : inferirTipoEscrito(texto) ?? texto.trim()

      await tgSend(token, chatId, `📝 Generando${tipoRespuesta ? ` "${tipoRespuesta}"` : ' con la descripción libre'} para ${caratula ?? 'el expediente'}…`)

      const genBody: Record<string, unknown> = {
        expediente_id,
        on_behalf_of_user_id: targetProfile,
      }
      if (tipoRespuesta) {
        genBody.tipo = tipoRespuesta
        genBody.instrucciones = idea_limpia
      } else {
        genBody.idea_libre = idea_limpia
      }

      const { ok, out } = await callEscritosGenerate(genBody)
      await saveSession(admin, {
        chat_id: chatId,
        expediente_id,
        last_escrito_id: out?.escrito_id ?? session.last_escrito_id,
        last_tipo: tipoRespuesta ?? session.last_tipo,
        pending: null,
      })

      if (!ok || !out || out.error) {
        await tgSend(token, chatId, `No pude generar el escrito: ${out?.error ?? 'error desconocido'}. Probá desde la app.`)
        return new Response('ok')
      }
      const titulo = out.contenido?.titulo ? `"${out.contenido.titulo}"` : 'El borrador'
      await tgSend(token, chatId, `✅ ${titulo} listo en ${caratula ?? 'el expediente'}.\n\nRevisalo en la app → Expedientes → solapa Escritos.`)
      return new Response('ok')
    }

    // CASO B: "reintentá" sin número de expediente → usar último expediente de la sesión
    const esReintento = REINTENTAR_RE.test(texto) && !tieneNumeroExpediente && !!session?.expediente_id

    // Si es reintento con escrito anterior disponible, recuperar su contenido
    // para pasarlo como borrador_previo → el LLM mejora en vez de rehacer desde cero.
    let borradorPrevio: unknown = undefined
    if (esReintento && session?.last_escrito_id) {
      const { data: ultimoEscrito } = await admin
        .from('escritos')
        .select('contenido, tipo')
        .eq('id', session.last_escrito_id)
        .maybeSingle()
      if (ultimoEscrito?.contenido) {
        borradorPrevio = (ultimoEscrito as { contenido: unknown }).contenido
      }
    }

    let expFinal: Exp | null = null
    let textoParaIdea = texto

    if (esReintento && session?.expediente_id) {
      const { data: expData } = await admin
        .from('expedientes')
        .select('id, numero, numero_sae, caratula')
        .eq('id', session.expediente_id)
        .maybeSingle()
      if (expData) {
        expFinal = expData as Exp
        // El texto del reintento ("reintentá con tono más formal") es la nueva instrucción
        textoParaIdea = texto.replace(REINTENTAR_RE, '').replace(/^\s*[:\-,]\s*/, '').trim()
        await tgSend(token, chatId, `🔄 Regenerando para ${expFinal.caratula ?? expFinal.numero_sae ?? expFinal.numero}…`)
      }
    }

    // CASO C: flujo normal — resolver expediente desde el texto
    if (!expFinal) {
      const { unico, candidatos } = await resolverExpediente(admin, texto)
      if (!unico) {
        if (candidatos.length === 0) {
          await tgSend(token, chatId, `No encontré el expediente. Reenviá diciendo el número (SAE o interno), ej. "687/22".\n\nTe entendí: "${texto.slice(0, 200)}"`)
        } else {
          await tgSend(token, chatId, `Encontré varios expedientes. Reenviá con el número exacto:\n${listaExpes(candidatos)}`)
        }
        return new Response('ok')
      }
      expFinal = unico
    }

    // Limpiar texto → idea del escrito
    const ideaLimpia = textoParaIdea
      .replace(/\b(en\s+)?expediente\s+[\d\/\-]+[,.]?\s*/gi, '')
      .replace(/^(quiero que hagamos escrito|quiero hacer|hacer un escrito|redactá|redactar)\s*[:\-]?\s*/i, '')
      .trim()

    const tipoDetectado = inferirTipoEscrito(ideaLimpia)
    console.log('[telegram-escrito] expediente:', expFinal.id, '| ideaLimpia:', ideaLimpia.slice(0, 150))
    console.log('[telegram-escrito] tipoDetectado:', tipoDetectado, '| reintento:', esReintento)

    // Si no se detectó tipo y el texto es corto/ambiguo → preguntar al usuario
    // Para textos largos, el path idea_libre tiene suficiente contexto.
    if (!tipoDetectado && ideaLimpia.length < 80 && !esReintento) {
      await saveSession(admin, {
        chat_id: chatId,
        expediente_id: expFinal.id,
        last_escrito_id: session?.last_escrito_id ?? null,
        last_tipo: session?.last_tipo ?? null,
        pending: {
          step: 'await_tipo',
          expediente_id: expFinal.id,
          caratula: expFinal.caratula,
          idea_limpia: ideaLimpia || texto,
        },
      })
      await tgSend(token, chatId,
        `📄 Expediente: ${expFinal.caratula ?? expFinal.numero_sae ?? expFinal.numero}.\n\n` +
        `No pude identificar el tipo de escrito. ¿Qué tipo es?\n` +
        `Ej: "Embargo preventivo", "Recurso de apelación", "Contestación de traslado".\n\n` +
        `O respondé "sí" para generar con la descripción libre.`
      )
      return new Response('ok')
    }

    await tgSend(token, chatId, `📄 Expediente: ${expFinal.caratula ?? expFinal.numero_sae ?? expFinal.numero}. Redactando el borrador…`)

    // Para reintentá: si no hay tipo en el texto nuevo, reutilizar el tipo anterior
    const tipoFinal = tipoDetectado ?? (esReintento ? session?.last_tipo ?? null : null)

    const genBody: Record<string, unknown> = {
      expediente_id: expFinal.id,
      on_behalf_of_user_id: targetProfile,
    }
    if (tipoFinal) {
      genBody.tipo = tipoFinal
      genBody.instrucciones = ideaLimpia
    } else {
      genBody.idea_libre = ideaLimpia
    }

    if (esReintento && borradorPrevio) {
      genBody.borrador_previo = borradorPrevio
    }

    const { ok, out } = await callEscritosGenerate(genBody)
    await saveSession(admin, {
      chat_id: chatId,
      expediente_id: expFinal.id,
      last_escrito_id: out?.escrito_id ?? session?.last_escrito_id ?? null,
      last_tipo: tipoFinal ?? session?.last_tipo ?? null,
      pending: null,
    })

    if (!ok || !out || out.error) {
      await tgSend(token, chatId, `No pude generar el escrito: ${out?.error ?? 'error interno'}. Probá de nuevo o desde la app.`)
      return new Response('ok')
    }

    const titulo = out.contenido?.titulo ? `"${out.contenido.titulo}"` : 'El borrador'
    await tgSend(token, chatId, `✅ ${titulo} listo en ${expFinal.caratula ?? 'el expediente'}.\n\nRevisalo en la app → Expedientes → solapa Escritos.`)
    return new Response('ok')
  } catch (err) {
    console.error('[telegram-escrito]', err)
    await tgSend(token, chatId, `Uf, algo falló: ${err instanceof Error ? err.message : 'error interno'}. Probá de nuevo en un rato.`)
    return new Response('ok')
  }
})

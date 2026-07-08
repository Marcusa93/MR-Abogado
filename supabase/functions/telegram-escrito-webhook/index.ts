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
async function resolverExpediente(admin: ReturnType<typeof createClient>, texto: string): Promise<{ unico?: Exp; candidatos: Exp[] }> {
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
async function loadSession(admin: ReturnType<typeof createClient>, chatId: number): Promise<TelegramSession | null> {
  const { data } = await admin
    .from('telegram_escrito_sessions')
    .select('*')
    .eq('chat_id', chatId)
    .maybeSingle()
  return data as TelegramSession | null
}

async function saveSession(admin: ReturnType<typeof createClient>, s: Partial<TelegramSession> & { chat_id: number }) {
  await admin.from('telegram_escrito_sessions').upsert({
    ...s,
    updated_at: new Date().toISOString(),
  }).catch(e => console.warn('[telegram-escrito] session save error', e))
}

// La sesión pending expira a los 30 minutos para no confundir mensajes viejos
function isPendingValid(session: TelegramSession | null): session is TelegramSession & { pending: TelegramPending } {
  if (!session?.pending || !session.updated_at) return false
  return Date.now() - new Date(session.updated_at).getTime() < 30 * 60 * 1000
}

// Palabras clave de "reintentá" — sin número de expediente en el texto
const REINTENTAR_RE = /\b(reintent[aá]|de\s+nuevo|regenera[rl]?|hacé?\s+otro|volvé?\s+a\s+hacer|repetí?)\b/i

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
  const msg = update?.message
  if (!msg) return new Response('ok')
  const chatId = msg.chat.id
  const fromId = String(msg.from?.id ?? '')

  if (allowed.length > 0 && !allowed.includes(fromId)) {
    await tgSend(token, chatId, 'No estás autorizado para generar escritos por este bot.')
    return new Response('ok')
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    // Perfil firmante = DIRECTOR
    const { data: dir } = await admin.from('profiles').select('id').eq('rol', 'DIRECTOR').limit(1).maybeSingle()
    const targetProfile = (dir as { id?: string } | null)?.id
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

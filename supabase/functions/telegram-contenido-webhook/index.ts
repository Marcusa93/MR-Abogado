// Webhook de Telegram para generar guiones de Reel desde el celular.
//
// Marco le manda al bot: una NOTA DE VOZ, un texto o un link de noticia, y el
// bot genera un guion de Reel estructurado que aparece en Contenidos.
//
// Seguridad (esta function NO usa JWT de Supabase — verify_jwt=false):
//   1. Header X-Telegram-Bot-Api-Secret-Token == TELEGRAM_WEBHOOK_SECRET
//   2. update.message.from.id ∈ TELEGRAM_ALLOWED_USER_IDS (csv)
// El guion se inserta con created_by = TELEGRAM_TARGET_PROFILE_ID (perfil de Marco).
//
// Reusa el motor de _shared/guion-reel-core.ts (mismo prompt que la app).
//
// Secrets necesarios (supabase secrets set ...):
//   TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_ALLOWED_USER_IDS,
//   TELEGRAM_TARGET_PROFILE_ID, OPENROUTER_API_KEY, GROQ_API_KEY|OPENAI_API_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { transcribeAudio, extraerDeUrl, generarGuion, guionAContenidoRow, guionACuerpo, materialDeCuerpo } from '../_shared/guion-reel-core.ts'

const TG_API = 'https://api.telegram.org'

type TgButton = { text: string; callback_data: string }

interface TgUpdate {
  message?: {
    chat: { id: number }
    from?: { id: number; first_name?: string }
    text?: string
    caption?: string
    voice?: { file_id: string; mime_type?: string }
    audio?: { file_id: string; mime_type?: string }
    entities?: { type: string; offset: number; length: number }[]
  }
  callback_query?: {
    id: string
    from?: { id: number }
    message?: { chat: { id: number }; message_id: number }
    data?: string
  }
}

async function tgSend(token: string, chatId: number, text: string, keyboard?: TgButton[][]) {
  await fetch(`${TG_API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId, text, disable_web_page_preview: true,
      ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    }),
  }).catch(() => {})
}

async function tgEdit(token: string, chatId: number, messageId: number, text: string, keyboard?: TgButton[][]) {
  await fetch(`${TG_API}/bot${token}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId, message_id: messageId, text, disable_web_page_preview: true,
      ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    }),
  }).catch(() => {})
}

async function tgAnswerCallback(token: string, callbackId: string, text?: string) {
  await fetch(`${TG_API}/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId, ...(text ? { text } : {}) }),
  }).catch(() => {})
}

// Resumen del guion para Telegram: título, duración, hooks. Con botones de acción.
function resumenGuion(titulo: string, duracion: string, hooks: string[]): string {
  const hs = hooks.slice(0, 3).map((h, i) => `${i + 1}. ${h}`).join('\n')
  return `✅ "${titulo}" (${duracion || 'Reel'})\n\n💡 Hooks:\n${hs}\n\nYa está en la app → Contenidos. Botones para ajustarlo:`
}

function botonesGuion(id: string): TgButton[][] {
  return [
    [{ text: '✂️ Más corto', callback_data: `short:${id}` }, { text: '🔁 Otra versión', callback_data: `regen:${id}` }],
    [{ text: '🗑 Descartar', callback_data: `del:${id}` }],
  ]
}

async function tgDownload(token: string, fileId: string): Promise<{ data: ArrayBuffer; mime: string }> {
  const r = await fetch(`${TG_API}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`)
  const j = await r.json() as { ok: boolean; result?: { file_path?: string } }
  if (!j.ok || !j.result?.file_path) throw new Error('No se pudo obtener el archivo de Telegram')
  const fileRes = await fetch(`${TG_API}/file/bot${token}/${j.result.file_path}`)
  if (!fileRes.ok) throw new Error(`No se pudo bajar el audio (${fileRes.status})`)
  const path = j.result.file_path.toLowerCase()
  const mime = path.endsWith('.oga') || path.endsWith('.ogg') ? 'audio/ogg'
    : path.endsWith('.m4a') || path.endsWith('.mp4') ? 'audio/mp4'
    : path.endsWith('.mp3') || path.endsWith('.mpeg') ? 'audio/mpeg'
    : 'audio/ogg'
  return { data: await fileRes.arrayBuffer(), mime }
}

function primerUrl(text: string): string | null {
  const m = text.match(/https?:\/\/\S+/i)
  return m ? m[0] : null
}

// Maneja los botones inline: regenerar más corto / otra versión / descartar.
async function handleCallback(token: string, apiKey: string, callbackId: string, chatId: number, messageId: number, data: string) {
  const [accion, id] = data.split(':')
  if (!id) { await tgAnswerCallback(token, callbackId); return }
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: cont } = await admin.from('contenidos')
    .select('id, titulo, cuerpo').eq('id', id).is('deleted_at', null).maybeSingle()
  if (!cont) { await tgAnswerCallback(token, callbackId, 'Ese guion ya no está'); return }

  if (accion === 'del') {
    await admin.from('contenidos').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    await tgAnswerCallback(token, callbackId, 'Descartado')
    await tgEdit(token, chatId, messageId, `🗑 Descartado: "${cont.titulo}"`)
    return
  }

  if (accion === 'short' || accion === 'regen') {
    const material = materialDeCuerpo(cont.cuerpo)
    if (!material) { await tgAnswerCallback(token, callbackId, 'No tengo el material original para regenerar'); return }
    await tgAnswerCallback(token, callbackId, accion === 'short' ? 'Acortando…' : 'Generando otra versión…')

    const contexto = accion === 'short'
      ? 'Hacelo MÁS CORTO y ágil: máximo 4 escenas, frases más cortas, más punch. Mismo tema.'
      : 'Dame una versión DISTINTA: otro enfoque, otros hooks y otra estructura. Que no se parezca a la anterior. Mismo tema.'
    const guion = await generarGuion(material, contexto, apiKey)
    if (!guion) { await tgSend(token, chatId, 'No pude regenerar, probá de nuevo en un rato.'); return }

    await admin.from('contenidos').update({
      titulo: guion.titulo || cont.titulo,
      cuerpo: guionACuerpo(guion, material),
      notas_internas: guion.notas_edicion || null,
    }).eq('id', id)

    await tgEdit(token, chatId, messageId, resumenGuion(guion.titulo, guion.duracion_estimada, guion.hooks), botonesGuion(id))
    return
  }

  await tgAnswerCallback(token, callbackId)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok')

  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
  const allowed = (Deno.env.get('TELEGRAM_ALLOWED_USER_IDS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const apiKey = Deno.env.get('OPENROUTER_API_KEY')

  // Verificación del secret de Telegram (si está configurado).
  if (secret && req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return new Response('forbidden', { status: 403 })
  }
  if (!token || !apiKey) {
    console.error('[telegram-webhook] faltan secrets de configuración')
    return new Response('ok') // 200 para que Telegram no reintente en loop
  }

  const update = await req.json().catch(() => null) as TgUpdate | null

  // ── Botones inline (callback_query) ───────────────────────────────────────
  if (update?.callback_query) {
    const cb = update.callback_query
    const cbChat = cb.message?.chat.id
    const cbMsgId = cb.message?.message_id
    if (cbChat == null || cbMsgId == null) return new Response('ok')
    if (allowed.length > 0 && !allowed.includes(String(cb.from?.id ?? ''))) {
      await tgAnswerCallback(token, cb.id, 'No autorizado')
      return new Response('ok')
    }
    await handleCallback(token, apiKey, cb.id, cbChat, cbMsgId, cb.data ?? '')
    return new Response('ok')
  }

  const msg = update?.message
  if (!msg) return new Response('ok')

  const chatId = msg.chat.id
  const fromId = String(msg.from?.id ?? '')

  // Allowlist de usuarios.
  if (allowed.length > 0 && !allowed.includes(fromId)) {
    await tgSend(token, chatId, 'No estás autorizado para generar contenidos por este bot.')
    return new Response('ok')
  }

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Perfil dueño del guion (created_by). Si no se configuró TELEGRAM_TARGET_PROFILE_ID,
    // se usa el perfil DIRECTOR (Marco).
    let targetProfile = Deno.env.get('TELEGRAM_TARGET_PROFILE_ID') ?? ''
    if (!targetProfile) {
      const { data: dir } = await admin.from('profiles').select('id').eq('rol', 'DIRECTOR').limit(1).maybeSingle()
      targetProfile = dir?.id ?? ''
    }
    if (!targetProfile) {
      await tgSend(token, chatId, 'No encontré el perfil destino para guardar el guion. Avisale al admin.')
      return new Response('ok')
    }

    const texto = (msg.text ?? msg.caption ?? '').trim()
    let material = ''
    let enlace: string | null = null
    let contexto: string | undefined

    if (msg.voice || msg.audio) {
      await tgSend(token, chatId, '🎙️ Recibí tu audio. Transcribiendo y armando el guion…')
      const fileId = (msg.voice ?? msg.audio)!.file_id
      const { data, mime } = await tgDownload(token, fileId)
      material = await transcribeAudio(data, mime, Deno.env.get('GROQ_API_KEY'), Deno.env.get('OPENAI_API_KEY'))
      if (texto) contexto = texto // caption como ángulo extra
    } else if (texto) {
      const url = primerUrl(texto)
      if (url) {
        await tgSend(token, chatId, '🔗 Recibí el link. Leyendo la nota y armando el guion…')
        enlace = url
        material = await extraerDeUrl(url)
        const resto = texto.replace(url, '').trim()
        if (resto) contexto = resto
      } else {
        await tgSend(token, chatId, '✍️ Recibí el tema. Armando el guion…')
        material = texto
      }
    } else {
      await tgSend(token, chatId, 'Mandame una nota de voz con el tema, un texto, o un link de noticia y te armo el guion del Reel.')
      return new Response('ok')
    }

    material = material.trim()
    if (!material) {
      await tgSend(token, chatId, 'No pude sacar contenido (¿el audio tenía voz, o el link tenía texto?). Probá de nuevo.')
      return new Response('ok')
    }

    const guion = await generarGuion(material, contexto, apiKey)
    if (!guion) {
      await tgSend(token, chatId, 'No pude armar un guion aprovechable con eso. Probá darme un poco más de contexto.')
      return new Response('ok')
    }

    const { data: inserted, error: insErr } = await admin.from('contenidos')
      .insert(guionAContenidoRow(guion, targetProfile, enlace, material))
      .select('id').single()
    if (insErr || !inserted) {
      await tgSend(token, chatId, `Generé el guion pero no lo pude guardar: ${insErr?.message ?? ''}`)
      return new Response('ok')
    }

    await tgSend(
      token, chatId,
      resumenGuion(guion.titulo, guion.duracion_estimada, guion.hooks),
      botonesGuion(inserted.id),
    )
    return new Response('ok')
  } catch (err) {
    console.error('[telegram-webhook]', err)
    await tgSend(token, chatId, `Uf, algo falló: ${err instanceof Error ? err.message : 'error interno'}. Probá de nuevo en un rato.`)
    return new Response('ok')
  }
})

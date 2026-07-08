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
function inferirTipoEscrito(texto: string): string | null {
  const t = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (/embargo\s+preventivo/.test(t)) return 'Embargo preventivo'
  if (/levantamiento\s+de\s+embargo/.test(t)) return 'Levantamiento de embargo'
  if (/recurso\s+de\s+apelaci[o]n/.test(t)) return 'Recurso de apelación'
  if (/recurso\s+de\s+reposici[o]n|recurso\s+de\s+revocatoria/.test(t)) return 'Recurso de reposición'
  if (/regulaci[o]n\s+de\s+honorarios|regular\s+honorarios/.test(t)) return 'Regulación de honorarios'
  if (/contestaci[o]n\s+de\s+traslado|contest[ao]r?\s+(?:el\s+)?traslado/.test(t)) return 'Contestación de traslado'
  if (/apertura\s+a\s+prueba|abrir\s+a\s+prueba/.test(t)) return 'Apertura a prueba'
  if (/ofrecimiento\s+de\s+prueba|ofrez[co]\s+prueba/.test(t)) return 'Ofrecimiento de prueba'
  if (/beneficio\s+de\s+litigar\s+sin\s+gastos/.test(t)) return 'Beneficio de litigar sin gastos'
  if (/desistimiento/.test(t)) return 'Desistimiento'
  if (/caducidad\s+de\s+instancia|perenci[o]n/.test(t)) return 'Caducidad de instancia'
  if (/excepci[o]n\s+de\s+prescripci[o]n|prescripci[o]n/.test(t)) return 'Excepción de prescripción'
  if (/opone\s+excepci[o]n|excepciones\s+previas/.test(t)) return 'Oposición de excepciones'
  if (/nulidad/.test(t)) return 'Planteo de nulidad'
  if (/ampliaci[o]n\s+de\s+demanda/.test(t)) return 'Ampliación de demanda'
  if (/pronto\s+despacho/.test(t)) return 'Pronto despacho'
  return null
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

    // Resolver expediente
    const { unico, candidatos } = await resolverExpediente(admin, texto)
    if (!unico) {
      if (candidatos.length === 0) {
        await tgSend(token, chatId, `No encontré el expediente. Reenviá diciendo el número (SAE o interno), ej. "687/22".\n\nTe entendí: "${texto.slice(0, 200)}"`)
      } else {
        await tgSend(token, chatId, `Encontré varios expedientes. Reenviá con el número exacto:\n${listaExpes(candidatos)}`)
      }
      return new Response('ok')
    }

    await tgSend(token, chatId, `📄 Expediente: ${unico.caratula ?? unico.numero_sae ?? unico.numero}. Redactando el borrador…`)

    // Limpiar el texto: sacar referencia al expediente y prefijos comunes
    const ideaLimpia = texto
      .replace(/\b(en\s+)?expediente\s+[\d\/\-]+[,.]?\s*/gi, '')
      .replace(/^(quiero que hagamos escrito|quiero hacer|hacer un escrito|redactá|redactar)\s*[:\-]?\s*/i, '')
      .trim()

    // Intentar detectar el tipo de escrito con keywords.
    // Si se detecta, se manda como `tipo` explícito (más confiable que
    // dejar que la IA infiera). El texto completo pasa como `instrucciones`.
    const tipoDetectado = inferirTipoEscrito(ideaLimpia)

    // Generar con el mismo motor de la app, en nombre del director
    const res = await fetch(`${supabaseUrl}/functions/v1/escritos-generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        expediente_id: unico.id,
        ...(tipoDetectado
          ? { tipo: tipoDetectado, instrucciones: ideaLimpia }
          : { idea_libre: ideaLimpia }),
        on_behalf_of_user_id: targetProfile,
      }),
    })
    const out = await res.json().catch(() => null) as { escrito_id?: string; contenido?: { titulo?: string }; error?: string } | null
    if (!res.ok || !out || out.error) {
      await tgSend(token, chatId, `No pude generar el escrito: ${out?.error ?? res.status}. Probá de nuevo o desde la app.`)
      return new Response('ok')
    }

    const titulo = out.contenido?.titulo ? `"${out.contenido.titulo}"` : 'El borrador'
    await tgSend(token, chatId, `✅ ${titulo} listo en ${unico.caratula ?? 'el expediente'}.\n\nRevisalo en la app → Expedientes → solapa Escritos.`)
    return new Response('ok')
  } catch (err) {
    console.error('[telegram-escrito]', err)
    await tgSend(token, chatId, `Uf, algo falló: ${err instanceof Error ? err.message : 'error interno'}. Probá de nuevo en un rato.`)
    return new Response('ok')
  }
})

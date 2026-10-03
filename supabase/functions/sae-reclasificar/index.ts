// Clasifica notificaciones SAE del día sin ia_resumen y envía el informe a Telegram.
// Se invoca manualmente o por cron justo después de que corre sae-poll-notificaciones.
// POST con header x-cron-secret.
// Body JSON opcional: { solo_enviar: true } para omitir clasificación.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const TG_API = 'https://api.telegram.org'
const OR_URL = 'https://openrouter.ai/api/v1/chat/completions'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

function e(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function shortOficina(o: string | null | undefined): string {
  if (!o) return ''
  return o
    .replace(/Oficina de Gestión Asociada /gi, 'OGA ')
    .replace(/Juzgado Civil y Comercial/gi, 'J. Civil')
    .replace(/Juzgado de Familia/gi, 'J. Familia')
    .replace(/Juzgado Laboral/gi, 'J. Laboral')
    .replace(/Civil y Comercial/gi, 'Civ.')
    .replace(/\s+N[°º]\s*/gi, ' N°')
    .slice(0, 50)
}

function shortFuero(f: string | null | undefined): string {
  if (!f) return ''
  const map: Record<string, string> = {
    civil: 'Civil', laboral: 'Laboral', familia: 'Familia',
    penal: 'Penal', contencioso: 'Contencioso', concursal: 'Concursal',
  }
  return map[f.toLowerCase()] ?? f
}

// Genera resumen de una notificación SAE usando OpenRouter
async function generarResumen(
  apiKey: string,
  model: string,
  notif: { titulo: string | null; tipo: string | null; caratula: string | null; fuero: string | null; oficina: string | null },
): Promise<string | null> {
  const partes = [
    notif.tipo   && `Tipo de actuación: ${notif.tipo}`,
    notif.titulo && `Título: ${notif.titulo}`,
    notif.caratula && `Carátula: ${notif.caratula}`,
    notif.fuero  && `Fuero: ${notif.fuero}`,
    notif.oficina && `Organismo: ${notif.oficina}`,
  ].filter(Boolean).join('\n')
  if (!partes) return null

  try {
    const res = await fetch(OR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://app.marcorossi.com.ar',
        'X-Title': 'MR Abogado',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              'Sos asistente jurídico en Tucumán, Argentina. ' +
              'Con los datos de una actuación SAE escribí UNA sola oración (máximo 100 caracteres) ' +
              'describiendo qué pasó y si requiere acción. Sin comillas, sin punto final, ' +
              'en tercera persona. Si es un decreto de trámite sin acción urgente, decí qué ordenó.',
          },
          { role: 'user', content: partes },
        ],
        max_tokens: 80,
        temperature: 0.15,
      }),
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) {
      console.warn('[sae-reclasificar] OR', res.status, await res.text().catch(() => '').then(t => t.slice(0, 100)))
      return null
    }
    const data = await res.json()
    return (data?.choices?.[0]?.message?.content as string)?.trim() || null
  } catch (err) {
    console.warn('[sae-reclasificar] generarResumen error:', err instanceof Error ? err.message : err)
    return null
  }
}

type NotifRow = {
  id: string
  titulo: string | null
  tipo: string | null
  caratula: string | null
  numero_expediente: string | null
  oficina: string | null
  prioridad: string | null
  ia_resumen: string | null
  fecha_emision: string | null
  raw_payload: { fuero?: string } | null
  expediente: { caratula: string | null; numero: string | null } | null
}

function formatBlock(n: NotifRow): string {
  const prio = n.prioridad ?? 'normal'
  const badge = prio === 'urgente' ? '⚠️' : prio === 'info' ? 'ℹ️' : '▸'
  const titulo = e((n.titulo ?? 'Sin título').toUpperCase())

  const linea1 = `${badge} <b>${titulo}</b>`

  const fecha = n.fecha_emision?.slice(0, 10) ?? ''
  const fuero = shortFuero(n.raw_payload?.fuero)
  const oficina = shortOficina(n.oficina)
  const linea2 = [fecha, fuero, oficina].filter(Boolean).map(e).join(' · ')

  const caratula = n.expediente?.caratula ?? n.caratula
  const numero = n.expediente?.numero ?? n.numero_expediente
  let linea3 = ''
  if (caratula) {
    linea3 = `<b>${e(caratula)}</b>${numero ? ` · Exp. ${e(numero)}` : ''}`
  } else if (numero) {
    linea3 = `Exp. <b>${e(numero)}</b>`
  }

  const linea4 = n.ia_resumen ? `<i>${e(n.ia_resumen)}</i>` : ''

  return [linea1, linea2, linea3, linea4].filter(Boolean).join('\n')
}

async function tgSend(token: string, chatId: number, text: string) {
  const r = await fetch(`${TG_API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  })
  if (!r.ok) {
    console.warn('[sae-reclasificar] tgSend', r.status, await r.text().catch(() => '').then(t => t.slice(0, 200)))
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret) return json(req, { error: 'CRON_SECRET no configurado' }, 500)
  if ((req.headers.get('x-cron-secret') ?? '') !== cronSecret) {
    return json(req, { error: 'No autorizado' }, 401)
  }

  const body = await req.json().catch(() => ({})) as { solo_enviar?: boolean; dias?: number }
  const soloEnviar = body.solo_enviar === true

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Todos los perfiles DIRECTOR / ADMIN activos
  const { data: dirs } = await admin.from('profiles').select('id').in('rol', ['DIRECTOR', 'ADMIN']).eq('activo', true)
  const profileIds = ((dirs ?? []) as { id: string }[]).map(d => d.id)
  if (!profileIds.length) return json(req, { error: 'Sin perfiles activos' }, 500)

  // Ventana: desde medianoche Argentina si no se pasa dias, o N días atrás
  const argNow = new Date(Date.now() - 3 * 3600_000)
  let since: string
  if (typeof body.dias === 'number' && body.dias > 0) {
    since = new Date(Date.now() - body.dias * 24 * 3600_000).toISOString()
  } else {
    const argMidnight = new Date(argNow)
    argMidnight.setUTCHours(0, 0, 0, 0)
    since = new Date(argMidnight.getTime() + 3 * 3600_000).toISOString()
  }

  const { data: notifs, error: fetchErr } = await admin
    .from('sae_notificaciones')
    .select(`
      id, titulo, tipo, caratula, numero_expediente, oficina,
      prioridad, ia_resumen, fecha_emision, raw_payload,
      expediente:expedientes(caratula, numero)
    `)
    .in('profile_id', profileIds)
    .gte('fecha_captura', since)
    .order('fecha_emision', { ascending: false })
    .limit(40)

  if (fetchErr) return json(req, { error: fetchErr.message }, 500)

  const rows = (notifs ?? []) as NotifRow[]

  if (!rows.length) {
    const marcoChat = Number(Deno.env.get('TELEGRAM_MARCO_CHAT_ID'))
    const tgToken = Deno.env.get('TELEGRAM_ESCRITO_BOT_TOKEN')
    if (marcoChat && tgToken) {
      const dia = argNow.toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: '2-digit' })
      await tgSend(tgToken, marcoChat, `<b>SAE · sin novedades hoy</b>\n<i>${dia}</i>`)
    }
    return json(req, { ok: true, notifs: 0 })
  }

  // ── Clasificación secuencial ──────────────────────────────────────────────
  let clasificadas = 0
  if (!soloEnviar) {
    const apiKey = Deno.env.get('OPENROUTER_API_KEY')
    const model = Deno.env.get('OPENROUTER_MODEL') ?? 'anthropic/claude-3-haiku-20240307'

    if (apiKey) {
      const sinResumen = rows.filter(n => !n.ia_resumen)
      for (const n of sinResumen) {
        const caratula = n.expediente?.caratula ?? n.caratula
        const resumen = await generarResumen(apiKey, model, {
          titulo: n.titulo,
          tipo: n.tipo,
          caratula,
          fuero: n.raw_payload?.fuero ?? null,
          oficina: n.oficina,
        })
        if (resumen) {
          await admin.from('sae_notificaciones')
            .update({ ia_resumen: resumen, ia_analyzed_at: new Date().toISOString() })
            .eq('id', n.id)
          n.ia_resumen = resumen
          clasificadas++
        }
      }
    }
  }

  // ── Informe Telegram ─────────────────────────────────────────────────────
  const marcoChat = Number(Deno.env.get('TELEGRAM_MARCO_CHAT_ID'))
  const tgToken = Deno.env.get('TELEGRAM_ESCRITO_BOT_TOKEN')
  if (!marcoChat || !tgToken) {
    return json(req, { ok: true, notifs: rows.length, clasificadas, sin_telegram: true })
  }

  const PRIO_ORDER: Record<string, number> = { urgente: 0, normal: 1, info: 2 }
  const sorted = [...rows].sort((a, b) => {
    const pa = PRIO_ORDER[a.prioridad ?? 'normal'] ?? 1
    const pb = PRIO_ORDER[b.prioridad ?? 'normal'] ?? 1
    if (pa !== pb) return pa - pb
    return (b.fecha_emision ?? '').localeCompare(a.fecha_emision ?? '')
  })

  const dia = argNow.toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
  const header = `<b>SAE · ${sorted.length} notificacion${sorted.length > 1 ? 'es' : ''} · ${dia}</b>`

  const blocks = sorted.map(n => formatBlock(n))

  const chunks: string[] = []
  let current = header
  for (const block of blocks) {
    if (current.length + 2 + block.length > 3900) {
      chunks.push(current)
      current = block
    } else {
      current += '\n\n' + block
    }
  }
  if (current) chunks.push(current)

  for (const chunk of chunks) await tgSend(tgToken, marcoChat, chunk)

  return json(req, { ok: true, notifs: rows.length, clasificadas, mensajes: chunks.length })
})

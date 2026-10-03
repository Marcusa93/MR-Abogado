// Reclasifica notificaciones SAE sin ia_resumen y envía el informe a Telegram.
// Uso: POST con header x-cron-secret.
// Body JSON opcional:
//   { dias: number }     — ventana de días hacia atrás (default 2)
//   { solo_enviar: true } — omite reclasificación, solo formatea y envía

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { classifyNotifPriority } from '../_shared/notif-priority.ts'

const TG_API = 'https://api.telegram.org'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

// Escapa caracteres HTML para Telegram parse_mode HTML
function e(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Abrevia nombre de oficina para que entre en una línea
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

// Formatea el fuero para mostrarlo limpio
function shortFuero(f: string | null | undefined): string {
  if (!f) return ''
  const map: Record<string, string> = {
    civil: 'Civil',
    laboral: 'Laboral',
    familia: 'Familia',
    penal: 'Penal',
    contencioso: 'Contencioso',
    concursal: 'Concursal',
  }
  return map[f.toLowerCase()] ?? f
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
  const titulo = e(n.titulo ?? 'Sin título').toUpperCase()

  // Línea 1: badge + título en negrita
  const linea1 = `${badge} <b>${titulo}</b>`

  // Línea 2: fecha · fuero · oficina abreviada
  const fecha = n.fecha_emision?.slice(0, 10) ?? ''
  const fuero = shortFuero(n.raw_payload?.fuero)
  const oficina = shortOficina(n.oficina)
  const metaParts = [fecha, fuero, oficina].filter(Boolean)
  const linea2 = metaParts.length ? e(metaParts.join(' · ')) : ''

  // Línea 3: expediente — prioriza la carátula del sistema, luego la del SAE, luego el número
  const caratulaSistema = n.expediente?.caratula
  const caratulaSae = n.caratula
  const numero = n.expediente?.numero ?? n.numero_expediente
  let linea3 = ''
  if (caratulaSistema) {
    linea3 = `<b>${e(caratulaSistema)}</b>${numero ? ` · Exp. ${e(numero)}` : ''}`
  } else if (caratulaSae) {
    linea3 = `<b>${e(caratulaSae)}</b>${numero ? ` · Exp. ${e(numero)}` : ''}`
  } else if (numero) {
    linea3 = `Exp. <b>${e(numero)}</b>`
  }

  // Línea 4: resumen IA (si existe)
  const linea4 = n.ia_resumen ? `<i>${e(n.ia_resumen)}</i>` : ''

  return [linea1, linea2, linea3, linea4].filter(Boolean).join('\n')
}

async function tgSend(token: string, chatId: number, text: string, parseMode = 'HTML') {
  const r = await fetch(`${TG_API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: true,
    }),
  })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    console.warn('[sae-reclasificar] tgSend error', r.status, t.slice(0, 300))
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret) return json(req, { error: 'CRON_SECRET no configurado' }, 500)
  if ((req.headers.get('x-cron-secret') ?? '') !== cronSecret) {
    return json(req, { error: 'No autorizado' }, 401)
  }

  const body = await req.json().catch(() => ({})) as { dias?: number; solo_enviar?: boolean }
  const dias = typeof body.dias === 'number' ? body.dias : 2
  const soloEnviar = body.solo_enviar === true

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Buscar todos los perfiles con acceso SAE (DIRECTOR + ADMIN)
  const { data: dirs } = await admin
    .from('profiles')
    .select('id')
    .in('rol', ['DIRECTOR', 'ADMIN'])
    .eq('activo', true)
  const profileIds = ((dirs ?? []) as { id: string }[]).map(d => d.id)
  if (!profileIds.length) return json(req, { error: 'No se encontraron perfiles activos' }, 500)

  const since = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString()

  const { data: notifs, error: fetchErr } = await admin
    .from('sae_notificaciones')
    .select(`
      id, titulo, tipo, caratula, numero_expediente, oficina,
      prioridad, ia_resumen, fecha_emision,
      raw_payload,
      expediente:expedientes(caratula, numero)
    `)
    .in('profile_id', profileIds)
    .gte('fecha_captura', since)
    .order('fecha_emision', { ascending: false })
    .limit(50)

  if (fetchErr) return json(req, { error: fetchErr.message }, 500)
  if (!notifs?.length) {
    return json(req, { ok: true, notifs: 0, mensaje: `Sin notificaciones en los últimos ${dias} días` })
  }

  const rows = notifs as NotifRow[]

  // ── Reclasificación ──────────────────────────────────────────────────────
  let clasificadas = 0
  if (!soloEnviar) {
    const sinClasificar = rows.filter(n => !n.ia_resumen)
    console.log(`[sae-reclasificar] ${sinClasificar.length} sin clasificar de ${rows.length}`)

    await Promise.all(sinClasificar.map(async (n) => {
      const cls = await classifyNotifPriority({
        tipo: n.tipo,
        titulo: n.titulo,
        caratula: n.expediente?.caratula ?? n.caratula ?? null,
        fuero: n.raw_payload?.fuero ?? null,
        oficina: n.oficina,
      })
      if (!cls) return

      const { error: upErr } = await admin
        .from('sae_notificaciones')
        .update({
          prioridad: cls.prioridad,
          ia_resumen: cls.resumen,
          ia_analyzed_at: new Date().toISOString(),
          plazo_estimado_dias: cls.plazo_estimado_dias,
        })
        .eq('id', n.id)

      if (upErr) {
        console.warn('[sae-reclasificar] update error', upErr.message)
        return
      }

      n.prioridad = cls.prioridad
      n.ia_resumen = cls.resumen
      clasificadas++
    }))
  }

  // ── Armar informe Telegram ───────────────────────────────────────────────
  const marcoChat = Number(Deno.env.get('TELEGRAM_MARCO_CHAT_ID'))
  const tgToken = Deno.env.get('TELEGRAM_ESCRITO_BOT_TOKEN')

  if (!marcoChat || !tgToken) {
    return json(req, { ok: true, notifs: rows.length, clasificadas, sin_telegram: true })
  }

  // Ordenar: urgente → normal → info; dentro de cada grupo por fecha desc
  const PRIO_ORDER: Record<string, number> = { urgente: 0, normal: 1, info: 2 }
  const sorted = [...rows].sort((a, b) => {
    const pa = PRIO_ORDER[a.prioridad ?? 'normal'] ?? 1
    const pb = PRIO_ORDER[b.prioridad ?? 'normal'] ?? 1
    if (pa !== pb) return pa - pb
    return (b.fecha_emision ?? '').localeCompare(a.fecha_emision ?? '')
  })

  const fechaHoy = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const header = `<b>SAE · ${sorted.length} notificacion${sorted.length > 1 ? 'es' : ''} · ${fechaHoy}</b>`

  const blocks = sorted.map(n => formatBlock(n))

  // Partir en mensajes de ≤ 4000 chars (límite Telegram HTML = 4096)
  const chunks: string[] = []
  let current = header
  for (const block of blocks) {
    const sep = current === header ? '\n\n' : '\n\n'
    if (current.length + sep.length + block.length > 3900) {
      chunks.push(current)
      current = block
    } else {
      current += sep + block
    }
  }
  if (current) chunks.push(current)

  let enviados = 0
  for (const chunk of chunks) {
    await tgSend(tgToken, marcoChat, chunk)
    enviados++
  }

  return json(req, {
    ok: true,
    notifs: rows.length,
    clasificadas,
    mensajes_telegram: enviados,
  })
})

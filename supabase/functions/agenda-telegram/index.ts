// agenda-telegram — briefing diario de audiencias + tareas por Telegram.
//
// Cron: lunes a viernes 10:00 UTC (07:00 AR).
// También invocable por cualquier DIRECTOR autenticado.
// Secrets: CRON_SECRET, TELEGRAM_ESCRITO_BOT_TOKEN, TELEGRAM_MARCO_CHAT_ID

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

function getDateAR(offsetDays = 0): string {
  const ar = new Date(Date.now() - 3 * 60 * 60 * 1000 + offsetDays * 86_400_000)
  return ar.toISOString().slice(0, 10)
}

function e(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fmtHora(hora: string | null | undefined): string {
  if (!hora) return ''
  return ` ${hora.slice(0, 5)}`
}

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function fmtFecha(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return `${DIAS[dt.getDay()]} ${d} ${MESES[m - 1]}`
}

interface Audiencia {
  id: string
  fecha: string
  hora: string | null
  estado: string
  expedientes: { caratula: string | null; numero: string | null } | null
}

interface Tarea {
  id: string
  titulo: string
  fecha_vencimiento: string | null
  prioridad: string
  expedientes: { caratula: string | null } | null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const cronSecret = Deno.env.get('CRON_SECRET')
  const isCron = Boolean(cronSecret && req.headers.get('x-cron-secret') === cronSecret)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  if (!isCron) {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json(req, { error: 'No autorizado' }, 401)
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error } = await userClient.auth.getUser()
    if (error || !user) return json(req, { error: 'No autorizado' }, 401)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await admin.from('profiles').select('rol').eq('id', user.id).single()
    if ((profile as any)?.rol !== 'DIRECTOR') return json(req, { error: 'Sin acceso' }, 403)
  }

  const tgToken = Deno.env.get('TELEGRAM_ESCRITO_BOT_TOKEN')
  const marcoChat = Number(Deno.env.get('TELEGRAM_MARCO_CHAT_ID'))
  if (!tgToken || !marcoChat) return json(req, { error: 'Telegram no configurado' }, 500)

  const hoy = getDateAR(0)
  const manana = getDateAR(1)
  const pasado = getDateAR(2)

  const [audiRes, tareasRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin.from as any)('audiencias')
      .select('id, fecha, hora, estado, expedientes(caratula, numero)')
      .in('fecha', [hoy, manana])
      .in('estado', ['PENDIENTE', 'CONFIRMADA'])
      .order('fecha')
      .order('hora'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin.from as any)('tareas')
      .select('id, titulo, fecha_vencimiento, prioridad, expedientes(caratula)')
      .gte('fecha_vencimiento', hoy)
      .lt('fecha_vencimiento', pasado)
      .in('estado', ['PENDIENTE', 'EN_PROGRESO'])
      .order('fecha_vencimiento')
      .order('prioridad'),
  ])

  const audiencias = (audiRes.data ?? []) as Audiencia[]
  const tareas = (tareasRes.data ?? []) as Tarea[]

  if (audiencias.length === 0 && tareas.length === 0) {
    return json(req, { ok: true, skipped: true, reason: 'nada urgente hoy/manana' })
  }

  const audHoy = audiencias.filter(a => a.fecha === hoy)
  const audManana = audiencias.filter(a => a.fecha === manana)
  const tareasHoy = tareas.filter(t => t.fecha_vencimiento === hoy)
  const tareasManana = tareas.filter(t => t.fecha_vencimiento === manana)

  const lines: string[] = []
  lines.push(`<b>📅 Agenda — ${fmtFecha(hoy)}</b>`)

  if (audHoy.length > 0 || audManana.length > 0) {
    lines.push('')
    lines.push('<b>⚖️ Audiencias</b>')
    if (audHoy.length > 0) {
      lines.push('<u>Hoy</u>')
      for (const a of audHoy) {
        const label = e(a.expedientes?.caratula || a.expedientes?.numero || 'Expediente')
        lines.push(`•${fmtHora(a.hora)} ${label}`)
      }
    }
    if (audManana.length > 0) {
      lines.push('<u>Mañana</u>')
      for (const a of audManana) {
        const label = e(a.expedientes?.caratula || a.expedientes?.numero || 'Expediente')
        lines.push(`•${fmtHora(a.hora)} ${label}`)
      }
    }
  }

  if (tareasHoy.length > 0 || tareasManana.length > 0) {
    lines.push('')
    lines.push('<b>✅ Tareas</b>')
    if (tareasHoy.length > 0) {
      lines.push('<u>Vencen hoy</u>')
      for (const t of tareasHoy.slice(0, 5)) {
        const p = t.prioridad === 'URGENTE' ? '🔴 ' : t.prioridad === 'ALTA' ? '🟡 ' : ''
        lines.push(`• ${p}${e(t.titulo)}`)
      }
      if (tareasHoy.length > 5) lines.push(`  +${tareasHoy.length - 5} más`)
    }
    if (tareasManana.length > 0) {
      lines.push('<u>Mañana</u>')
      for (const t of tareasManana.slice(0, 4)) {
        const p = t.prioridad === 'URGENTE' ? '🔴 ' : t.prioridad === 'ALTA' ? '🟡 ' : ''
        lines.push(`• ${p}${e(t.titulo)}`)
      }
      if (tareasManana.length > 4) lines.push(`  +${tareasManana.length - 4} más`)
    }
  }

  lines.push('')
  lines.push('<a href="https://app.marcorossi.com.ar/agenda">Abrir agenda →</a>')

  const text = lines.join('\n')

  const tgRes = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: marcoChat,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  })

  if (!tgRes.ok) {
    const err = await tgRes.text()
    return json(req, { error: `Telegram: ${err}` }, 500)
  }

  return json(req, { ok: true, audiencias: audiencias.length, tareas: tareas.length })
})

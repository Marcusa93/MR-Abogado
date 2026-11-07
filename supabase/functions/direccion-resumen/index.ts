// ─────────────────────────────────────────────────────────────────────────────
// Edge function: direccion-resumen
//
// Lunes 8:00 (Argentina) por pg_cron. Manda a Marco por Telegram el resumen del
// tablero de dirección (misma consulta que la pantalla /direccion).
// Reemplaza a resumen-semanal y sin-movimiento-notify. La caja sigue con su propio mensaje.
// Sin LLM.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

const APP = 'https://app.marcorossi.com.ar'

interface ItemAtencion {
  prioridad: number
  tipo: string
  titulo: string
  detalle: string
  expediente_id: string | null
  caratula: string | null
  lista: unknown
}
interface Miembro { nombre: string; tareas_abiertas: number; tareas_vencidas: number; expedientes: number }
interface Tablero {
  numeros: { en_tramite: number; consultas: number; tareas_vencidas: number; audiencias_15d: number }
  atencion: ItemAtencion[]
  equipo: Miembro[]
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const corto = (s: string, n = 45) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
const capital = (s: string) => s.toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase())

export function armarMensaje(t: Tablero, hoy: Date): string {
  const fecha = hoy.toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' })
  const n = t.numeros
  const l: string[] = []
  l.push(`<b>Dirección · ${fecha}</b>`)
  l.push(`${n.en_tramite} expedientes en trámite · ${n.audiencias_15d} audiencias en 15 días · ${n.tareas_vencidas} tareas vencidas`)

  const urgentes = t.atencion.filter((a) => a.prioridad <= 2)
  l.push('')
  if (urgentes.length === 0) {
    l.push('<b>Para resolver:</b> nada pendiente.')
  } else {
    l.push(`<b>Para resolver (${urgentes.length})</b>`)
    for (const a of urgentes.slice(0, 8)) {
      const car = a.caratula ? ` — ${esc(corto(a.caratula))}` : ''
      l.push(`${a.prioridad === 1 ? '<b>Urgente</b> · ' : '· '}${esc(a.titulo)}: ${esc(a.detalle)}${car}`)
    }
    if (urgentes.length > 8) l.push(`y ${urgentes.length - 8} más`)
  }
  const resto = t.atencion.filter((a) => a.prioridad > 2)
  if (resto.length) l.push(`También: ${resto.map((a) => `${esc(a.detalle)} (${esc(a.titulo)})`).join('; ')}.`)

  const cargados = t.equipo.filter((m) => m.tareas_abiertas > 0 || m.expedientes > 0)
  if (cargados.length) {
    l.push('')
    l.push('<b>Equipo</b>')
    for (const m of cargados) {
      const venc = m.tareas_vencidas > 0 ? `, <b>${m.tareas_vencidas} vencidas</b>` : ''
      l.push(`${esc(capital(m.nombre))}: ${m.expedientes} exp., ${m.tareas_abiertas} tareas${venc}`)
    }
  }

  l.push('')
  l.push(`<a href="${APP}/direccion">Abrir el tablero</a>`)
  return l.join('\n')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return json(req, { error: 'No autorizado' }, 401)
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  const { data, error } = await admin.rpc('tablero_direccion')
  if (error) return json(req, { error: error.message }, 500)

  const texto = armarMensaje(data as Tablero, new Date())
  const soloVer = new URL(req.url).searchParams.get('preview') === '1'

  const token = Deno.env.get('TELEGRAM_ESCRITO_BOT_TOKEN')
  const chat = Number(Deno.env.get('TELEGRAM_MARCO_CHAT_ID'))
  if (soloVer || !token || !chat) return json(req, { enviado: false, texto })

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: texto, parse_mode: 'HTML', disable_web_page_preview: true }),
  })
  if (!res.ok) return json(req, { error: `Telegram: ${await res.text()}` }, 500)
  return json(req, { enviado: true })
})

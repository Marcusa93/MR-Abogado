// ─────────────────────────────────────────────────────────────────────────────
// Edge function: sin-movimiento-notify
//
// Invocada por pg_cron todos los lunes a las 11:00 UTC (8:00 Argentina).
// Detecta consultas y expedientes activos sin actividad en más de N días
// y envía un resumen por Telegram a Marco.
//
// Configurable:
//   SIN_MOVIMIENTO_DIAS  (env, default 30) — umbral de días
//   ?dias=N              (query param) — override por request
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  })
}

async function sendTelegram(botToken: string, chatId: string, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  })
  if (!res.ok) {
    const body = await res.text()
    console.error('Telegram error', res.status, body)
  }
}

const ESTADOS_EXCLUIDOS_CONSULTA   = ['convertida', 'descartada', 'resuelta']
const ESTADOS_EXCLUIDOS_EXPEDIENTE = ['FINALIZADO', 'NO_VIABLE_RECHAZADO']

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

interface ConsultaRow {
  id: string
  nombre: string
  apellido: string | null
  tipo_asunto: string
  last_activity_at: string
  assigned_to: string | null
  abogado: { nombre: string | null; apellido: string | null } | null
}

interface MiembroRow {
  profile_id: string
  abogado: { nombre: string | null; apellido: string | null } | null
  expediente: {
    id: string
    numero: string | null
    caratula: string | null
    estado_interno: string
    last_activity_at: string
    deleted_at: string | null
    cliente: { nombre: string | null; apellido: string | null } | null
  } | null
}

interface GrupoAbogado {
  label: string
  items: { texto: string; dias: number }[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return json({ error: 'No autorizado' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const botToken    = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
  const marcoChatId = Deno.env.get('TELEGRAM_MARCO_CHAT_ID') ?? ''

  const admin = createClient(supabaseUrl, serviceKey)

  const url  = new URL(req.url)
  const dias = parseInt(
    url.searchParams.get('dias') ?? Deno.env.get('SIN_MOVIMIENTO_DIAS') ?? '30',
    10,
  )
  const cutoff = new Date(Date.now() - dias * 86_400_000).toISOString()
  const today  = new Date().toISOString().slice(0, 10)

  // ── Consultas sin movimiento ──────────────────────────────────────────────
  const { data: consultas, error: cErr } = await admin
    .from('consultas')
    .select('id, nombre, apellido, tipo_asunto, last_activity_at, assigned_to, abogado:assigned_to(nombre, apellido)')
    .not('estado', 'in', `(${ESTADOS_EXCLUIDOS_CONSULTA.join(',')})`)
    .not('last_activity_at', 'is', null)
    .lt('last_activity_at', cutoff)
    .order('last_activity_at', { ascending: true })

  if (cErr) {
    console.error('consultas query error', cErr)
    return json({ error: cErr.message }, 500)
  }

  // ── Expedientes sin movimiento via expediente_miembros ───────────────────
  const { data: miembros, error: mErr } = await admin
    .from('expediente_miembros')
    .select(`
      profile_id,
      abogado:profile_id(nombre, apellido),
      expediente:expediente_id(id, numero, caratula, estado_interno, last_activity_at, deleted_at, cliente:cliente_id(nombre, apellido))
    `)
    .eq('activo', true)

  if (mErr) {
    console.error('expediente_miembros query error', mErr)
    return json({ error: mErr.message }, 500)
  }

  // Filtrar expedientes que califican
  const seen = new Set<string>()
  const expedientesSinMov: MiembroRow[] = (miembros as MiembroRow[] ?? []).filter((m) => {
    const exp = m.expediente
    if (!exp || exp.deleted_at) return false
    if (ESTADOS_EXCLUIDOS_EXPEDIENTE.includes(exp.estado_interno)) return false
    if (!exp.last_activity_at || exp.last_activity_at >= cutoff) return false
    if (seen.has(exp.id)) return false
    seen.add(exp.id)
    return true
  })

  const totalSinMovimiento = (consultas?.length ?? 0) + expedientesSinMov.length

  if (totalSinMovimiento === 0) {
    console.log(`sin-movimiento-notify: ningún asunto supera ${dias}d sin actividad`)
    return json({ enviado: false, motivo: 'sin_asuntos', dias })
  }

  // ── Agrupar por abogado ───────────────────────────────────────────────────
  const grupos: Record<string, GrupoAbogado> = {}

  for (const c of (consultas as ConsultaRow[] ?? [])) {
    const key = c.assigned_to ?? 'sin_asignar'
    const abg = c.abogado
    const abgLabel = abg
      ? [abg.apellido, abg.nombre].filter(Boolean).join(', ') || 'Sin nombre'
      : 'Sin asignar'
    if (!grupos[key]) grupos[key] = { label: abgLabel, items: [] }
    const clienteLabel = c.apellido ? `${c.apellido}, ${c.nombre}` : c.nombre
    grupos[key].items.push({
      texto: `[Consulta] ${clienteLabel}`,
      dias:  daysSince(c.last_activity_at),
    })
  }

  for (const m of expedientesSinMov) {
    const key = m.profile_id ?? 'sin_asignar'
    const abg = m.abogado
    const abgLabel = abg
      ? [abg.apellido, abg.nombre].filter(Boolean).join(', ') || 'Sin nombre'
      : 'Sin asignar'
    if (!grupos[key]) grupos[key] = { label: abgLabel, items: [] }
    const exp = m.expediente!
    const cli = exp.cliente
    const clienteLabel = cli
      ? (cli.apellido ? `${cli.apellido}, ${cli.nombre ?? ''}`.trim() : (cli.nombre ?? '—'))
      : (exp.caratula ?? exp.numero ?? '—')
    grupos[key].items.push({
      texto: `[Exp.] ${clienteLabel}`,
      dias:  daysSince(exp.last_activity_at),
    })
  }

  // ── Formatear mensaje Telegram ────────────────────────────────────────────
  const bloques = Object.values(grupos)
    .sort((a, b) => a.label.localeCompare(b.label, 'es'))
    .map((g) => {
      const lineas = g.items
        .sort((a, b) => b.dias - a.dias)
        .map((i) => `  • ${i.texto} _(${i.dias}d)_`)
      return `*${g.label}*\n${lineas.join('\n')}`
    })

  const texto = [
    `⏰ *Sin movimiento +${dias}d* — ${today}`,
    `Total: ${totalSinMovimiento} asunto${totalSinMovimiento !== 1 ? 's' : ''}`,
    '',
    bloques.join('\n\n'),
    '',
    '_app\\.marcorossi\\.com\\.ar/mi\\-trabajo_',
  ].join('\n')

  let enviado = false
  if (botToken && marcoChatId) {
    try {
      await sendTelegram(botToken, marcoChatId, texto)
      enviado = true
    } catch (e) {
      console.error('Telegram send failed', e)
    }
  } else {
    console.warn('sin-movimiento-notify: TELEGRAM_BOT_TOKEN o TELEGRAM_MARCO_CHAT_ID no configurados')
  }

  return json({ enviado, total: totalSinMovimiento, dias, grupos: Object.keys(grupos).length })
})

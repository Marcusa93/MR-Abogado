// ─────────────────────────────────────────────────────────────────────────────
// Edge function: resumen-semanal
//
// Invocada por pg_cron los lunes a las 12:00 UTC (9:00 Argentina).
// Consulta estadísticas de la semana y envía un resumen por Telegram a Marco.
// Sin LLM — solo SQL + formateo de texto.
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
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  })
}

// Formatea una fecha ISO como "lun 25/08"
function fmtFecha(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  const dia = dias[d.getUTCDay()]
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dia} ${dd}/${mm}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return json({ error: 'No autorizado' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
  const marcoChatId = Deno.env.get('TELEGRAM_MARCO_CHAT_ID') ?? ''
  const admin = createClient(supabaseUrl, serviceKey)

  // Fechas: hoy (lunes) y el domingo próximo
  const hoyUTC = new Date()
  // Calcular en zona Argentina (UTC-3)
  const hoyArg = new Date(hoyUTC.getTime() + (-3) * 60 * 60 * 1000)
  const hoy = hoyArg.toISOString().slice(0, 10)
  const fin = new Date(hoyArg)
  fin.setUTCDate(fin.getUTCDate() + 6)
  const finSemana = fin.toISOString().slice(0, 10)

  // Fecha hace 30 días (para detectar expedientes sin movimiento)
  const hace30 = new Date(hoyArg)
  hace30.setUTCDate(hace30.getUTCDate() - 30)
  const fecha30 = hace30.toISOString().slice(0, 10)

  const [
    expActivosRes,
    expSinMovRes,
    tareasPendRes,
    tareasVencRes,
    consultasRes,
    audienciasRes,
    contenidosRes,
  ] = await Promise.all([
    // Expedientes activos (no eliminados, no finalizados)
    admin.from('expedientes')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .not('estado_interno', 'in', '("finalizado","archivado")'),

    // Expedientes sin actuación SAE en los últimos 30 días
    admin.rpc('expedientes_sin_movimiento_reciente', { dias: 30 }).select('*'),

    // Tareas pendientes o en progreso
    admin.from('tareas')
      .select('id', { count: 'exact', head: true })
      .in('estado', ['PENDIENTE', 'EN_PROGRESO']),

    // Tareas vencidas sin completar
    admin.from('tareas')
      .select('id', { count: 'exact', head: true })
      .in('estado', ['PENDIENTE', 'EN_PROGRESO'])
      .lt('fecha_vencimiento', hoy),

    // Consultas abiertas sin conversión hace +7 días
    admin.from('consultas')
      .select('id', { count: 'exact', head: true })
      .not('estado', 'in', '("convertida","descartada")')
      .lt('created_at', new Date(hoyArg.getTime() - 7 * 86400 * 1000).toISOString()),

    // Audiencias esta semana
    admin.from('audiencias')
      .select('fecha, hora, tipo_audiencia, expediente:expedientes(caratula)')
      .gte('fecha', hoy)
      .lte('fecha', finSemana)
      .not('estado', 'eq', 'cancelada')
      .order('fecha', { ascending: true })
      .order('hora', { ascending: true })
      .limit(5),

    // Contenidos programados esta semana
    admin.from('contenidos')
      .select('id', { count: 'exact', head: true })
      .gte('publicar_el', hoy)
      .lte('publicar_el', finSemana)
      .not('estado', 'in', '("publicado","archivado")')
      .is('deleted_at', null),
  ])

  // Construcción del mensaje
  const expActivos = expActivosRes.count ?? 0
  const tareasPend = tareasPendRes.count ?? 0
  const tareasVenc = tareasVencRes.count ?? 0
  const consultas = consultasRes.count ?? 0
  const contenidos = contenidosRes.count ?? 0

  // Expedientes sin movimiento: si el RPC no existe usamos 0
  const expSinMov = Array.isArray(expSinMovRes.data) ? expSinMovRes.data.length : 0

  // Audiencias esta semana
  interface AudienciaRow { fecha: string; hora: string | null; tipo_audiencia: string | null; expediente: { caratula: string | null } | null }
  const audiencias = (audienciasRes.data ?? []) as AudienciaRow[]

  const bloques: string[] = []

  // Header
  bloques.push(`📊 *Resumen semanal* — ${fmtFecha(hoy)} al ${fmtFecha(finSemana)}`)
  bloques.push('')

  // Expedientes
  const lineasExp = [`📁 *Expedientes* — ${expActivos} activos`]
  if (expSinMov > 0) lineasExp.push(`   ⚠️ ${expSinMov} sin movimiento hace +30 días`)
  bloques.push(lineasExp.join('\n'))

  // Tareas
  const lineasTareas = [`✅ *Tareas* — ${tareasPend} pendientes`]
  if (tareasVenc > 0) lineasTareas.push(`   🔴 ${tareasVenc} vencidas sin completar`)
  bloques.push(lineasTareas.join('\n'))

  // Audiencias
  if (audiencias.length > 0) {
    const lineas = [`📅 *Esta semana* — ${audiencias.length} audiencia${audiencias.length !== 1 ? 's' : ''}`]
    audiencias.forEach((a) => {
      const hora = a.hora ? ` ${a.hora.slice(0, 5)}` : ''
      const tipo = a.tipo_audiencia ?? 'Audiencia'
      const car = a.expediente?.caratula?.slice(0, 35) ?? ''
      lineas.push(`   • ${fmtFecha(a.fecha)}${hora} — ${tipo}${car ? ` · _${car}_` : ''}`)
    })
    bloques.push(lineas.join('\n'))
  } else {
    bloques.push(`📅 *Esta semana* — sin audiencias`)
  }

  // Consultas dormidas
  if (consultas > 0) {
    bloques.push(`💬 *Consultas* — ${consultas} abiertas sin mover hace +7 días`)
  }

  // Contenidos
  if (contenidos > 0) {
    bloques.push(`📸 *Contenidos* — ${contenidos} programado${contenidos !== 1 ? 's' : ''} esta semana`)
  }

  const texto = bloques.join('\n')

  if (!botToken || !marcoChatId) {
    return json({ skipped: 'sin_telegram_config', preview: texto })
  }

  try {
    await sendTelegram(botToken, marcoChatId, texto)
  } catch (e) {
    console.error('Telegram send failed', e)
    return json({ error: 'telegram_failed' }, 500)
  }

  return json({ sent: true })
})

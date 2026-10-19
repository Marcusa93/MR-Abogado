import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

const MES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function fmt(n: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(n))
}

interface Resumen {
  periodo: { year: number; month: number }
  mes_actual: { ingresos_ars: number; ingresos_usd: number; gastos_ars: number; gastos_usd: number }
  abonos_activos: number
  abonos_total_mensual_ars: number
  pagos_pendientes_count: number
  pagos_atrasados_count: number
}

interface PagoPendiente {
  cliente_apellido: string
  cliente_nombre: string
  monto: number
  moneda: string
  estado: string
  dias_atraso: number
}

interface GastoFijoPendiente {
  descripcion: string
  monto: number
  moneda: string
  estado: 'registrado' | 'pendiente'
}

interface GastoFijo { monto: number; moneda: string }

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
    const { data: profile } = await admin.from('profiles').select('tiene_acceso_caja').eq('id', user.id).single()
    if (!(profile as any)?.tiene_acceso_caja) return json(req, { error: 'Sin acceso a caja' }, 403)
  }

  const tgToken = Deno.env.get('TELEGRAM_ESCRITO_BOT_TOKEN')
  const marcoChat = Number(Deno.env.get('TELEGRAM_MARCO_CHAT_ID'))
  if (!tgToken || !marcoChat) return json(req, { error: 'Telegram no configurado' }, 500)

  // Fetch en paralelo
  const [resumenRes, pagosRes, gastosFijosMesRes, gastosFijosActivosRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin.rpc as any)('caja_resumen'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin.rpc as any)('caja_pagos_pendientes_mes', { p_year: null, p_month: null }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin.rpc as any)('gastos_fijos_pendientes_mes', { p_year: null, p_month: null }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin.from as any)('gastos_fijos').select('monto, moneda').eq('activo', true),
  ])

  if (resumenRes.error) return json(req, { error: resumenRes.error.message }, 500)

  const resumen = resumenRes.data as Resumen
  const pagos = (pagosRes.data ?? []) as PagoPendiente[]
  const gastosFijosMes = (gastosFijosMesRes.data ?? []) as GastoFijoPendiente[]
  const gastosFijosActivos = (gastosFijosActivosRes.data ?? []) as GastoFijo[]

  const { year, month } = resumen.periodo
  const ingresosARS = Number(resumen.mes_actual.ingresos_ars)
  const ingresosUSD = Number(resumen.mes_actual.ingresos_usd)
  const gastosARS = Number(resumen.mes_actual.gastos_ars)
  const gastosUSD = Number(resumen.mes_actual.gastos_usd)
  const balanceARS = ingresosARS - gastosARS

  // Punto de equilibrio
  const compromisosFijosARS = gastosFijosActivos
    .filter(g => g.moneda === 'ARS')
    .reduce((s, g) => s + Number(g.monto), 0)
  const baseAseguradaARS = Number(resumen.abonos_total_mensual_ars ?? 0)
  const delta = compromisosFijosARS - baseAseguradaARS

  // Abonos pendientes
  const pagosPendientes = pagos.filter(p => p.estado !== 'pagado')
  const pagosAtrasados = pagos.filter(p => p.estado === 'atrasado')

  // Gastos fijos pendientes
  const fijosPendientes = gastosFijosMes.filter(g => g.estado === 'pendiente')
  const fijosRegistrados = gastosFijosMes.filter(g => g.estado === 'registrado').length

  // Armar mensaje
  const sign = balanceARS >= 0 ? '+' : ''
  const lines: string[] = []

  lines.push(`<b>📊 Caja — ${MES[month - 1]} ${year}</b>`)
  lines.push('')
  lines.push(`💰 Ingresos: <b>$${fmt(ingresosARS)}</b>${ingresosUSD > 0 ? ` + US$${fmt(ingresosUSD)}` : ''}`)
  lines.push(`📤 Gastos: <b>$${fmt(gastosARS)}</b>${gastosUSD > 0 ? ` + US$${fmt(gastosUSD)}` : ''}`)
  lines.push(`⚖️ Balance: <b>${sign}$${fmt(balanceARS)}</b>`)

  // Punto de equilibrio (solo si hay datos)
  if (compromisosFijosARS > 0 || baseAseguradaARS > 0) {
    lines.push('')
    lines.push('<b>⚡ Punto de equilibrio</b>')
    lines.push(`Base asegurada (abonos): $${fmt(baseAseguradaARS)}`)
    lines.push(`Compromisos fijos: $${fmt(compromisosFijosARS)}`)
    if (delta <= 0) {
      lines.push(`✅ Los abonos cubren los fijos (sobran $${fmt(-delta)})`)
    } else {
      lines.push(`⚠️ Hay que generar $${fmt(delta)} en honorarios para cubrir fijos`)
    }
  }

  // Abonos del mes
  if (pagos.length > 0) {
    lines.push('')
    const cobrados = pagos.length - pagosPendientes.length
    const atrasadoStr = pagosAtrasados.length > 0 ? ` · ${pagosAtrasados.length} atrasado${pagosAtrasados.length > 1 ? 's' : ''}` : ''
    lines.push(`<b>📅 Abonos del mes: ${cobrados}/${pagos.length} cobrados${atrasadoStr}</b>`)
    if (pagosPendientes.length > 0) {
      const nombres = pagosPendientes.slice(0, 4).map(p => {
        const atraso = p.dias_atraso > 0 ? ` (${p.dias_atraso}d)` : ''
        return `${p.cliente_apellido}${atraso}`
      })
      if (pagosPendientes.length > 4) nombres.push(`+${pagosPendientes.length - 4} más`)
      lines.push(`Pendientes: ${nombres.join(', ')}`)
    }
  }

  // Gastos fijos
  if (gastosFijosMes.length > 0) {
    lines.push('')
    lines.push(`<b>🔁 Gastos fijos: ${fijosRegistrados}/${gastosFijosMes.length} registrados</b>`)
    if (fijosPendientes.length > 0) {
      const nombres = fijosPendientes.slice(0, 3).map(g => g.descripcion)
      if (fijosPendientes.length > 3) nombres.push(`+${fijosPendientes.length - 3} más`)
      lines.push(`Sin cargar: ${nombres.join(', ')}`)
    }
  }

  lines.push('')
  lines.push('<a href="https://app.marcorossi.com.ar/caja">Abrir caja →</a>')

  const text = lines.join('\n')

  const tgRes = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: marcoChat, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  })

  if (!tgRes.ok) {
    const err = await tgRes.text()
    return json(req, { error: `Telegram: ${err}` }, 500)
  }

  return json(req, { ok: true })
})

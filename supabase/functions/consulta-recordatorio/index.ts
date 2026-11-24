// Edge function: consulta-recordatorio
//
// Invocada por pg_cron (job consulta-recordatorio, 12:00 UTC diario).
// Busca consultas activas sin cambio de estado hace más de 7 días y sin
// recordatorio en los últimos 7 días, y manda UN resumen por persona:
//   - DIRECTOR activos: todas las consultas estancadas.
//   - Responsable (assigned_to, si está activo): las suyas.
// Cada resumen es una alerta SEGUIMIENTO_PENDIENTE + push/email vía
// dispatch-alert-notification. Solo se marca recordatorio_enviado_at en las
// consultas que entraron en al menos un resumen enviado.
//
// Auth: header x-cron-secret == CRON_SECRET. El cron no manda JWT, así que se
// despliega con --no-verify-jwt (con verify_jwt el gateway lo rechaza con 401
// antes de llegar acá, que es lo que pasaba hasta 2026-11).
//
// Body opcional: { "dry_run": true } → devuelve qué se mandaría, sin escribir nada.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''

const TERMINAL_ESTADOS = ['convertida', 'resuelta', 'descartada']
const DIAS_SIN_MOVIMIENTO = 7
const MAX_EN_MENSAJE = 8

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

interface Consulta {
  id: string
  nombre: string
  apellido: string | null
  estado: string
  assigned_to: string | null
  estado_changed_at: string
}

function diasDesde(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000))
}

function etiqueta(c: Consulta): string {
  const nombre = [c.apellido, c.nombre].filter(Boolean).join(', ')
  return `${nombre} (${c.estado.replace(/_/g, ' ')}, ${diasDesde(c.estado_changed_at)} días)`
}

function armarResumen(cs: Consulta[]): { titulo: string; mensaje: string; url: string } {
  // Las más viejas primero: son las que más riesgo tienen de perderse.
  const ordenadas = [...cs].sort((a, b) => a.estado_changed_at.localeCompare(b.estado_changed_at))
  const n = ordenadas.length
  const titulo = n === 1
    ? `Consulta sin movimiento: ${[ordenadas[0].apellido, ordenadas[0].nombre].filter(Boolean).join(', ')}`
    : `${n} consultas sin movimiento hace más de ${DIAS_SIN_MOVIMIENTO} días`
  const lineas = ordenadas.slice(0, MAX_EN_MENSAJE).map((c) => `• ${etiqueta(c)}`)
  if (n > MAX_EN_MENSAJE) lineas.push(`y ${n - MAX_EN_MENSAJE} más`)
  return {
    titulo,
    mensaje: lineas.join('\n'),
    url: n === 1 ? `/consultas/${ordenadas[0].id}` : '/consultas',
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })

  const cronKey = req.headers.get('x-cron-secret')
  if (!CRON_SECRET || cronKey !== CRON_SECRET) {
    return json(req, { error: 'Unauthorized' }, 401)
  }

  const body = await req.json().catch(() => ({})) as { dry_run?: boolean }
  const dryRun = body?.dry_run === true

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const limite = new Date(Date.now() - DIAS_SIN_MOVIMIENTO * 24 * 60 * 60 * 1000).toISOString()

  // Consultas activas, sin movimiento > 7 días, sin recordatorio reciente
  const { data: consultas, error } = await admin
    .from('consultas')
    .select('id, nombre, apellido, estado, assigned_to, estado_changed_at')
    .not('estado', 'in', `(${TERMINAL_ESTADOS.join(',')})`)
    .lt('estado_changed_at', limite)
    .or(`recordatorio_enviado_at.is.null,recordatorio_enviado_at.lt.${limite}`)

  if (error) {
    console.error('[consulta-recordatorio] query error:', error)
    return json(req, { error: error.message }, 500)
  }
  if (!consultas?.length) {
    console.log('[consulta-recordatorio] sin consultas estancadas')
    return json(req, { ok: true, dry_run: dryRun, consultas: 0, resumenes: 0 })
  }

  const { data: perfiles, error: perfErr } = await admin
    .from('profiles')
    .select('id, rol')
    .eq('activo', true)
  if (perfErr) {
    console.error('[consulta-recordatorio] profiles error:', perfErr)
    return json(req, { error: perfErr.message }, 500)
  }
  const activos = new Set((perfiles ?? []).map((p: { id: string }) => p.id))
  const directores = (perfiles ?? [])
    .filter((p: { rol: string }) => p.rol === 'DIRECTOR')
    .map((p: { id: string }) => p.id)

  // Un resumen por persona: directores ven todas, cada responsable las suyas.
  const porDestinatario = new Map<string, Consulta[]>()
  const agregar = (uid: string, c: Consulta) => {
    const lista = porDestinatario.get(uid) ?? []
    if (!lista.some((x) => x.id === c.id)) lista.push(c)
    porDestinatario.set(uid, lista)
  }
  for (const c of consultas as Consulta[]) {
    for (const uid of directores) agregar(uid, c)
    if (c.assigned_to && activos.has(c.assigned_to)) agregar(c.assigned_to, c)
  }

  if (dryRun) {
    return json(req, {
      ok: true,
      dry_run: true,
      consultas: consultas.length,
      resumenes: [...porDestinatario].map(([uid, cs]) => ({ usuario_id: uid, cantidad: cs.length, ...armarResumen(cs) })),
    })
  }

  const avisadas = new Set<string>()
  let enviados = 0
  for (const [uid, cs] of porDestinatario) {
    const { titulo, mensaje, url } = armarResumen(cs)
    const { error: alertaErr } = await admin.from('alertas').insert({
      tipo: 'SEGUIMIENTO_PENDIENTE',
      titulo,
      mensaje,
      destinatario_id: uid,
      prioridad: 'ALTA',
      payload: { consulta_ids: cs.map((c) => c.id), origen: 'consulta-recordatorio' },
    })
    if (alertaErr) {
      console.error(`[consulta-recordatorio] alerta ${uid}:`, alertaErr.message)
      continue
    }
    enviados++
    for (const c of cs) avisadas.add(c.id)

    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/dispatch-alert-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ tipo: 'SEGUIMIENTO_PENDIENTE', usuario_id: uid, titulo, mensaje, url }),
      })
      if (!r.ok) console.error(`[consulta-recordatorio] dispatch ${uid}: HTTP ${r.status}`)
    } catch (e) {
      console.error(`[consulta-recordatorio] dispatch ${uid}:`, e)
    }
  }

  // Solo se marcan las que efectivamente le llegaron a alguien.
  if (avisadas.size) {
    const { error: updErr } = await admin
      .from('consultas')
      .update({ recordatorio_enviado_at: new Date().toISOString() })
      .in('id', [...avisadas])
    if (updErr) console.error('[consulta-recordatorio] update error:', updErr)
  }

  console.log(`[consulta-recordatorio] ${consultas.length} estancadas, ${enviados} resúmenes, ${avisadas.size} marcadas`)
  return json(req, { ok: true, consultas: consultas.length, resumenes: enviados, marcadas: avisadas.size })
})

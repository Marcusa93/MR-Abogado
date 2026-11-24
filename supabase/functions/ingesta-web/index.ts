// Edge function: ingesta-web
//
// Recibe desde el sitio público (marcorossi.com.ar, funciones de Vercel del
// repo webabogado-produccion) las reservas de Cal.com y los mensajes del
// formulario de contacto, y los carga como consultas para que el equipo los
// vea en /consultas.
//
// Server-to-server, sin usuario. Auth: header `x-ingesta-secret` igual a
// WEB_INGEST_SECRET. Las consultas nuevas quedan creadas por
// WEB_INGEST_OWNER_ID (perfil de Marco) y sin responsable asignado.
//
// POST { tipo: 'reserva', evento: 'creada' | 'reprogramada' | 'cancelada',
//        uid, uid_anterior?, nombre, email?, telefono?, inicio?, titulo?,
//        respuestas?: [{ label, value }], area?, origen?, motivo? }
// POST { tipo: 'contacto', nombre, email, telefono?, mensaje }
//   → { ok, accion: 'creada' | 'actualizada' | 'duplicada' | 'sin_consulta', consulta_id? }
//
// Si la persona ya tiene una consulta abierta (mismo email, últimos 60 días),
// la novedad se agrega a esa consulta en lugar de crear otra.
// Las consultas nuevas o con novedades avisan a DIRECTOR y SECRETARIA activos
// (con el header `x-ingesta-prueba: 1`, solo al dueño y con título [Prueba]).
//
// Deploy con --no-verify-jwt.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const INGESTA_SECRET = Deno.env.get('WEB_INGEST_SECRET') ?? ''
const OWNER_ID = Deno.env.get('WEB_INGEST_OWNER_ID') ?? ''

const ESTADOS_CERRADOS = ['convertida', 'resuelta', 'descartada']
const VENTANA_DEDUP_DIAS = 60
const ROLES_AVISO = ['DIRECTOR', 'SECRETARIA']
const TZ = 'America/Argentina/Buenos_Aires'

// Áreas del sitio (webabogado-produccion/src/data/areas.ts) → tipo_asunto.
const AREAS_WEB: Record<string, { titulo: string; tipo: string }> = {
  'laboral-y-art': { titulo: 'Laboral y ART', tipo: 'laboral_trabajador' },
  'civil-y-danos': { titulo: 'Civil y daños', tipo: 'civil' },
  'penal': { titulo: 'Penal', tipo: 'penal' },
  'previsional': { titulo: 'Previsional', tipo: 'previsional' },
  'salud': { titulo: 'Salud', tipo: 'otro' },
  'empresas-y-sociedades': { titulo: 'Empresas y sociedades', tipo: 'otro' },
  'derecho-digital': { titulo: 'Derecho digital', tipo: 'otro' },
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

// ── Validación de entrada ──────────────────────────────────────────────────

function secretoValido(recibido: string | null): boolean {
  if (!recibido || !INGESTA_SECRET) return false
  const a = new TextEncoder().encode(recibido)
  const b = new TextEncoder().encode(INGESTA_SECRET)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

function texto(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function emailValido(v: unknown): string {
  const e = texto(v, 200).toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : ''
}

function fechaIso(v: unknown): string | null {
  const s = texto(v, 40)
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

interface Reserva {
  evento: 'creada' | 'reprogramada' | 'cancelada'
  uid: string
  uid_anterior: string
  nombre: string
  email: string
  telefono: string
  inicio: string | null
  titulo: string
  respuestas: { label: string; value: string }[]
  area: string
  origen: string
  motivo: string
}

interface Contacto {
  nombre: string
  email: string
  telefono: string
  mensaje: string
}

// deno-lint-ignore no-explicit-any
function leerReserva(b: any): Reserva | string {
  const evento = b.evento
  if (evento !== 'creada' && evento !== 'reprogramada' && evento !== 'cancelada') return 'evento inválido'
  const uid = texto(b.uid, 200)
  if (!uid) return 'falta uid'
  const respuestas = Array.isArray(b.respuestas)
    ? b.respuestas.slice(0, 20)
      // deno-lint-ignore no-explicit-any
      .map((r: any) => ({ label: texto(r?.label, 120), value: texto(r?.value, 2000) }))
      .filter((r: { label: string; value: string }) => r.label && r.value)
    : []
  return {
    evento,
    uid,
    uid_anterior: texto(b.uid_anterior, 200),
    nombre: texto(b.nombre, 120) || 'Sin nombre',
    email: emailValido(b.email),
    telefono: texto(b.telefono, 40),
    inicio: fechaIso(b.inicio),
    titulo: texto(b.titulo, 200),
    respuestas,
    area: texto(b.area, 60),
    origen: texto(b.origen, 80),
    motivo: texto(b.motivo, 500),
  }
}

// deno-lint-ignore no-explicit-any
function leerContacto(b: any): Contacto | string {
  const nombre = texto(b.nombre, 120)
  const email = emailValido(b.email)
  const mensaje = texto(b.mensaje, 4000)
  if (!nombre) return 'falta nombre'
  if (!email) return 'email inválido'
  if (!mensaje) return 'falta mensaje'
  return { nombre, email, telefono: texto(b.telefono, 40), mensaje }
}

// ── Helpers de formato ─────────────────────────────────────────────────────

function dividirNombre(completo: string): { nombre: string; apellido: string | null } {
  const partes = completo.split(/\s+/).filter(Boolean)
  if (partes.length <= 1) return { nombre: partes[0] ?? 'Sin nombre', apellido: null }
  return { nombre: partes[0], apellido: partes.slice(1).join(' ') }
}

function fechaAR(iso: string | null): string {
  if (!iso) return 'sin fecha'
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

function bloqueNota(titulo: string, lineas: string[]): string {
  const sello = new Intl.DateTimeFormat('es-AR', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date())
  return [`— ${titulo} (${sello}) —`, ...lineas.filter((l) => l !== '')].join('\n')
}

function anexar(previas: string | null, bloque: string): string {
  return previas?.trim() ? `${previas.trim()}\n\n${bloque}` : bloque
}

function lineasReserva(d: Reserva): string[] {
  const area = AREAS_WEB[d.area]
  return [
    `Turno: ${fechaAR(d.inicio)}`,
    d.titulo ? `Evento: ${d.titulo}` : '',
    d.telefono ? `Teléfono: ${d.telefono}` : '',
    area ? `Área elegida en la web: ${area.titulo}` : '',
    d.origen ? `Reservó desde: ${d.origen}` : '',
    ...d.respuestas.map((r) => `${r.label}: ${r.value}`),
  ]
}

// ── Acceso a consultas ─────────────────────────────────────────────────────

interface ConsultaMin {
  id: string
  nombre: string
  apellido: string | null
  telefono: string | null
  estado: string
  fecha_turno: string | null
  notas_libres: string | null
}

const COLS = 'id, nombre, apellido, telefono, estado, fecha_turno, notas_libres'

async function porUid(admin: Admin, uid: string): Promise<ConsultaMin | null> {
  if (!uid) return null
  const { data, error } = await admin.from('consultas').select(COLS).eq('cal_booking_uid', uid).maybeSingle()
  if (error) throw error
  return data as ConsultaMin | null
}

async function abiertaPorEmail(admin: Admin, email: string): Promise<ConsultaMin | null> {
  if (!email) return null
  const desde = new Date(Date.now() - VENTANA_DEDUP_DIAS * 24 * 60 * 60 * 1000).toISOString()
  const patron = email.replace(/[\\%_]/g, (c) => `\\${c}`)
  const { data, error } = await admin.from('consultas')
    .select(COLS)
    .ilike('email', patron)
    .not('estado', 'in', `(${ESTADOS_CERRADOS.join(',')})`)
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error
  return (data?.[0] as ConsultaMin | undefined) ?? null
}

async function actualizar(admin: Admin, id: string, cambios: Record<string, unknown>) {
  const { error } = await admin.from('consultas')
    .update({ ...cambios, last_activity_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

async function insertar(admin: Admin, fila: Record<string, unknown>): Promise<string | null> {
  const ahora = new Date().toISOString()
  const { data, error } = await admin.from('consultas')
    .insert({ ...fila, estado: 'pendiente', created_by: OWNER_ID, last_activity_at: ahora })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') return null // misma reserva cargada en paralelo
    throw error
  }
  return data.id as string
}

// ── Casos ──────────────────────────────────────────────────────────────────

interface Resultado {
  accion: 'creada' | 'actualizada' | 'duplicada' | 'sin_consulta'
  consulta_id?: string
  aviso?: { titulo: string; mensaje: string }
}

function nombreDe(c: { nombre: string; apellido: string | null }): string {
  return [c.nombre, c.apellido].filter(Boolean).join(' ')
}

async function reservaCreada(admin: Admin, d: Reserva): Promise<Resultado> {
  const previa = await porUid(admin, d.uid)
  if (previa) return { accion: 'duplicada', consulta_id: previa.id }

  // Cal.com a veces informa una reprogramación como BOOKING_CREATED + rescheduleUid.
  const anterior = await porUid(admin, d.uid_anterior)
  if (anterior) return reprogramar(admin, anterior, d)

  const bloque = bloqueNota('Turno reservado en la web', lineasReserva(d))
  const abierta = await abiertaPorEmail(admin, d.email)
  if (abierta) {
    await actualizar(admin, abierta.id, {
      fecha_turno: d.inicio,
      cal_booking_uid: d.uid,
      telefono: abierta.telefono ?? (d.telefono || null),
      notas_libres: anexar(abierta.notas_libres, bloque),
    })
    return {
      accion: 'actualizada',
      consulta_id: abierta.id,
      aviso: { titulo: `Novedad web: ${nombreDe(abierta)}`, mensaje: `Reservó turno para el ${fechaAR(d.inicio)}.` },
    }
  }

  const { nombre, apellido } = dividirNombre(d.nombre)
  const tipo = AREAS_WEB[d.area]?.tipo ?? 'otro'
  const id = await insertar(admin, {
    nombre, apellido,
    email: d.email || null,
    telefono: d.telefono || null,
    canal: 'turno',
    tipo_asunto: tipo,
    areas_derecho: [tipo],
    notas_libres: bloque,
    fecha_turno: d.inicio,
    cal_booking_uid: d.uid,
  })
  if (!id) {
    const ya = await porUid(admin, d.uid)
    return { accion: 'duplicada', consulta_id: ya?.id }
  }
  return {
    accion: 'creada',
    consulta_id: id,
    aviso: { titulo: `Nueva consulta web: ${d.nombre}`, mensaje: `Reservó turno para el ${fechaAR(d.inicio)}.` },
  }
}

async function reprogramar(admin: Admin, c: ConsultaMin, d: Reserva): Promise<Resultado> {
  await actualizar(admin, c.id, {
    fecha_turno: d.inicio,
    cal_booking_uid: d.uid,
    notas_libres: anexar(c.notas_libres, bloqueNota('Turno reprogramado por el cliente', [
      `Antes: ${fechaAR(c.fecha_turno)}`,
      `Ahora: ${fechaAR(d.inicio)}`,
      d.motivo ? `Motivo: ${d.motivo}` : '',
    ])),
  })
  return { accion: 'actualizada', consulta_id: c.id }
}

async function reservaReprogramada(admin: Admin, d: Reserva): Promise<Resultado> {
  const c = (await porUid(admin, d.uid_anterior)) ?? (await porUid(admin, d.uid))
  // Si no la teníamos (reserva anterior a la integración), se carga como nueva.
  if (!c) return reservaCreada(admin, { ...d, uid_anterior: '' })
  return reprogramar(admin, c, d)
}

async function reservaCancelada(admin: Admin, d: Reserva): Promise<Resultado> {
  const c = (await porUid(admin, d.uid)) ?? (await porUid(admin, d.uid_anterior))
  if (!c) return { accion: 'sin_consulta' }
  const cambios: Record<string, unknown> = {
    fecha_turno: null,
    notas_libres: anexar(c.notas_libres, bloqueNota('Turno cancelado por el cliente en Cal.com', [
      `Era: ${fechaAR(c.fecha_turno)}`,
      d.motivo ? `Motivo: ${d.motivo}` : '',
    ])),
  }
  // Solo se descarta si nadie la tomó todavía; si ya está en curso, queda como está.
  if (c.estado === 'pendiente') {
    cambios.estado = 'descartada'
    cambios.estado_notas = 'Cancelada por el cliente en Cal.com'
    cambios.estado_changed_at = new Date().toISOString()
  }
  await actualizar(admin, c.id, cambios)
  return { accion: 'actualizada', consulta_id: c.id }
}

async function contacto(admin: Admin, d: Contacto): Promise<Resultado> {
  const bloque = bloqueNota('Mensaje desde el formulario web', [
    d.telefono ? `Teléfono: ${d.telefono}` : '',
    d.mensaje,
  ])
  const abierta = await abiertaPorEmail(admin, d.email)
  if (abierta) {
    await actualizar(admin, abierta.id, {
      telefono: abierta.telefono ?? (d.telefono || null),
      notas_libres: anexar(abierta.notas_libres, bloque),
    })
    return {
      accion: 'actualizada',
      consulta_id: abierta.id,
      aviso: { titulo: `Novedad web: ${nombreDe(abierta)}`, mensaje: 'Mandó un mensaje nuevo desde el formulario del sitio.' },
    }
  }

  const { nombre, apellido } = dividirNombre(d.nombre)
  const id = await insertar(admin, {
    nombre, apellido,
    email: d.email,
    telefono: d.telefono || null,
    canal: 'web',
    tipo_asunto: 'otro',
    areas_derecho: ['otro'],
    notas_libres: bloque,
  })
  return {
    accion: 'creada',
    consulta_id: id ?? undefined,
    aviso: { titulo: `Nueva consulta web: ${d.nombre}`, mensaje: 'Dejó un mensaje en el formulario del sitio.' },
  }
}

// ── Aviso al equipo ────────────────────────────────────────────────────────

// En modo prueba (header x-ingesta-prueba: 1) solo se avisa al dueño.
async function destinatarios(admin: Admin, prueba: boolean): Promise<{ id: string }[]> {
  if (prueba) return [{ id: OWNER_ID }]
  const { data, error } = await admin.from('profiles')
    .select('id').in('rol', ROLES_AVISO).eq('activo', true)
  if (error) { console.error('[ingesta-web] perfiles:', error.message); return [] }
  return data ?? []
}

async function avisarEquipo(admin: Admin, consultaId: string, titulo: string, mensaje: string, prueba: boolean) {
  const perfiles = await destinatarios(admin, prueba)
  if (prueba) titulo = `[Prueba] ${titulo}`

  const url = `/consultas/${consultaId}`
  await Promise.allSettled(perfiles.map(async ({ id }) => {
    const { error: alertaErr } = await admin.from('alertas').insert({
      tipo: 'SEGUIMIENTO_PENDIENTE',
      titulo,
      mensaje,
      destinatario_id: id,
      prioridad: 'ALTA',
      payload: { consulta_id: consultaId, origen: 'web' },
    })
    if (alertaErr) console.error(`[ingesta-web] alerta ${id}:`, alertaErr.message)

    const r = await fetch(`${SUPABASE_URL}/functions/v1/dispatch-alert-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ tipo: 'SEGUIMIENTO_PENDIENTE', usuario_id: id, titulo, mensaje, url }),
    })
    if (!r.ok) console.error(`[ingesta-web] dispatch ${id}: HTTP ${r.status}`)
  }))
}

// ── Handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'Método no permitido' }, 405)
  if (!secretoValido(req.headers.get('x-ingesta-secret'))) return json(req, { error: 'No autorizado' }, 401)
  if (!OWNER_ID) return json(req, { error: 'WEB_INGEST_OWNER_ID no configurado' }, 500)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return json(req, { error: 'Body inválido' }, 400)

  const admin: Admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  try {
    let r: Resultado
    if (body.tipo === 'reserva') {
      const d = leerReserva(body)
      if (typeof d === 'string') return json(req, { error: d }, 400)
      r = d.evento === 'creada' ? await reservaCreada(admin, d)
        : d.evento === 'reprogramada' ? await reservaReprogramada(admin, d)
        : await reservaCancelada(admin, d)
    } else if (body.tipo === 'contacto') {
      const d = leerContacto(body)
      if (typeof d === 'string') return json(req, { error: d }, 400)
      r = await contacto(admin, d)
    } else {
      return json(req, { error: 'tipo inválido' }, 400)
    }

    if (r.aviso && r.consulta_id) {
      const prueba = req.headers.get('x-ingesta-prueba') === '1'
      const tarea = avisarEquipo(admin, r.consulta_id, r.aviso.titulo, r.aviso.mensaje, prueba)
        .catch((e) => console.error('[ingesta-web] aviso:', e))
      // Responder sin esperar push/email; el runtime mantiene viva la tarea.
      // deno-lint-ignore no-explicit-any
      const runtime = (globalThis as any).EdgeRuntime
      if (runtime?.waitUntil) runtime.waitUntil(tarea)
      else await tarea
    }

    console.log(`[ingesta-web] ${body.tipo}/${body.evento ?? '-'} → ${r.accion} ${r.consulta_id ?? ''}`)
    return json(req, { ok: true, accion: r.accion, consulta_id: r.consulta_id })
  } catch (e) {
    console.error('[ingesta-web] error:', e instanceof Error ? e.message : e)
    return json(req, { error: 'Error interno' }, 500)
  }
})

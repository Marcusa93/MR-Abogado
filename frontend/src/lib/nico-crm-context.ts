// ---------------------------------------------------------------------------
// CRM Context builder for BogaBot IA
// Fetches real data from Supabase and returns pre-calculated summaries
// that the LLM can cite directly for accurate answers.
// IMPORTANT: PII (DNI, CUIL, phone, email, address) is stripped.
// ---------------------------------------------------------------------------

import { createClient } from '@/lib/supabase/client'
import {
  ESTADO_INTERNO_LABELS,
  ESTADOS_TERMINALES,
  type EstadoInterno,
} from '@/types/enums'

function estadoLabel(estado: string): string {
  return ESTADO_INTERNO_LABELS[estado as EstadoInterno] ?? estado
}

function clienteName(cli: any): string {
  if (!cli) return 'Sin cliente'
  return `${cli.apellido ?? ''} ${cli.nombre ?? ''}`.trim() || 'Sin nombre'
}

export interface ContextUserInfo {
  userId?: string
  userRol?: string
  /** Si es staff letrado (Admin, Abogado), ve todos los expedientes. */
  isStaff?: boolean
}

/**
 * Fetches complete CRM context with pre-calculated summaries.
 */
export async function fetchDashboardContext(userInfo?: ContextUserInfo): Promise<string> {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]

  const [expedientesRes, tareasRes, audienciasRes, alertasRes, seguimientosRes, finalizadosRes] = await Promise.all([
    supabase
      .from('expedientes')
      .select(`
        id, numero, caratula, estado_interno, prioridad, fecha_alta, observaciones,
        clientes!expedientes_cliente_id_fkey (apellido, nombre),
        tipos_tramite!expedientes_tipo_tramite_id_fkey (nombre),
        miembros:expediente_miembros (rol, perfil:profiles!expediente_miembros_profile_id_fkey (nombre, apellido))
      `)
      .is('deleted_at', null)
      .order('fecha_alta', { ascending: false })
      .limit(500),

    supabase
      .from('tareas')
      .select(`
        id, titulo, estado, prioridad, fecha_vencimiento, descripcion,
        expediente:expedientes!tareas_expediente_id_fkey (numero, caratula, clientes!expedientes_cliente_id_fkey (apellido, nombre)),
        asignado:profiles!tareas_asignado_a_fkey (nombre, apellido)
      `)
      .in('estado', ['PENDIENTE', 'EN_PROGRESO'])
      .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
      .limit(200),

    supabase
      .from('audiencias')
      .select(`
        id, fecha, hora, estado, notas, sala, magistrado,
        tipo_audiencia:catalogo_tipos_audiencia!audiencias_tipo_audiencia_id_fkey (nombre),
        organismo:organismos!audiencias_organismo_id_fkey (nombre),
        expediente:expedientes!audiencias_expediente_id_fkey (numero, caratula, clientes!expedientes_cliente_id_fkey (apellido, nombre))
      `)
      .gte('fecha', today)
      .in('estado', ['PENDIENTE', 'CONFIRMADA'])
      .order('fecha', { ascending: true })
      .limit(50),

    supabase
      .from('alertas')
      .select(`
        id, titulo, tipo, prioridad, fecha_vencimiento, mensaje,
        expediente:expedientes!alertas_expediente_id_fkey (caratula, clientes!expedientes_cliente_id_fkey (apellido, nombre))
      `)
      .is('resuelta_at', null)
      .order('created_at', { ascending: false })
      .limit(30),

    supabase
      .from('seguimientos')
      .select(`
        id, fecha_control, estado_organismo_reportado, canal, observacion, proxima_fecha_control,
        expediente:expedientes!seguimientos_expediente_id_fkey (caratula, clientes!expedientes_cliente_id_fkey (apellido, nombre))
      `)
      .order('fecha_control', { ascending: false })
      .limit(30),

    // Expedientes finalizados para tiempo promedio de resolución
    supabase
      .from('expedientes')
      .select('created_at, updated_at')
      .in('estado_interno', [...ESTADOS_TERMINALES])
      .is('deleted_at', null)
      .limit(200),
  ])

  const expedientes = (expedientesRes.data ?? []) as any[]
  const tareas = (tareasRes.data ?? []) as any[]
  const audiencias = (audienciasRes.data ?? []) as any[]
  const alertas = (alertasRes.data ?? []) as any[]
  const seguimientos = (seguimientosRes.data ?? []) as any[]
  const finalizados = (finalizadosRes.data ?? []) as any[]

  // Average resolution time (days)
  let tiempoPromedioResolucion: number | null = null
  if (finalizados.length > 0) {
    const totalDias = finalizados.reduce((sum: number, e: any) => {
      if (!e.created_at || !e.updated_at) return sum
      const dias = Math.floor((new Date(e.updated_at).getTime() - new Date(e.created_at).getTime()) / 86400000)
      return sum + Math.max(dias, 0)
    }, 0)
    tiempoPromedioResolucion = Math.round(totalDias / finalizados.length)
  }

  // Stalled expedientes (>30 days in same state, excluding terminal states)
  const estancados = expedientes.filter((e: any) => {
    if (ESTADOS_TERMINALES.includes(e.estado_interno as any)) return false
    if (!e.updated_at) return false
    const dias = Math.floor((Date.now() - new Date(e.updated_at).getTime()) / 86400000)
    return dias > 30
  })

  // ---- PRE-CALCULATED SUMMARIES ----

  // Estado counts
  const estadoCounts: Record<string, number> = {}
  for (const e of expedientes) {
    const label = estadoLabel(e.estado_interno)
    estadoCounts[label] = (estadoCounts[label] || 0) + 1
  }

  // Priority counts
  const prioCounts: Record<string, number> = {}
  for (const e of expedientes) {
    prioCounts[e.prioridad] = (prioCounts[e.prioridad] || 0) + 1
  }

  // Without responsible (no abogado member)
  const sinResponsable = expedientes.filter(
    (e: any) => !(e.miembros as any[])?.some((m: any) => m.rol === 'abogado')
  ).length

  // Tipo tramite counts
  const tipoCounts: Record<string, number> = {}
  for (const e of expedientes) {
    const tipo = (e.tipos_tramite as any)?.nombre ?? 'Sin tipo'
    tipoCounts[tipo] = (tipoCounts[tipo] || 0) + 1
  }

  // Overdue tasks
  const tareasVencidas = tareas
    .filter((t: any) => t.fecha_vencimiento && t.fecha_vencimiento < today)
    .map((t: any) => ({
      ...t,
      dias_atraso: Math.floor((new Date(today).getTime() - new Date(t.fecha_vencimiento).getTime()) / 86400000),
    }))
    .sort((a: any, b: any) => b.dias_atraso - a.dias_atraso)
  const tareasHoy = tareas.filter((t: any) => t.fecha_vencimiento === today)

  const in48h = new Date(today)
  in48h.setDate(in48h.getDate() + 2)
  const in48hStr = in48h.toISOString().split('T')[0]
  const tareasProximas48h = tareas.filter(
    (t: any) => t.fecha_vencimiento && t.fecha_vencimiento > today && t.fecha_vencimiento <= in48hStr
  )

  // Tasks by assignee
  const tareasPorAsignado: Record<string, number> = {}
  for (const t of tareas) {
    const asig = t.asignado as any
    const name = asig ? `${asig.nombre} ${asig.apellido}` : 'Sin asignar'
    tareasPorAsignado[name] = (tareasPorAsignado[name] || 0) + 1
  }

  // Nearest audiencia
  const audienciaProxima = audiencias.length > 0 ? audiencias[0] : null

  const parts: string[] = []

  // ---- RESUMEN EJECUTIVO ----
  parts.push('=== RESUMEN EJECUTIVO DEL ESTUDIO ===')
  parts.push(`Fecha de hoy: ${today}`)
  parts.push(`Total expedientes activos: ${expedientes.length}`)
  parts.push(`Expedientes cerrados/finalizados: ${finalizados.length}`)
  parts.push(`Expedientes sin abogado asignado: ${sinResponsable}`)
  if (tiempoPromedioResolucion !== null) {
    parts.push(`Tiempo promedio de resolución: ${tiempoPromedioResolucion} días`)
  }
  if (estancados.length > 0) {
    parts.push(`⚠ Expedientes estancados (>30 días sin cambio de estado): ${estancados.length}`)
  }
  parts.push('')

  parts.push('Expedientes por estado:')
  for (const [estado, count] of Object.entries(estadoCounts).sort((a, b) => b[1] - a[1])) {
    parts.push(`  ${estado}: ${count}`)
  }
  parts.push('')

  parts.push('Expedientes por prioridad:')
  for (const [prio, count] of Object.entries(prioCounts)) {
    parts.push(`  ${prio}: ${count}`)
  }
  parts.push('')

  parts.push('Expedientes por tipo de trámite:')
  for (const [tipo, count] of Object.entries(tipoCounts).sort((a, b) => b[1] - a[1])) {
    parts.push(`  ${tipo}: ${count}`)
  }
  parts.push('')

  // ---- TAREAS ----
  parts.push(`=== TAREAS ===`)
  parts.push(`Total tareas pendientes/en progreso: ${tareas.length}`)
  parts.push(`Tareas vencidas: ${tareasVencidas.length}`)
  parts.push(`Tareas que vencen hoy: ${tareasHoy.length}`)
  parts.push(`Tareas que vencen en las próximas 48h: ${tareasProximas48h.length}`)
  parts.push('')

  if (Object.keys(tareasPorAsignado).length > 0) {
    parts.push('Tareas por responsable:')
    for (const [nombre, count] of Object.entries(tareasPorAsignado).sort((a, b) => b[1] - a[1])) {
      parts.push(`  ${nombre}: ${count} pendientes`)
    }
    parts.push('')
  }

  if (tareasVencidas.length > 0) {
    parts.push('Detalle tareas vencidas (ordenadas por urgencia):')
    for (const t of tareasVencidas.slice(0, 15)) {
      const exp = t.expediente as any
      const cli = exp?.clientes as any
      const asig = t.asignado as any
      parts.push(`  - "${t.titulo}" — Cliente: ${clienteName(cli)} — Venció: ${t.fecha_vencimiento} (${t.dias_atraso} días de atraso) — Prioridad: ${t.prioridad}${asig ? ` — Asignada a: ${asig.nombre} ${asig.apellido}` : ''}`)
    }
    parts.push('')
  }

  if (tareasProximas48h.length > 0) {
    parts.push('Tareas que vencen en las próximas 48 horas:')
    for (const t of tareasProximas48h) {
      const exp = t.expediente as any
      const cli = exp?.clientes as any
      const asig = t.asignado as any
      parts.push(`  - "${t.titulo}" — Cliente: ${clienteName(cli)} — Vence: ${t.fecha_vencimiento} — Prioridad: ${t.prioridad}${asig ? ` — Asignada a: ${asig.nombre} ${asig.apellido}` : ''}`)
    }
    parts.push('')
  }

  if (tareas.length > 0) {
    parts.push('Todas las tareas pendientes:')
    for (const t of tareas) {
      const exp = t.expediente as any
      const cli = exp?.clientes as any
      const asig = t.asignado as any
      parts.push(`  - [${t.estado}] "${t.titulo}" — Cliente: ${clienteName(cli)} — Prioridad: ${t.prioridad}${t.fecha_vencimiento ? ` — Vence: ${t.fecha_vencimiento}` : ' — Sin vencimiento'}${asig ? ` — Asignada a: ${asig.nombre} ${asig.apellido}` : ' — Sin asignar'}`)
    }
    parts.push('')
  }

  // ---- AUDIENCIAS PRÓXIMAS ----
  parts.push(`=== AUDIENCIAS PRÓXIMAS ===`)
  parts.push(`Total audiencias próximas: ${audiencias.length}`)

  if (audienciaProxima) {
    const aExp = audienciaProxima.expediente as any
    const aCli = aExp?.clientes as any
    const aTipo = (audienciaProxima.tipo_audiencia as any)?.nombre ?? 'N/A'
    const aOrg = (audienciaProxima.organismo as any)?.nombre
    parts.push(`Próxima audiencia: ${audienciaProxima.fecha}${audienciaProxima.hora ? ` a las ${audienciaProxima.hora}` : ''} — Cliente: ${clienteName(aCli)} — Tipo: ${aTipo}${aOrg ? ` — Organismo: ${aOrg}` : ''}`)
  }
  parts.push('')

  if (audiencias.length > 0) {
    parts.push('Detalle de audiencias:')
    for (const a of audiencias) {
      const exp = a.expediente as any
      const cli = exp?.clientes as any
      const tipo = (a.tipo_audiencia as any)?.nombre ?? 'N/A'
      const org = (a.organismo as any)?.nombre
      parts.push(`  - ${a.fecha}${a.hora ? ` ${a.hora}` : ''} — ${tipo} (${a.estado}) — Cliente: ${clienteName(cli)}${org ? ` — Organismo: ${org}` : ''}${a.sala ? ` — Sala: ${a.sala}` : ''}${a.magistrado ? ` — Magistrado: ${a.magistrado}` : ''}${a.notas ? ` — Notas: ${a.notas}` : ''}`)
    }
    parts.push('')
  }

  // ---- ALERTAS ----
  parts.push(`=== ALERTAS ACTIVAS ===`)
  parts.push(`Total alertas no leídas: ${alertas.length}`)
  parts.push('')

  if (alertas.length > 0) {
    for (const a of alertas) {
      const exp = a.expediente as any
      const cli = exp?.clientes as any
      parts.push(`  - [${a.tipo}] ${a.titulo} — Cliente: ${clienteName(cli)} — Prioridad: ${a.prioridad}${a.fecha_vencimiento ? ` — Vence: ${a.fecha_vencimiento}` : ''}${a.mensaje ? ` — ${a.mensaje}` : ''}`)
    }
    parts.push('')
  }

  // ---- SEGUIMIENTOS RECIENTES ----
  if (seguimientos.length > 0) {
    parts.push(`=== SEGUIMIENTOS RECIENTES (últimos ${seguimientos.length}) ===`)
    for (const s of seguimientos.slice(0, 15)) {
      const exp = s.expediente as any
      const cli = exp?.clientes as any
      parts.push(`  - ${s.fecha_control} — Cliente: ${clienteName(cli)} — Canal: ${s.canal} — Estado organismo: ${s.estado_organismo_reportado ?? 'N/A'}${s.observacion ? ` — Obs: ${s.observacion}` : ''}${s.proxima_fecha_control ? ` — Próximo control: ${s.proxima_fecha_control}` : ''}`)
    }
    parts.push('')
  }

  // ---- EXPEDIENTES ESTANCADOS ----
  if (estancados.length > 0) {
    parts.push(`=== EXPEDIENTES ESTANCADOS (>30 días sin cambio) ===`)
    for (const e of estancados.slice(0, 15)) {
      const cli = e.clientes as any
      const dias = Math.floor((Date.now() - new Date(e.updated_at).getTime()) / 86400000)
      const abog = (e.miembros as any[])?.find((m: any) => m.rol === 'abogado')?.perfil as any
      parts.push(`  - ${clienteName(cli)} — ${estadoLabel(e.estado_interno)} — ${dias} días sin cambio — Responsable: ${abog ? `${abog.nombre} ${abog.apellido}` : 'Sin asignar'}`)
    }
    parts.push('')
  }

  // ---- LISTADO DE EXPEDIENTES ----
  parts.push(`=== LISTADO DE EXPEDIENTES (${expedientes.length}) ===`)
  const sorted = [...expedientes].sort((a: any, b: any) => {
    const na = clienteName(a.clientes)
    const nb = clienteName(b.clientes)
    return na.localeCompare(nb)
  })

  for (const e of sorted) {
    const cli = e.clientes as any
    const tipo = (e.tipos_tramite as any)?.nombre ?? ''
    const abog = (e.miembros as any[])?.find((m: any) => m.rol === 'abogado')?.perfil as any
    const abogStr = abog ? `${abog.nombre} ${abog.apellido}` : 'Sin asignar'
    parts.push(`  ${clienteName(cli)} — ${estadoLabel(e.estado_interno)} — ${tipo} — Prioridad: ${e.prioridad} — Responsable: ${abogStr}${e.observaciones ? ` — Obs: ${e.observaciones.slice(0, 80)}` : ''}`)
  }

  return parts.join('\n')
}

/**
 * Fetches detail data for a specific expediente. PII is stripped.
 */
export async function fetchExpedienteContext(expedienteId: string): Promise<string> {
  const supabase = createClient()

  const { data } = await supabase
    .from('expedientes')
    .select(`
      id, numero, caratula, estado_interno, prioridad, observaciones,
      fuero, fecha_alta, fecha_inicio_proceso, fecha_resolucion,
      numero_sae, estado_sae,
      created_at, updated_at,
      clientes!expedientes_cliente_id_fkey (nombre, apellido),
      tipos_tramite!expedientes_tipo_tramite_id_fkey (nombre),
      organismo:organismos!expedientes_organismo_id_fkey (nombre, tipo),
      miembros:expediente_miembros (rol, perfil:profiles!expediente_miembros_profile_id_fkey (nombre, apellido, rol)),
      audiencias (
        id, fecha, hora, estado, notas, sala, magistrado,
        tipo_audiencia:catalogo_tipos_audiencia!audiencias_tipo_audiencia_id_fkey (nombre)
      ),
      seguimientos (
        id, fecha_control, canal, estado_organismo_reportado, observacion, proxima_fecha_control
      ),
      tareas (
        id, titulo, estado, prioridad, fecha_vencimiento, descripcion,
        asignado:profiles!tareas_asignado_a_fkey (nombre, apellido)
      )
    `)
    .eq('id', expedienteId)
    .single()

  if (!data) return 'No se encontró el expediente solicitado.'

  const exp = data as any
  const c = exp.clientes as any
  const abog = (exp.miembros as any[])?.find((m: any) => m.rol === 'abogado')?.perfil as any
  const org = exp.organismo as any

  const parts: string[] = [
    `=== EXPEDIENTE EN DETALLE ===`,
    `Cliente: ${clienteName(c)}`,
    `Carátula: ${exp.caratula ?? 'Sin carátula'}`,
    `Estado: ${estadoLabel(exp.estado_interno)}`,
    `Prioridad: ${exp.prioridad}`,
    `Tipo trámite: ${(exp.tipos_tramite as any)?.nombre ?? 'N/A'}`,
    `Fuero: ${exp.fuero ?? 'N/A'}`,
    `Organismo: ${org ? `${org.nombre} (${org.tipo})` : 'Sin organismo'}`,
    `Responsable (abogado): ${abog ? `${abog.nombre} ${abog.apellido}` : 'Sin asignar'}`,
    `Número: ${exp.numero}`,
    `Número SAE: ${exp.numero_sae ?? 'N/A'}`,
    `Estado SAE: ${exp.estado_sae ?? 'N/A'}`,
    `Fecha alta: ${exp.fecha_alta ?? 'N/A'}`,
    `Fecha inicio proceso: ${exp.fecha_inicio_proceso ?? 'N/A'}`,
    `Observaciones: ${exp.observaciones || 'Ninguna'}`,
    `Creado: ${exp.created_at?.split('T')[0] ?? 'N/A'}`,
    `Última actualización: ${exp.updated_at?.split('T')[0] ?? 'N/A'}`,
  ]

  if (exp.updated_at) {
    const diasEnEstado = Math.floor((Date.now() - new Date(exp.updated_at).getTime()) / 86400000)
    parts.push(`Días en estado actual: ${diasEnEstado}${diasEnEstado > 30 ? ' ⚠ (estancado)' : ''}`)
  }

  // Team members
  const miembros = (exp.miembros as any[]) ?? []
  if (miembros.length > 0) {
    const abogados = miembros.filter((m: any) => m.rol === 'abogado').map((m: any) => `${m.perfil?.nombre} ${m.perfil?.apellido}`)
    const colabs = miembros.filter((m: any) => m.rol === 'colaborador').map((m: any) => `${m.perfil?.nombre} ${m.perfil?.apellido}`)
    if (abogados.length > 0) parts.push(`Abogados: ${abogados.join(', ')}`)
    if (colabs.length > 0) parts.push(`Colaboradores: ${colabs.join(', ')}`)
  }

  // "Next action" inference
  const allTareas = (exp.tareas as any[]) ?? []
  const allAudiencias = (exp.audiencias as any[]) ?? []
  const allSegs = (exp.seguimientos as any[]) ?? []
  const todayStr = new Date().toISOString().split('T')[0]

  const tareasPend = allTareas.filter((t: any) => t.estado === 'PENDIENTE' || t.estado === 'EN_PROGRESO')
  const tareasVencidasExp = tareasPend.filter((t: any) => t.fecha_vencimiento && t.fecha_vencimiento < todayStr)
  const proximaTarea = tareasPend
    .filter((t: any) => t.fecha_vencimiento && t.fecha_vencimiento >= todayStr)
    .sort((a: any, b: any) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento))[0]
  const proximaAudienciaExp = allAudiencias
    .filter((a: any) => a.estado !== 'CANCELADA' && a.fecha >= todayStr)
    .sort((a: any, b: any) => a.fecha.localeCompare(b.fecha))[0]
  const ultimoSeg = allSegs.sort((a: any, b: any) => b.fecha_control.localeCompare(a.fecha_control))[0]

  parts.push('')
  parts.push('PRÓXIMA ACCIÓN SUGERIDA:')
  if (tareasVencidasExp.length > 0) {
    parts.push(`  ⚠ Hay ${tareasVencidasExp.length} tarea(s) vencida(s) que requieren atención inmediata.`)
  }
  if (proximaAudienciaExp) {
    const tipoAud = (proximaAudienciaExp.tipo_audiencia as any)?.nombre ?? 'Audiencia'
    parts.push(`  📅 Próxima audiencia: ${proximaAudienciaExp.fecha}${proximaAudienciaExp.hora ? ` a las ${proximaAudienciaExp.hora}` : ''} — ${tipoAud}`)
  }
  if (proximaTarea) {
    parts.push(`  📋 Próxima tarea: "${proximaTarea.titulo}" vence ${proximaTarea.fecha_vencimiento}`)
  }
  if (ultimoSeg?.proxima_fecha_control) {
    parts.push(`  🔄 Próximo seguimiento programado: ${ultimoSeg.proxima_fecha_control}`)
  }
  if (!proximaAudienciaExp && !proximaTarea && tareasVencidasExp.length === 0) {
    parts.push(`  No hay acciones pendientes programadas.`)
  }

  // Seguimientos
  if (allSegs.length > 0) {
    parts.push(`\nSEGUIMIENTOS (${allSegs.length}):`)
    for (const s of allSegs.slice(-10)) {
      parts.push(`  - ${s.fecha_control} — Canal: ${s.canal} — Estado organismo: ${s.estado_organismo_reportado ?? 'N/A'}${s.observacion ? ` — ${s.observacion}` : ''}${s.proxima_fecha_control ? ` — Próximo: ${s.proxima_fecha_control}` : ''}`)
    }
  }

  // Audiencias
  if (allAudiencias.length > 0) {
    parts.push(`\nAUDIENCIAS (${allAudiencias.length}):`)
    for (const a of allAudiencias) {
      const tipo = (a.tipo_audiencia as any)?.nombre ?? 'N/A'
      parts.push(`  - ${a.fecha}${a.hora ? ` ${a.hora}` : ''} — ${tipo} — ${a.estado}${a.sala ? ` — Sala: ${a.sala}` : ''}${a.magistrado ? ` — ${a.magistrado}` : ''}${a.notas ? ` — ${a.notas}` : ''}`)
    }
  }

  // Tareas
  if (allTareas.length > 0) {
    parts.push(`\nTAREAS (${allTareas.length}):`)
    for (const t of allTareas) {
      const asig = t.asignado as any
      parts.push(`  - [${t.estado}] "${t.titulo}" — Prioridad: ${t.prioridad}${t.fecha_vencimiento ? ` — Vence: ${t.fecha_vencimiento}` : ''}${asig ? ` — Asignada a: ${asig.nombre} ${asig.apellido}` : ''}${t.descripcion ? ` — ${t.descripcion.slice(0, 80)}` : ''}`)
    }
  }

  return parts.join('\n')
}

/**
 * Fetches detail data for a specific client. PII is stripped.
 */
export async function fetchClienteContext(clienteId: string): Promise<string> {
  const supabase = createClient()

  const { data: clienteData } = await supabase
    .from('clientes')
    .select('id, nombre, apellido, notas')
    .eq('id', clienteId)
    .single()

  if (!clienteData) return 'No se encontró el cliente solicitado.'

  const cliente = clienteData as any

  const parts: string[] = [
    `=== CLIENTE EN DETALLE ===`,
    `Nombre: ${cliente.apellido} ${cliente.nombre}`,
  ]
  if (cliente.notas) parts.push(`Notas: ${cliente.notas}`)

  const { data: expedientes } = await supabase
    .from('expedientes')
    .select(`
      id, numero, caratula, estado_interno, prioridad, observaciones,
      tipos_tramite!expedientes_tipo_tramite_id_fkey (nombre),
      miembros:expediente_miembros (rol, perfil:profiles!expediente_miembros_profile_id_fkey (nombre, apellido))
    `)
    .eq('cliente_id', clienteId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (expedientes && expedientes.length > 0) {
    const activos = expedientes.filter((e: any) => !ESTADOS_TERMINALES.includes(e.estado_interno as any))
    const cerrados = expedientes.filter((e: any) => ESTADOS_TERMINALES.includes(e.estado_interno as any))
    parts.push(`\nRESUMEN: ${activos.length} expediente(s) activo(s), ${cerrados.length} cerrado(s)`)
    parts.push(`\nEXPEDIENTES DEL CLIENTE (${expedientes.length}):`)
    for (const e of expedientes) {
      const tipo = (e.tipos_tramite as any)?.nombre ?? ''
      const abog = (e.miembros as any[])?.find((m: any) => m.rol === 'abogado')?.perfil as any
      parts.push(`  - ${e.caratula ?? 'Sin carátula'} — ${estadoLabel(e.estado_interno)} — ${tipo} — Prioridad: ${e.prioridad}${abog ? ` — Responsable: ${abog.nombre} ${abog.apellido}` : ''}${e.observaciones ? ` — Obs: ${e.observaciones.slice(0, 60)}` : ''}`)
    }
  } else {
    parts.push(`\nEl cliente no tiene expedientes registrados.`)
  }

  return parts.join('\n')
}

/**
 * Builds the CRM context based on the current page.
 * Accepts optional userInfo for role-based filtering.
 */
export async function buildCrmContext(pathname: string, userInfo?: ContextUserInfo): Promise<string> {
  try {
    // Expediente detail page
    if (pathname.startsWith('/expedientes/') && pathname !== '/expedientes/nuevo') {
      const id = pathname.split('/expedientes/')[1]
      if (id && id.length > 10) {
        const [general, detail] = await Promise.all([
          fetchDashboardContext(userInfo),
          fetchExpedienteContext(id),
        ])
        return `${detail}\n\n${general}`
      }
    }

    // Cliente detail page
    if (pathname.startsWith('/clientes/') && pathname !== '/clientes/nuevo') {
      const id = pathname.split('/clientes/')[1]
      if (id && id.length > 10) {
        const [general, detail] = await Promise.all([
          fetchDashboardContext(userInfo),
          fetchClienteContext(id),
        ])
        return `${detail}\n\n${general}`
      }
    }

    // All other pages — full context
    return await fetchDashboardContext(userInfo)
  } catch (err) {
    console.error('[BogaBot] Error building CRM context:', err)
    return 'No se pudieron cargar datos del CRM en este momento.'
  }
}

import { useState, useMemo } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useAuditLog, useAuditStats, type AuditEntry } from '@/hooks/use-audit-log'
import { useTeamMembers } from '@/hooks/use-team-members'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { ErrorState } from '@/components/shared/error-state'
import { PageHeader } from '@/components/shared/page-header'
import { cn } from '@/lib/utils'
import {
  Activity,
  LogIn,
  FilePlus,
  FileEdit,
  Trash2,
  ArrowRightLeft,
  Eye,
  Users,
  Calendar,
  Filter,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Clock,
  Download,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACCION_CONFIG: Record<string, { icon: typeof Activity; label: string; color: string }> = {
  LOGIN: { icon: LogIn, label: 'Inicio de sesión', color: 'text-cyan-700 dark:text-cyan-300' },
  INSERT: { icon: FilePlus, label: 'Creación', color: 'text-emerald-600 dark:text-emerald-400' },
  UPDATE: { icon: FileEdit, label: 'Modificación', color: 'text-cyan-700 dark:text-cyan-300' },
  DELETE: { icon: Trash2, label: 'Eliminación', color: 'text-rose-600 dark:text-rose-400' },
  STATE_CHANGE: { icon: ArrowRightLeft, label: 'Cambio de estado', color: 'text-violet-600 dark:text-violet-400' },
  SENSITIVE_ACCESS: { icon: Eye, label: 'Acceso sensible', color: 'text-rose-600 dark:text-rose-400' },
  VIEW: { icon: Eye, label: 'Consulta', color: 'text-sky-600 dark:text-sky-400' },
}

const TABLA_LABELS: Record<string, string> = {
  expedientes: 'Expediente',
  clientes: 'Cliente',
  tareas: 'Tarea',
  seguimientos: 'Seguimiento',
  acuerdos_honorarios: 'Honorario',
  cobros: 'Cobro',
  auth: 'Sesión',
  audiencias: 'Audiencia',
  escritos: 'Escrito',
  ingresos: 'Ingreso',
  gastos: 'Gasto',
  gastos_fijos: 'Gasto fijo',
  clientes_abono_mensual: 'Abono mensual',
  presupuestos: 'Presupuesto',
  consultas: 'Consulta',
  expediente_miembros: 'Miembro de expediente',
  expediente_notas: 'Nota',
  adjuntos: 'Adjunto',
  profiles: 'Usuario',
  mcp: 'Claude (conector)',
  sae_credentials: 'Credenciales SAE',
  honorarios_cargos: 'Cargo de cuenta corriente',
}

// Nombre legible de los campos que más cambian
const CAMPO_LABELS: Record<string, string> = {
  titulo: 'título', descripcion: 'descripción', estado: 'estado', estado_interno: 'estado', prioridad: 'prioridad',
  fecha_vencimiento: 'vencimiento', asignado_a: 'asignado', asignados: 'asignados', fecha: 'fecha', hora: 'hora',
  monto: 'monto', moneda: 'moneda', categoria: 'categoría', caratula: 'carátula', numero: 'número',
  numero_sae: 'número SAE', fuero: 'fuero', deleted_at: 'borrado', rol: 'rol', activo: 'activo',
  contenido: 'contenido', notas: 'notas', expediente_id: 'expediente', cliente_id: 'cliente',
  abogado_responsable_id: 'responsable', procuracion_auto: 'procuración automática', telefono: 'teléfono',
  email: 'email', dni: 'DNI', cuil: 'CUIL', recuperable: 'recuperable', recuperado_at: 'recuperado',
}

type Datos = Record<string, unknown> | null

/** Nombre del registro a partir de lo guardado (o del contexto "_campo"). */
function nombreRegistro(entry: AuditEntry): string {
  const d = { ...(entry.datos_anteriores as Datos ?? {}), ...(entry.datos_nuevos as Datos ?? {}) }
  const v = d.titulo ?? d._titulo ?? d.caratula ?? d._caratula ?? d.numero
    ?? ((d.apellido || d._apellido || d.nombre || d._nombre)
      ? `${d.apellido ?? d._apellido ?? ''} ${d.nombre ?? d._nombre ?? ''}`.trim() : null)
    ?? d.descripcion ?? d._descripcion
  return typeof v === 'string' ? v.slice(0, 80) : ''
}

function camposCambiados(entry: AuditEntry): string[] {
  const nuevos = entry.datos_nuevos as Datos
  return nuevos ? Object.keys(nuevos).filter(k => !k.startsWith('_') && k !== 'updated_at') : []
}

function valorLegible(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'sí' : 'no'
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 120)
  return String(v).slice(0, 200)
}

function describeAuditEntry(entry: AuditEntry, nombres: Record<string, string>): string {
  const tabla = TABLA_LABELS[entry.tabla] ?? entry.tabla
  const datos = entry.datos_nuevos as Datos
  const nombre = nombreRegistro(entry) || nombres[entry.registro_id] || ''
  const cual = nombre ? ` "${nombre}"` : ''

  if (entry.accion === 'LOGIN') return 'Inició sesión'
  if (entry.accion === 'VIEW') return `Abrió ${entry.tabla === 'clientes' ? 'el cliente' : 'el expediente'}${cual}`

  if (entry.accion === 'STATE_CHANGE' && entry.tabla === 'expedientes') {
    const antes = (entry.datos_anteriores as Datos)?.estado_interno ?? '?'
    const despues = datos?.estado_interno ?? '?'
    return `Cambió estado de expediente${cual || ` ${datos?.numero ?? ''}`} de "${antes}" a "${despues}"`
  }

  if (entry.accion === 'INSERT') return `Creó ${tabla.toLowerCase()}${cual}`

  if (entry.accion === 'UPDATE') {
    const campos = camposCambiados(entry).map(k => CAMPO_LABELS[k] ?? k)
    return `Modificó ${tabla.toLowerCase()}${cual}${campos.length ? ` (${campos.slice(0, 4).join(', ')}${campos.length > 4 ? '…' : ''})` : ''}`
  }

  if (entry.accion === 'DELETE') return `Eliminó ${tabla.toLowerCase()}${cual}`

  return `${ACCION_CONFIG[entry.accion]?.label ?? entry.accion} en ${tabla.toLowerCase()}${cual}`
}

/** A dónde lleva el registro (expediente o cliente, directo o por contexto). */
function enlaceRegistro(entry: AuditEntry): string | null {
  if (entry.tabla === 'expedientes') return `/expedientes/${entry.registro_id}`
  if (entry.tabla === 'clientes') return `/clientes/${entry.registro_id}`
  const d = { ...(entry.datos_anteriores as Datos ?? {}), ...(entry.datos_nuevos as Datos ?? {}) }
  const exp = d.expediente_id ?? d._expediente_id
  if (typeof exp === 'string') return `/expedientes/${exp}`
  const cli = d.cliente_id ?? d._cliente_id
  if (typeof cli === 'string') return `/clientes/${cli}`
  return null
}

function timeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Ahora'
  if (diffMin < 60) return `Hace ${diffMin}m`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `Hace ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return 'Ayer'
  if (diffD < 7) return `Hace ${diffD}d`
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 30

export default function ActividadPage() {
  const { profile } = useAuth()
  const [userId, setUserId] = useState<string>('')
  const [accion, setAccion] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [page, setPage] = useState(0)

  const { data: team } = useTeamMembers()
  const { data: stats, isLoading: statsLoading } = useAuditStats(dateFrom)
  const { data: logData, isLoading: logLoading, isError, refetch } = useAuditLog({
    userId: userId || undefined,
    accion: accion || undefined,
    dateFrom,
    dateTo,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  })

  const entries = logData?.entries ?? []
  const [abierto, setAbierto] = useState<number | null>(null)

  // Las consultas (VIEW) solo guardan el id: traer carátula / nombre
  const idsVista = useMemo(() => ({
    expedientes: [...new Set(entries.filter(e => e.accion === 'VIEW' && e.tabla === 'expedientes').map(e => e.registro_id))],
    clientes: [...new Set(entries.filter(e => e.accion === 'VIEW' && e.tabla === 'clientes').map(e => e.registro_id))],
  }), [entries])
  const { data: nombres = {} } = useQuery({
    queryKey: ['audit-nombres', idsVista],
    enabled: idsVista.expedientes.length + idsVista.clientes.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const supabase = createClient()
      const out: Record<string, string> = {}
      if (idsVista.expedientes.length) {
        const { data } = await supabase.from('expedientes').select('id, caratula, numero').in('id', idsVista.expedientes)
        for (const e of data ?? []) out[e.id] = (e.caratula ?? e.numero ?? '').slice(0, 80)
      }
      if (idsVista.clientes.length) {
        const { data } = await supabase.from('clientes').select('id, nombre, apellido').in('id', idsVista.clientes)
        for (const c of data ?? []) out[c.id] = `${c.apellido ?? ''} ${c.nombre ?? ''}`.trim()
      }
      return out
    },
  })
  const total = logData?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Solo ADMIN y DIRECTOR ven actividad del sistema
  if (profile?.rol !== 'ADMIN' && profile?.rol !== 'DIRECTOR') {
    return <Navigate to="/inicio" replace />
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Actividad"
        subtitle="Monitoreo de acciones de los usuarios del sistema"
        actions={
          <button
            type="button"
            onClick={() => {
              if (!entries || entries.length === 0) return
              const header = 'Fecha,Usuario,Acción,Entidad,Detalle'
              const rows = entries.map((e: AuditEntry) =>
                [
                  new Date(e.created_at).toLocaleString('es-AR'),
                  e.profiles ? `${e.profiles.nombre} ${e.profiles.apellido}` : e.user_id,
                  e.accion,
                  e.tabla ?? '',
                  (e.registro_id ?? '').replace(/,/g, ';'),
                ].join(',')
              )
              const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `actividad-${new Date().toISOString().slice(0, 10)}.csv`
              a.click()
              URL.revokeObjectURL(url)
            }}
            className="btn btn-ghost"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </button>
        }
      />

      {/* Stats cards */}
      {!statsLoading && stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={Activity} label="Acciones totales" value={stats.total} color="text-cyan-700 dark:text-cyan-300" />
          <StatCard icon={LogIn} label="Inicios de sesión" value={stats.byAction['LOGIN'] ?? 0} color="text-emerald-600 dark:text-emerald-400" />
          <StatCard icon={ArrowRightLeft} label="Cambios de estado" value={stats.byAction['STATE_CHANGE'] ?? 0} color="text-violet-600 dark:text-violet-400" />
          <StatCard icon={FileEdit} label="Modificaciones" value={(stats.byAction['UPDATE'] ?? 0) + (stats.byAction['INSERT'] ?? 0)} color="text-cyan-700 dark:text-cyan-300" />
        </div>
      )}

      {/* Top users */}
      {!statsLoading && stats && stats.topUsers.length > 0 && (
        <div className="app-card p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[var(--brand-accent)]" />
            <h3 className="text-[15px] font-bold tracking-tight text-zinc-900 dark:text-white">Usuarios más activos (periodo seleccionado)</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {stats.topUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => { setUserId(u.id); setPage(0) }}
                aria-pressed={userId === u.id}
                className="chip"
              >
                <span>{u.nombre}</span>
                <span className="chip-count">{u.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="app-card p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <Filter className="h-4 w-4 text-[var(--brand-accent)]" />
          <h3 className="text-[15px] font-bold tracking-tight text-zinc-900 dark:text-white">Filtros</h3>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Usuario</label>
            <select
              value={userId}
              onChange={(e) => { setUserId(e.target.value); setPage(0) }}
              className="field h-10 py-0 text-[13px]"
            >
              <option value="">Todos</option>
              {(team ?? []).map((m) => (
                <option key={m.id} value={m.id}>{m.nombre} {m.apellido}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Acción</label>
            <select
              value={accion}
              onChange={(e) => { setAccion(e.target.value); setPage(0) }}
              className="field h-10 py-0 text-[13px]"
            >
              <option value="">Todas</option>
              {Object.entries(ACCION_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Desde</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(0) }}
              className="field h-10 py-0 text-[13px]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">Hasta</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(0) }}
              className="field h-10 py-0 text-[13px]"
            />
          </div>
        </div>
      </div>

      {/* Timeline */}
      {logLoading ? (
        <TableSkeleton rows={8} columns={3} />
      ) : isError ? (
        <ErrorState message="Error al cargar la actividad" onRetry={() => refetch()} />
      ) : entries.length === 0 ? (
        <div className="app-card p-8 text-center">
          <Activity className="mx-auto mb-3 h-10 w-10 text-zinc-400 dark:text-zinc-600" />
          <p className="text-sm text-zinc-600 dark:text-zinc-300">No hay actividad para los filtros seleccionados</p>
        </div>
      ) : (
        <div className="app-card">
          <div className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
            {entries.map((entry) => {
              const config = ACCION_CONFIG[entry.accion] ?? { icon: Activity, label: entry.accion, color: 'text-zinc-600 dark:text-zinc-300' }
              const Icon = config.icon
              const userName = entry.profiles ? `${entry.profiles.nombre} ${entry.profiles.apellido}` : 'Sistema'

              return (
                <div
                  key={entry.id}
                  onClick={() => setAbierto(abierto === entry.id ? null : entry.id)}
                  className={cn('flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.03] sm:px-5', abierto === entry.id && 'bg-zinc-50 dark:bg-white/[0.03]')}
                >
                  {/* Icon */}
                  <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-100 dark:bg-white/[0.06]', config.color)}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] text-zinc-800 dark:text-zinc-200">
                      <span className="font-bold text-zinc-900 dark:text-white">{userName}</span>
                      {' '}
                      <span className="text-zinc-600 dark:text-zinc-300">{describeAuditEntry(entry, nombres)}</span>
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className={cn('text-[11px] font-semibold', config.color)}>{config.label}</span>
                      {entry.tabla !== 'auth' && (
                        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                          {TABLA_LABELS[entry.tabla] ?? entry.tabla}
                        </span>
                      )}
                      {enlaceRegistro(entry) && (
                        <Link to={enlaceRegistro(entry)!} onClick={(e) => e.stopPropagation()} className="dashboard-link text-[11px] hover:underline">
                          Ver
                        </Link>
                      )}
                    </div>
                    {abierto === entry.id && entry.accion === 'UPDATE' && camposCambiados(entry).length > 0 && (
                      <dl className="dashboard-panel-muted mt-2 space-y-1 p-2.5 text-xs">
                        {camposCambiados(entry).map((k) => (
                          <div key={k} className="flex flex-wrap gap-x-2">
                            <dt className="font-medium text-zinc-700 dark:text-zinc-200">{CAMPO_LABELS[k] ?? k}:</dt>
                            <dd className="text-zinc-500 line-through">{valorLegible((entry.datos_anteriores as Datos)?.[k])}</dd>
                            <dd className="text-zinc-800 dark:text-zinc-100">→ {valorLegible((entry.datos_nuevos as Datos)?.[k])}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">{timeAgo(entry.created_at)}</p>
                    <p className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">{formatDateTime(entry.created_at)}</p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3 dark:border-white/[0.06] sm:px-5">
              <p className="text-xs font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="btn btn-ghost btn-icon h-8 w-8"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-2 text-xs font-semibold tabular-nums text-zinc-600 dark:text-zinc-300">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="btn btn-ghost btn-icon h-8 w-8"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ icon: Icon, label, value, color }: { icon: typeof Activity; label: string; value: number; color: string }) {
  return (
    <div className="app-card p-4">
      <div className="mb-1.5 flex items-center gap-2">
        <Icon className={cn('h-4 w-4 shrink-0', color)} />
        <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-zinc-500 dark:text-zinc-400">{label}</span>
      </div>
      <p className="text-2xl font-extrabold tracking-tight tabular-nums text-zinc-900 dark:text-white">{value}</p>
    </div>
  )
}

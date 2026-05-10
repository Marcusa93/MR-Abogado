import { useState, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { useAuditLog, useAuditStats, type AuditEntry } from '@/hooks/use-audit-log'
import { useTeamMembers } from '@/hooks/use-team-members'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { ErrorState } from '@/components/shared/error-state'
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
  LOGIN: { icon: LogIn, label: 'Inicio de sesión', color: 'text-amber-400' },
  INSERT: { icon: FilePlus, label: 'Creación', color: 'text-emerald-400' },
  UPDATE: { icon: FileEdit, label: 'Modificación', color: 'text-amber-400' },
  DELETE: { icon: Trash2, label: 'Eliminación', color: 'text-rose-400' },
  STATE_CHANGE: { icon: ArrowRightLeft, label: 'Cambio de estado', color: 'text-violet-400' },
  SENSITIVE_ACCESS: { icon: Eye, label: 'Acceso sensible', color: 'text-rose-400' },
}

const TABLA_LABELS: Record<string, string> = {
  expedientes: 'Expediente',
  clientes: 'Cliente',
  tareas: 'Tarea',
  seguimientos: 'Seguimiento',
  acuerdos_honorarios: 'Honorario',
  cobros: 'Cobro',
  auth: 'Sesión',
}

function describeAuditEntry(entry: AuditEntry): string {
  const tabla = TABLA_LABELS[entry.tabla] ?? entry.tabla
  const datos = entry.datos_nuevos as Record<string, unknown> | null

  if (entry.accion === 'LOGIN') return 'Inició sesión'

  if (entry.accion === 'STATE_CHANGE' && entry.tabla === 'expedientes') {
    const antes = (entry.datos_anteriores as Record<string, unknown>)?.estado_interno ?? '?'
    const despues = datos?.estado_interno ?? '?'
    const numero = datos?.numero ?? ''
    return `Cambió estado de expediente ${numero} de "${antes}" a "${despues}"`
  }

  if (entry.accion === 'INSERT') {
    const nombre = datos?.numero ?? datos?.nombre ?? datos?.titulo ?? ''
    return `Creó ${tabla.toLowerCase()}${nombre ? ` "${nombre}"` : ''}`
  }

  if (entry.accion === 'UPDATE') {
    const campos = datos ? Object.keys(datos).filter(k => k !== 'updated_at').slice(0, 3) : []
    return `Modificó ${tabla.toLowerCase()}${campos.length ? ` (${campos.join(', ')})` : ''}`
  }

  if (entry.accion === 'DELETE') {
    return `Eliminó ${tabla.toLowerCase()}`
  }

  return `${ACCION_CONFIG[entry.accion]?.label ?? entry.accion} en ${tabla.toLowerCase()}`
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
  const total = logData?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Admin check
  if (profile?.rol !== 'ADMIN') return <Navigate to="/dashboard" replace />

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gradient-cyan">Actividad</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Monitoreo de acciones de los usuarios del sistema</p>
          </div>
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
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/10 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Stats cards */}
      {!statsLoading && stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={Activity} label="Acciones totales" value={stats.total} color="text-amber-400" />
          <StatCard icon={LogIn} label="Inicios de sesión" value={stats.byAction['LOGIN'] ?? 0} color="text-emerald-400" />
          <StatCard icon={ArrowRightLeft} label="Cambios de estado" value={stats.byAction['STATE_CHANGE'] ?? 0} color="text-violet-400" />
          <StatCard icon={FileEdit} label="Modificaciones" value={(stats.byAction['UPDATE'] ?? 0) + (stats.byAction['INSERT'] ?? 0)} color="text-amber-400" />
        </div>
      )}

      {/* Top users */}
      {!statsLoading && stats && stats.topUsers.length > 0 && (
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Usuarios más activos (periodo seleccionado)</h3>
          </div>
          <div className="flex flex-wrap gap-3">
            {stats.topUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => { setUserId(u.id); setPage(0) }}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                  userId === u.id
                    ? 'border-amber-500/30 bg-amber-950/30 text-amber-300'
                    : 'border-white/5 bg-white/5 text-zinc-700 dark:text-zinc-300 hover:bg-white/10'
                )}
              >
                <span className="font-medium">{u.nombre}</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold">{u.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="glass-card rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
          <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Filtros</h3>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-[10px] font-medium text-zinc-900 dark:text-zinc-500">Usuario</label>
            <select
              value={userId}
              onChange={(e) => { setUserId(e.target.value); setPage(0) }}
              className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none"
            >
              <option value="">Todos</option>
              {(team ?? []).map((m) => (
                <option key={m.id} value={m.id}>{m.nombre} {m.apellido}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium text-zinc-900 dark:text-zinc-500">Acción</label>
            <select
              value={accion}
              onChange={(e) => { setAccion(e.target.value); setPage(0) }}
              className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none"
            >
              <option value="">Todas</option>
              {Object.entries(ACCION_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium text-zinc-900 dark:text-zinc-500">Desde</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(0) }}
              className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium text-zinc-900 dark:text-zinc-500">Hasta</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(0) }}
              className="h-8 w-full rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none"
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
        <div className="glass-card rounded-xl p-8 text-center">
          <Activity className="mx-auto h-10 w-10 text-zinc-600 mb-3" />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No hay actividad para los filtros seleccionados</p>
        </div>
      ) : (
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="divide-y divide-white/5">
            {entries.map((entry) => {
              const config = ACCION_CONFIG[entry.accion] ?? { icon: Activity, label: entry.accion, color: 'text-zinc-600 dark:text-zinc-400' }
              const Icon = config.icon
              const userName = entry.profiles ? `${entry.profiles.nombre} ${entry.profiles.apellido}` : 'Sistema'

              return (
                <div key={entry.id} className="flex items-start gap-3 px-4 py-3 hover:bg-zinc-100 dark:hover:bg-white/[0.02] transition-colors">
                  {/* Icon */}
                  <div className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/5', config.color)}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-800 dark:text-zinc-200">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{userName}</span>
                      {' '}
                      <span className="text-zinc-600 dark:text-zinc-400">{describeAuditEntry(entry)}</span>
                    </p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className={cn('text-[10px] font-medium', config.color)}>{config.label}</span>
                      {entry.tabla !== 'auth' && (
                        <span className="text-[10px] text-zinc-600">
                          {TABLA_LABELS[entry.tabla] ?? entry.tabla}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Timestamp */}
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-zinc-900 dark:text-zinc-500">{timeAgo(entry.created_at)}</p>
                    <p className="text-[10px] text-zinc-600">{formatDateTime(entry.created_at)}</p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-white/5 px-4 py-3">
              <p className="text-xs text-zinc-900 dark:text-zinc-500">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="rounded p-1.5 text-zinc-600 dark:text-zinc-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs text-zinc-600 dark:text-zinc-400 px-2">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="rounded p-1.5 text-zinc-600 dark:text-zinc-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
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
    <div className="glass-card rounded-xl border border-white/5 p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn('h-4 w-4', color)} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-500">{label}</span>
      </div>
      <p className={cn('text-2xl font-bold', color)}>{value}</p>
    </div>
  )
}

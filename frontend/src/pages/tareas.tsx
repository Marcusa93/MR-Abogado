import { useState, useCallback } from 'react'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useNavigate } from 'react-router-dom'
import { stripMentionIds } from '@/lib/utils/mentions'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useTareas, useCompletarTarea, useDeleteTarea, useArchivarTarea, expedienteLabel, type TareasFilters, type TareaSortField } from '@/hooks/use-tareas'
import { useAuth } from '@/hooks/use-auth'
import { CrearTareaDialog } from '@/components/expedientes/crear-tarea-dialog'
import { VerTareaDialog } from '@/components/expedientes/ver-tarea-dialog'
import type { TareaWithRelations } from '@/hooks/use-tareas'
import { PrioridadBadge, PRIORIDADES } from '@/components/shared/prioridad-badge'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { DEFAULT_PAGE_SIZE } from '@/lib/utils/constants'
import { ESTADO_TAREA_LABELS, type EstadoTarea } from '@/types/enums'
import { formatDateShort } from '@/lib/utils/date-helpers'
import { cn } from '@/lib/utils'
import {
  CheckSquare,
  Circle,
  CheckCircle2,
  Clock,
  AlertCircle,
  Search,
  ChevronLeft,
  ChevronRight,
  ListTodo,
  Loader2,
  Plus,
  X,
  CheckCheck,
  Calendar,
  Trash2,
  Archive,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isOverdue(dateStr: string | null, estado: string): boolean {
  if (!dateStr || estado === 'COMPLETADA' || estado === 'CANCELADA') return false
  const today = new Date().toISOString().split('T')[0]
  return dateStr < today
}

const ESTADO_ICON: Record<string, typeof Circle> = {
  PENDIENTE: Circle,
  EN_PROGRESO: Clock,
  COMPLETADA: CheckCircle2,
  CANCELADA: AlertCircle,
}

const ESTADO_COLORS: Record<string, string> = {
  PENDIENTE: 'text-amber-500',
  EN_PROGRESO: 'text-blue-500',
  COMPLETADA: 'text-emerald-500',
  CANCELADA: 'text-zinc-700 dark:text-zinc-300',
}

const PRIORIDAD_ROW: Record<string, { border: string; bg: string }> = {
  URGENTE: { border: 'border-l-rose-500', bg: 'bg-rose-500/[0.06]' },
  ALTA: { border: 'border-l-amber-500', bg: 'bg-amber-500/[0.04]' },
  MEDIA: { border: 'border-l-blue-500', bg: '' },
  BAJA: { border: 'border-l-slate-600', bg: '' },
}

type DateTab = 'todas' | 'hoy' | 'semana' | 'vencidas'

const DATE_TABS: { key: DateTab; label: string; icon: typeof Clock }[] = [
  { key: 'todas', label: 'Todas', icon: ListTodo },
  { key: 'hoy', label: 'Hoy', icon: Calendar },
  { key: 'semana', label: 'Esta semana', icon: Clock },
  { key: 'vencidas', label: 'Vencidas', icon: AlertCircle },
]

// ---------------------------------------------------------------------------
// Stats hook
// ---------------------------------------------------------------------------

function useTareaStats() {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]

  return useQuery({
    queryKey: ['tareas', 'stats'],
    queryFn: async () => {
      const [pendientesRes, vencidasRes, completadasHoyRes] = await Promise.all([
        supabase
          .from('tareas')
          .select('id', { count: 'exact', head: true })
          .in('estado', ['PENDIENTE', 'EN_PROGRESO']),
        supabase
          .from('tareas')
          .select('id', { count: 'exact', head: true })
          .in('estado', ['PENDIENTE', 'EN_PROGRESO'])
          .lt('fecha_vencimiento', today),
        supabase
          .from('tareas')
          .select('id', { count: 'exact', head: true })
          .eq('estado', 'COMPLETADA')
          .gte('fecha_completada', `${today}T00:00:00`),
      ])

      return {
        pendientes: pendientesRes.count ?? 0,
        vencidas: vencidasRes.count ?? 0,
        completadasHoy: completadasHoyRes.count ?? 0,
      }
    },
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function TareasPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const completarTarea = useCompletarTarea()
  const deleteTarea = useDeleteTarea()
  const archivarTarea = useArchivarTarea()

  const isAdmin = profile?.rol === 'ADMIN'

  const [filters, setFilters] = useState<TareasFilters>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  })
  const [soloMisTareas, setSoloMisTareas] = useState(false)
  const [soloVencidas, setSoloVencidas] = useState(false)
  const [crearDialogOpen, setCrearDialogOpen] = useState(false)
  const [dateTab, setDateTab] = useState<DateTab>('todas')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleteConfirm, setDeleteConfirm] = useState<{ tareaId: string; expedienteId?: string } | null>(null)
  const [verTarea, setVerTarea] = useState<TareaWithRelations | null>(null)
  const [searchValue, setSearchValue] = useState('')
  const [showArchivadas, setShowArchivadas] = useState(false)
  const [sortBy, setSortBy] = useState<TareaSortField>('fecha_vencimiento')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const today = new Date().toISOString().split('T')[0]
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]

  const effectiveFilters: TareasFilters = {
    ...filters,
    asignado_a: soloMisTareas && profile?.id ? profile.id : filters.asignado_a,
    vencidas: dateTab === 'vencidas' || soloVencidas || undefined,
    includeArchivadas: showArchivadas || undefined,
    search: searchValue || undefined,
    sortBy,
    sortOrder,
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBulkComplete = () => {
    selectedIds.forEach((id) => completarTarea.mutate(id))
    setSelectedIds(new Set())
  }

  const { data, isLoading, isError, error, refetch } = useTareas(effectiveFilters)
  const { data: stats } = useTareaStats()

  const pendientesCount = stats?.pendientes ?? 0
  const vencidasCount = stats?.vencidas ?? 0
  const completadasHoyCount = stats?.completadasHoy ?? 0

  const goToPage = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }))
  }, [])

  const handleComplete = (tareaId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    completarTarea.mutate(tareaId)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gradient-cyan">
            Tareas
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Gestiona las tareas de todos los expedientes.
          </p>
        </div>
        <button
          onClick={() => setCrearDialogOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-gradient-cyan px-4 py-2 text-sm font-medium text-zinc-950 hover:opacity-90 shrink-0"
        >
          <Plus className="h-4 w-4" />
          Nueva tarea
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 animate-stagger-fade-in">
        <div className="glass-card-glow rounded-xl px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Pendientes</p>
              <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">{pendientesCount}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
              <Clock className="h-5 w-5" />
            </div>
          </div>
        </div>
        <div className="glass-card-glow rounded-xl px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Vencidas</p>
              <p className="mt-1 text-2xl font-bold text-rose-400">{vencidasCount}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400">
              <AlertCircle className="h-5 w-5" />
            </div>
          </div>
        </div>
        <div className="glass-card-glow rounded-xl px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Completadas hoy</p>
              <p className="mt-1 text-2xl font-bold text-emerald-400">{completadasHoyCount}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Date tabs */}
      <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1 w-fit">
        {DATE_TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = dateTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => {
                setDateTab(tab.key)
                setSoloVencidas(tab.key === 'vencidas')
                setFilters((prev) => ({ ...prev, page: 1 }))
              }}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-amber-500/15 text-amber-400'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-white/5'
              )}
            >
              <Icon className="h-3 w-3" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Bulk complete */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2">
          <span className="text-xs text-amber-400 font-medium">
            {selectedIds.size} tarea{selectedIds.size > 1 ? 's' : ''} seleccionada{selectedIds.size > 1 ? 's' : ''}
          </span>
          <button
            onClick={handleBulkComplete}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/25 transition-colors"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Completar todas
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-[280px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-700 dark:text-zinc-300" />
          <input
            placeholder="Buscar tarea..."
            value={searchValue}
            onChange={(e) => {
              setSearchValue(e.target.value)
              setFilters((prev) => ({ ...prev, page: 1 }))
            }}
            className="h-9 w-full rounded-lg border border-white/10 bg-white/5 pl-8 pr-3 text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
          />
        </div>

        {/* Sort */}
        <select
          value={`${sortBy}:${sortOrder}`}
          onChange={(e) => {
            const [field, order] = e.target.value.split(':') as [TareaSortField, 'asc' | 'desc']
            setSortBy(field)
            setSortOrder(order)
          }}
          className="h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
        >
          <option value="fecha_vencimiento:asc">Vencimiento ↑</option>
          <option value="fecha_vencimiento:desc">Vencimiento ↓</option>
          <option value="prioridad:desc">Prioridad ↑</option>
          <option value="prioridad:asc">Prioridad ↓</option>
          <option value="titulo:asc">Título A-Z</option>
          <option value="titulo:desc">Título Z-A</option>
          <option value="created_at:desc">Más recientes</option>
          <option value="created_at:asc">Más antiguas</option>
        </select>

        {/* Estado filter */}
        <select
          value={filters.estado ?? ''}
          onChange={(e) =>
            setFilters((prev) => ({
              ...prev,
              estado: (e.target.value || null) as EstadoTarea | null,
              page: 1,
            }))
          }
          className="h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
        >
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_TAREA_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        {/* Prioridad filter */}
        <select
          value={filters.prioridad ?? ''}
          onChange={(e) =>
            setFilters((prev) => ({
              ...prev,
              prioridad: (e.target.value || null) as TareasFilters['prioridad'],
              page: 1,
            }))
          }
          className="h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
        >
          <option value="">Todas las prioridades</option>
          {PRIORIDADES.map((p) => (
            <option key={p} value={p}>
              {p.charAt(0) + p.slice(1).toLowerCase()}
            </option>
          ))}
        </select>

        {/* Toggle: solo vencidas */}
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={soloVencidas}
            onChange={(e) => {
              setSoloVencidas(e.target.checked)
              setFilters((prev) => ({ ...prev, page: 1 }))
            }}
            className="h-4 w-4 rounded border-white/10 bg-white/5 text-amber-500 focus:ring-amber-500/15"
          />
          Solo vencidas
        </label>

        {/* Toggle: mis tareas */}
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={soloMisTareas}
            onChange={(e) => {
              setSoloMisTareas(e.target.checked)
              setFilters((prev) => ({ ...prev, page: 1 }))
            }}
            className="h-4 w-4 rounded border-white/10 bg-white/5 text-amber-500 focus:ring-amber-500/15"
          />
          Mis tareas
        </label>

        {/* Toggle: archivadas */}
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showArchivadas}
            onChange={(e) => {
              setShowArchivadas(e.target.checked)
              setFilters((prev) => ({ ...prev, page: 1 }))
            }}
            className="h-4 w-4 rounded border-white/10 bg-white/5 text-amber-500 focus:ring-amber-500/15"
          />
          Archivadas
        </label>

        {/* Clear filters */}
        {(filters.estado || filters.prioridad || soloVencidas || soloMisTareas || showArchivadas || searchValue) && (
          <button
            onClick={() => {
              setFilters({ page: 1, pageSize: DEFAULT_PAGE_SIZE })
              setSoloVencidas(false)
              setSoloMisTareas(false)
              setShowArchivadas(false)
              setSearchValue('')
              setSortBy('fecha_vencimiento')
              setSortOrder('asc')
            }}
            className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-white/10 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
          >
            <X className="h-3 w-3" />
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <TableSkeleton rows={8} columns={6} />
      ) : isError ? (
        <ErrorState
          message={error?.message ?? 'Error al cargar tareas'}
          onRetry={() => refetch()}
        />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="No se encontraron tareas"
          description={
            soloVencidas
              ? 'No hay tareas vencidas.'
              : 'No hay tareas que coincidan con los filtros.'
          }
        />
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-white/10 glass-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-white/5">
                  <th className="w-10 px-3 py-2.5" />
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                    Tarea
                  </th>
                  <th className="hidden sm:table-cell px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                    Expediente
                  </th>
                  <th className="hidden md:table-cell px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                    Estado
                  </th>
                  <th className="hidden sm:table-cell px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                    Prioridad
                  </th>
                  <th className="hidden lg:table-cell px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                    Asignado
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                    Vencimiento
                  </th>
                  <th className="w-20 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.data
                  .filter((tarea) => {
                    if (dateTab === 'hoy') return tarea.fecha_vencimiento === today
                    if (dateTab === 'semana') return tarea.fecha_vencimiento && tarea.fecha_vencimiento >= today && tarea.fecha_vencimiento <= weekEnd
                    return true // 'todas' and 'vencidas' (handled server-side)
                  })
                  .map((tarea) => {
                  const overdue = isOverdue(tarea.fecha_vencimiento, tarea.estado)
                  const Icon = ESTADO_ICON[tarea.estado] ?? Circle
                  const iconColor = ESTADO_COLORS[tarea.estado] ?? 'text-zinc-700 dark:text-zinc-300'
                  const canComplete =
                    tarea.estado === 'PENDIENTE' || tarea.estado === 'EN_PROGRESO'
                  const priStyle = PRIORIDAD_ROW[tarea.prioridad] ?? { border: '', bg: '' }
                  const isSelected = selectedIds.has(tarea.id)

                  return (
                    <tr
                      key={tarea.id}
                      onClick={() => setVerTarea(tarea)}
                      className={cn(
                        'group cursor-pointer transition-colors border-l-[3px] hover:bg-zinc-100 dark:bg-white/[0.04] hover:shadow-[inset_0_0_0_1px_oklch(0.75_0.11_85_/_8%)]',
                        priStyle.border,
                        priStyle.bg,
                        tarea.estado === 'COMPLETADA' && 'opacity-50',
                        tarea.completada_at !== null && tarea.estado !== 'COMPLETADA' && 'opacity-60',
                        isSelected && 'bg-amber-500/[0.06] ring-1 ring-inset ring-amber-500/15'
                      )}
                    >
                      {/* Complete checkbox / bulk select */}
                      <td className="px-3 py-3 text-center">
                        {canComplete ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(tarea.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="h-3.5 w-3.5 rounded border-white/10 bg-white/5 text-amber-500 focus:ring-amber-500/15 opacity-0 group-hover:opacity-100 transition-opacity"
                            />
                            <button
                              onClick={(e) => handleComplete(tarea.id, e)}
                              disabled={completarTarea.isPending}
                              className="rounded p-1 text-zinc-700 dark:text-zinc-300 hover:text-emerald-400 transition-colors"
                              title="Completar tarea"
                            >
                            {completarTarea.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckSquare className="h-4 w-4" />
                            )}
                            </button>
                          </div>
                        ) : (
                          <Icon className={cn('h-4 w-4 mx-auto', iconColor)} />
                        )}
                      </td>

                      {/* Title + description */}
                      <td className="max-w-[240px] sm:max-w-[360px] px-3 py-3">
                        <p
                          className={cn(
                            'font-medium text-zinc-900 dark:text-zinc-50 line-clamp-2',
                            tarea.estado === 'COMPLETADA' && 'line-through'
                          )}
                          title={tarea.titulo}
                        >
                          {tarea.titulo}
                        </p>
                        {tarea.descripcion && (
                          <p
                            className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2"
                            title={stripMentionIds(tarea.descripcion)}
                          >
                            {stripMentionIds(tarea.descripcion)}
                          </p>
                        )}
                        {/* Expediente (visible también en mobile) */}
                        {tarea.expediente && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/expedientes/${tarea.expediente!.id}`)
                            }}
                            className="mt-1 sm:hidden flex items-center gap-1 text-[11px] text-amber-400 hover:underline truncate max-w-full"
                            title={expedienteLabel(tarea.expediente)}
                          >
                            <span className="truncate">{expedienteLabel(tarea.expediente)}</span>
                          </button>
                        )}
                      </td>

                      {/* Expediente link */}
                      <td className="hidden sm:table-cell px-3 py-3 max-w-[220px]">
                        {tarea.expediente ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/expedientes/${tarea.expediente!.id}`)
                            }}
                            className="text-xs text-amber-400 hover:underline truncate max-w-full block text-left"
                            title={expedienteLabel(tarea.expediente)}
                          >
                            {expedienteLabel(tarea.expediente)}
                          </button>
                        ) : (
                          <span className="text-[10px] text-rose-400/80 bg-rose-400/10 px-1.5 py-0.5 rounded-full border border-rose-400/20">
                            Sin vincular
                          </span>
                        )}
                      </td>

                      {/* Estado */}
                      <td className="hidden md:table-cell px-3 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 text-xs font-medium',
                            iconColor
                          )}
                        >
                          <Icon className="h-3 w-3" />
                          {ESTADO_TAREA_LABELS[tarea.estado as EstadoTarea] ?? tarea.estado}
                        </span>
                      </td>

                      {/* Prioridad */}
                      <td className="hidden sm:table-cell px-3 py-3">
                        <PrioridadBadge prioridad={tarea.prioridad} compact />
                      </td>

                      {/* Asignado */}
                      <td className="hidden lg:table-cell px-3 py-3">
                        {tarea.asignado ? (
                          <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-900/40 text-[10px] font-bold text-amber-300">
                              {(tarea.asignado.nombre?.[0] ?? '').toUpperCase()}
                              {(tarea.asignado.apellido?.[0] ?? '').toUpperCase()}
                            </div>
                            <span className="text-xs text-zinc-800 dark:text-zinc-200 truncate max-w-[100px]">
                              {tarea.asignado.nombre} {tarea.asignado.apellido}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-amber-400/80 bg-amber-400/10 px-1.5 py-0.5 rounded-full border border-amber-400/20">⚠ Sin asignar</span>
                        )}
                      </td>

                      {/* Fecha vencimiento */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span
                          className={cn(
                            'text-xs',
                            overdue
                              ? 'font-semibold text-rose-400'
                              : 'text-zinc-600 dark:text-zinc-400'
                          )}
                        >
                          {formatDateShort(tarea.fecha_vencimiento)}
                          {overdue && (
                            <span className="ml-1.5 inline-flex items-center gap-0.5">
                              <AlertCircle className="h-3 w-3" />
                            </span>
                          )}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {tarea.estado === 'COMPLETADA' &&
                            (isAdmin || tarea.asignado_a === profile?.id || tarea.created_by === profile?.id) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); archivarTarea.mutate(tarea.id) }}
                              disabled={archivarTarea.isPending}
                              title="Archivar"
                              className="rounded p-1.5 text-zinc-700 dark:text-zinc-300 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setDeleteConfirm({ tareaId: tarea.id, expedienteId: tarea.expediente_id ?? undefined })
                              }}
                              disabled={deleteTarea.isPending}
                              title="Eliminar"
                              className="rounded p-1.5 text-zinc-700 dark:text-zinc-300 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Mostrando {(data.page - 1) * data.pageSize + 1} a{' '}
                {Math.min(data.page * data.pageSize, data.count)} de {data.count}{' '}
                tareas
              </p>
              <div className="flex items-center gap-1">
                <button
                  disabled={data.page <= 1}
                  onClick={() => goToPage(data.page - 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-3 text-xs text-zinc-600 dark:text-zinc-400">
                  {data.page} / {data.totalPages}
                </span>
                <button
                  disabled={data.page >= data.totalPages}
                  onClick={() => goToPage(data.page + 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
      <CrearTareaDialog
        open={crearDialogOpen}
        onClose={() => setCrearDialogOpen(false)}
      />
      <VerTareaDialog
        open={verTarea !== null}
        onClose={() => setVerTarea(null)}
        tarea={verTarea as any}
      />
      <ConfirmDialog
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => { deleteTarea.mutate({ tareaId: deleteConfirm!.tareaId, expedienteId: deleteConfirm!.expedienteId }); setDeleteConfirm(null) }}
        title="Eliminar tarea"
        description="¿Eliminar esta tarea permanentemente? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="danger"
        isPending={deleteTarea.isPending}
      />
    </div>
  )
}

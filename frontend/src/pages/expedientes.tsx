import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { EstadoBadge } from '@/components/shared/estado-badge'
import { PrioridadBadge } from '@/components/shared/prioridad-badge'
import { SemaforoBadge } from '@/components/shared/semaforo-badge'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { ExpedienteFilters } from '@/components/expedientes/expediente-filters'
import { calcularSemaforo } from '@/lib/utils/semaforo'
import { getExpedienteRowClass } from '@/lib/utils/estado-colors'
import { formatDateShort } from '@/lib/utils/date-helpers'
import { DEFAULT_PAGE_SIZE } from '@/lib/utils/constants'
import { cn } from '@/lib/utils'
import {
  useExpedientes,
  useCambiarEstado,
  type ExpedientesFilters,
  type SortField,
} from '@/hooks/use-expedientes'
import { exportExpedientesToCSV } from '@/lib/utils/export-csv'
import { toast } from '@/stores/toast-store'
import { useUIStore } from '@/stores/ui-store'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { WhatsAppButton } from '@/components/shared/whatsapp-button'
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  FileText,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  LayoutGrid,
  LayoutList,
  X,
  Loader2,
} from 'lucide-react'
import { ESTADOS_PIPELINE, ESTADO_INTERNO_LABELS } from '@/types/enums'

// ---------------------------------------------------------------------------
// Sortable header helper
// ---------------------------------------------------------------------------

function SortHeader({
  label,
  field,
  currentSort,
  currentOrder,
  onSort,
  className,
}: {
  label: string
  field: SortField
  currentSort?: SortField
  currentOrder?: 'asc' | 'desc'
  onSort: (field: SortField) => void
  className?: string
}) {
  const isActive = currentSort === field
  const Icon = isActive ? (currentOrder === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <th
      className={cn(
        'px-4 py-3 text-xs font-medium uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-zinc-800 dark:hover:text-zinc-200',
        isActive ? 'text-amber-400' : 'text-zinc-600 dark:text-zinc-400',
        className
      )}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <Icon className="h-3 w-3" />
      </span>
    </th>
  )
}

// ---------------------------------------------------------------------------
// Card view for mobile
// ---------------------------------------------------------------------------

function ExpedienteCard({ expediente, onClick }: { expediente: any; onClick: () => void }) {
  const cliente = expediente.clientes
  const tipo = expediente.tipos_tramite
  const semaforoColor = calcularSemaforo({
    estado_interno: expediente.estado_interno,
    audiencias: expediente.audiencias ?? [],
    tareas: expediente.tareas ?? [],
  })

  return (
    <div
      onClick={onClick}
      className={cn(
        'glass-card rounded-xl p-4 cursor-pointer border-l-[3px] transition-all hover:scale-[1.01]',
        getExpedienteRowClass({
          estado_interno: expediente.estado_interno,
          audiencias: expediente.audiencias ?? [],
          tareas: expediente.tareas ?? [],
        })
      )}
    >
      <div className="flex items-start gap-3">
        <SemaforoBadge color={semaforoColor} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
            {expediente.caratula || `${cliente?.apellido ?? ''} ${cliente?.nombre ?? ''}`.trim() || '-'}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <EstadoBadge estado={expediente.estado_interno} compact />
            <PrioridadBadge prioridad={expediente.prioridad} compact />
          </div>
          {tipo && <p className="text-[11px] text-zinc-900 dark:text-zinc-500 mt-1">{tipo.nombre}</p>}
        </div>
        {cliente?.telefono && (
          <WhatsAppButton phone={cliente.telefono} variant="icon" />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// URL ↔ Filter sync helpers
// ---------------------------------------------------------------------------

const FILTER_PARAMS = ['tipo_tramite_id', 'estado_interno', 'prioridad', 'search', 'sortBy', 'sortOrder', 'page'] as const

function filtersFromParams(params: URLSearchParams): ExpedientesFilters {
  const f: ExpedientesFilters = { page: 1, pageSize: DEFAULT_PAGE_SIZE }
  const tipo = params.get('tipo_tramite_id')
  if (tipo) f.tipo_tramite_id = tipo
  const estado = params.get('estado_interno')
  if (estado) f.estado_interno = estado as any
  // TODO: filter by expediente_miembros when supported
  // const abogado = params.get('abogado_id')
  // if (abogado) f.abogado_id = abogado
  const prioridad = params.get('prioridad')
  if (prioridad) f.prioridad = prioridad as any
  const search = params.get('search')
  if (search) f.search = search
  const sortBy = params.get('sortBy')
  if (sortBy) f.sortBy = sortBy as SortField
  const sortOrder = params.get('sortOrder')
  if (sortOrder === 'asc' || sortOrder === 'desc') f.sortOrder = sortOrder
  const page = params.get('page')
  if (page && Number(page) > 1) f.page = Number(page)
  return f
}

function filtersToParams(filters: ExpedientesFilters): URLSearchParams {
  const params = new URLSearchParams()
  for (const key of FILTER_PARAMS) {
    const val = filters[key as keyof ExpedientesFilters]
    if (val != null && val !== '' && val !== 1) params.set(key, String(val))
  }
  return params
}

export default function ExpedientesPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [filters, setFilters] = useState<ExpedientesFilters>(() => filtersFromParams(searchParams))
  const viewMode = useUIStore((s) => s.expedientesViewMode)
  const setViewMode = useUIStore((s) => s.setExpedientesViewMode)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [csvLoading, setCsvLoading] = useState(false)
  const [bulkConfirm, setBulkConfirm] = useState<{ estado: string; label: string } | null>(null)
  const pendingBulkEstado = useRef<string | null>(null)
  const cambiarEstado = useCambiarEstado()

  // Sync filters → URL (replace, don't push, to avoid polluting history on every keystroke)
  useEffect(() => {
    const next = filtersToParams(filters)
    const current = new URLSearchParams(searchParams)
    // Only update if actually different
    if (next.toString() !== current.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [filters]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading, isFetching, isError, error, refetch } = useExpedientes(filters)

  const handleFilterChange = useCallback((newFilters: ExpedientesFilters) => {
    setFilters((prev) => ({ ...prev, ...newFilters }))
  }, [])

  const goToPage = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }))
  }, [])

  const handleSort = useCallback((field: SortField) => {
    setFilters((prev) => ({
      ...prev,
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'asc' ? 'desc' : 'asc',
      page: 1,
    }))
  }, [])

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gradient-cyan">
            Expedientes
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Gestiona todos los expedientes del estudio.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              setCsvLoading(true)
              try {
                await exportExpedientesToCSV()
                toast.success('Expedientes exportados a CSV')
              } catch (err) {
                toast.error('Error al exportar', err instanceof Error ? err.message : 'Error desconocido')
              } finally {
                setCsvLoading(false)
              }
            }}
            disabled={csvLoading}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            {csvLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {csvLoading ? 'Exportando...' : 'Exportar CSV'}
          </button>
          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-white/10 bg-white/5 p-0.5">
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                'rounded-md p-1.5 transition-colors',
                viewMode === 'table' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5'
              )}
              title="Vista tabla"
            >
              <LayoutList className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={cn(
                'rounded-md p-1.5 transition-colors',
                viewMode === 'cards' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5'
              )}
              title="Vista tarjetas"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={() => navigate('/expedientes/nuevo')}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-cyan px-4 py-2 text-sm font-medium text-zinc-950 shadow-sm hover:opacity-90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nuevo Expediente</span>
            <span className="sm:hidden">Nuevo</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <ExpedienteFilters filters={filters} onChange={handleFilterChange} />

      {/* Table */}
      {isLoading ? (
        <TableSkeleton rows={8} columns={7} />
      ) : isError ? (
        <ErrorState
          message={error?.message ?? 'Error al cargar expedientes'}
          onRetry={() => refetch()}
        />
      ) : !data || data.data.length === 0 ? (
        (() => {
          const hasActiveFilters = Object.entries(filters).some(
            ([key, v]) => v != null && v !== '' && key !== 'page' && key !== 'pageSize'
          )
          return (
            <div className="flex flex-col items-center">
              <EmptyState
                icon={FileText}
                title="No se encontraron expedientes"
                description={
                  hasActiveFilters
                    ? 'No hay resultados con los filtros actuales.'
                    : 'Crea tu primer expediente para comenzar.'
                }
                actionLabel={hasActiveFilters ? undefined : 'Nuevo expediente'}
                onAction={hasActiveFilters ? undefined : () => navigate('/expedientes/nuevo')}
              />
              {hasActiveFilters && (
                <button
                  onClick={() => setFilters({ page: 1, pageSize: DEFAULT_PAGE_SIZE })}
                  className="mt-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-white/5 transition-colors"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          )
        })()
      ) : (
        <>
          {/* Bulk actions bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-950/20 px-4 py-2.5 animate-fade-in">
              <span className="text-sm font-medium text-amber-400">
                {selectedIds.size} seleccionado{selectedIds.size > 1 ? 's' : ''}
              </span>
              <div className="h-4 w-px bg-white/10" />
              <select
                defaultValue=""
                disabled={bulkLoading}
                onChange={(e) => {
                  const estado = e.target.value
                  if (!estado) return
                  e.target.value = ''
                  pendingBulkEstado.current = estado
                  setBulkConfirm({ estado, label: ESTADO_INTERNO_LABELS[estado as keyof typeof ESTADO_INTERNO_LABELS] ?? estado })
                }}
                className="h-8 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-800 dark:text-zinc-200 focus:border-amber-500/40 focus:outline-none disabled:opacity-50"
              >
                <option value="" disabled>Cambiar estado a...</option>
                {ESTADOS_PIPELINE.map((e) => (
                  <option key={e} value={e}>{ESTADO_INTERNO_LABELS[e]}</option>
                ))}
              </select>
              {bulkLoading && <Loader2 className="h-4 w-4 animate-spin text-amber-400" />}
              <button
                onClick={() => setSelectedIds(new Set())}
                className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-white/5 hover:text-zinc-800 dark:hover:text-zinc-200"
              >
                <X className="h-3.5 w-3.5" />
                Deseleccionar
              </button>
            </div>
          )}

          {/* Fetching overlay — visible during pagination / filter changes */}
          {isFetching && !isLoading && (
            <div className="flex items-center gap-2 text-xs text-amber-400">
              <div className="h-3 w-3 animate-spin rounded-full border border-amber-400 border-t-transparent" />
              Actualizando...
            </div>
          )}

          {/* Card view */}
          {viewMode === 'cards' ? (
            <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3", isFetching && !isLoading && "opacity-60 pointer-events-none transition-opacity")}>
              {data.data.map((expediente) => (
                <ExpedienteCard
                  key={expediente.id}
                  expediente={expediente}
                  onClick={() => navigate(`/expedientes/${expediente.id}`)}
                />
              ))}
            </div>
          ) : (
          /* Table container */
          <div className={cn("glass-card rounded-xl overflow-auto max-h-[calc(100vh-280px)] sm:max-h-[calc(100vh-320px)]", isFetching && !isLoading && "opacity-60 pointer-events-none transition-opacity")}>
            <table className="w-full text-left">
              <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-slate-900">
                <tr className="border-b border-zinc-200 dark:border-white/5">
                  <th className="w-[40px] px-4 py-3">
                    <input
                      type="checkbox"
                      checked={data.data.length > 0 && data.data.every((e) => selectedIds.has(e.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(new Set(data.data.map((exp) => exp.id)))
                        } else {
                          setSelectedIds(new Set())
                        }
                      }}
                      className="h-4 w-4 rounded border-white/20 bg-white/5 text-amber-500 focus:ring-amber-500/25 cursor-pointer"
                    />
                  </th>
                  <SortHeader
                    label="Expediente"
                    field="caratula"
                    currentSort={filters.sortBy}
                    currentOrder={filters.sortOrder}
                    onSort={handleSort}
                  />
                  <SortHeader
                    label="Estado"
                    field="estado_interno"
                    currentSort={filters.sortBy}
                    currentOrder={filters.sortOrder}
                    onSort={handleSort}
                    className="hidden sm:table-cell"
                  />
                  <SortHeader
                    label="Prioridad"
                    field="prioridad"
                    currentSort={filters.sortBy}
                    currentOrder={filters.sortOrder}
                    onSort={handleSort}
                    className="hidden md:table-cell"
                  />
                  <th className="hidden lg:table-cell px-4 py-3 text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                    Responsable
                  </th>
                  <SortHeader
                    label="Alta"
                    field="fecha_alta"
                    currentSort={filters.sortBy}
                    currentOrder={filters.sortOrder}
                    onSort={handleSort}
                    className="hidden md:table-cell"
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.data.map((expediente) => {
                  const cliente = expediente.clientes
                  const tipo = expediente.tipos_tramite
                  // Find the primary responsible (first member with rol='abogado')
                  const miembros = (expediente.miembros ?? []) as any[]
                  const abogadoMembro = miembros.find((m) => m.rol === 'abogado')?.perfil ?? null
                  const initials = cliente
                    ? `${(cliente.apellido?.[0] ?? '').toUpperCase()}${(cliente.nombre?.[0] ?? '').toUpperCase()}`
                    : '??'
                  const semaforoColor = calcularSemaforo({
                    estado_interno: expediente.estado_interno,
                    audiencias: expediente.audiencias ?? [],
                    tareas: expediente.tareas ?? [],
                  })

                  return (
                    <tr
                      key={expediente.id}
                      className={cn(
                        'cursor-pointer border-l-[3px] transition-colors',
                        getExpedienteRowClass({
                          estado_interno: expediente.estado_interno,
                          audiencias: expediente.audiencias ?? [],
                          tareas: expediente.tareas ?? [],
                        })
                      )}
                      onClick={() =>
                        navigate(`/expedientes/${expediente.id}`)
                      }
                    >
                      <td className="w-[40px] px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(expediente.id)}
                          onChange={() => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev)
                              if (next.has(expediente.id)) {
                                next.delete(expediente.id)
                              } else {
                                next.add(expediente.id)
                              }
                              return next
                            })
                          }}
                          className="h-4 w-4 rounded border-white/20 bg-white/5 text-amber-500 focus:ring-amber-500/25 cursor-pointer"
                        />
                      </td>

                      {/* Expediente: avatar + caratula + numero + tipo */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-xs font-bold text-amber-400">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
                              {expediente.caratula || `${cliente?.apellido ?? ''} ${cliente?.nombre ?? ''}`.trim() || '-'}
                            </p>
                            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                              {tipo && (
                                <span className="truncate">{tipo.nombre}</span>
                              )}
                              {(expediente as any).numero_expediente_anses && (
                                <>
                                  <span className="text-zinc-300 dark:text-zinc-600">·</span>
                                  <span className="text-amber-600 dark:text-amber-400 font-mono text-[10px] font-bold">ANSES: {(expediente as any).numero_expediente_anses}</span>
                                </>
                              )}
                              {tipo && (expediente as any).numero && (
                                <span className="text-zinc-700">·</span>
                              )}
                              <span className="font-mono text-zinc-600 text-[10px]">{(expediente as any).numero}</span>
                            </div>
                          </div>
                          {cliente?.telefono && (
                            <WhatsAppButton phone={cliente.telefono} variant="icon" />
                          )}
                        </div>
                      </td>

                      <td className="hidden sm:table-cell px-4 py-3">
                        <EstadoBadge
                          estado={expediente.estado_interno}
                          compact
                        />
                      </td>
                      <td className="hidden md:table-cell px-4 py-3">
                        <PrioridadBadge
                          prioridad={expediente.prioridad}
                          compact
                        />
                      </td>
                      <td className="hidden lg:table-cell px-4 py-3">
                        {abogadoMembro ? (
                          <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/5 text-[10px] font-bold text-zinc-600 dark:text-zinc-400">
                              {(abogadoMembro.nombre?.[0] ?? '').toUpperCase()}
                              {(abogadoMembro.apellido?.[0] ?? '').toUpperCase()}
                            </div>
                            <span className="truncate text-sm text-zinc-600 dark:text-zinc-400 max-w-[120px]">
                              {abogadoMembro.apellido}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-amber-400/80 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
                            ⚠ Sin asignar
                          </span>
                        )}
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 text-sm text-zinc-900 dark:text-zinc-500 whitespace-nowrap">
                        {formatDateShort(expediente.fecha_alta)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          )}

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Mostrando {(data.page - 1) * data.pageSize + 1} a{' '}
                {Math.min(data.page * data.pageSize, data.count)} de{' '}
                {data.count} expedientes
              </p>
              <div className="flex items-center gap-1">
                <button
                  disabled={data.page <= 1 || isFetching}
                  onClick={() => goToPage(data.page - 1)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-zinc-600 dark:text-zinc-400 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {Array.from({ length: data.totalPages }, (_, i) => i + 1)
                  .filter((page) => {
                    const current = data.page
                    return (
                      page === 1 ||
                      page === data.totalPages ||
                      Math.abs(page - current) <= 2
                    )
                  })
                  .map((page, idx, arr) => {
                    const showEllipsis =
                      idx > 0 && page - arr[idx - 1] > 1

                    return (
                      <div key={page} className="flex items-center">
                        {showEllipsis && (
                          <span className="px-1.5 text-xs text-zinc-900 dark:text-zinc-500">
                            ...
                          </span>
                        )}
                        <button
                          onClick={() => goToPage(page)}
                          className={
                            page === data.page
                              ? 'flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-cyan text-sm font-medium text-zinc-950'
                              : 'flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-white/5'
                          }
                        >
                          {page}
                        </button>
                      </div>
                    )
                  })}

                <button
                  disabled={data.page >= data.totalPages || isFetching}
                  onClick={() => goToPage(data.page + 1)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-zinc-600 dark:text-zinc-400 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Bulk state change confirmation */}
      <ConfirmDialog
        open={bulkConfirm !== null}
        onClose={() => setBulkConfirm(null)}
        onConfirm={async () => {
          const estado = pendingBulkEstado.current
          if (!estado) return
          setBulkLoading(true)
          setBulkConfirm(null)
          const ids = [...selectedIds]
          for (const expId of ids) {
            try {
              await cambiarEstado.mutateAsync({ expediente_id: expId, nuevo_estado: estado as any })
            } catch { /* toast handled globally */ }
          }
          setBulkLoading(false)
          setSelectedIds(new Set())
          toast.success(`Estado cambiado en ${ids.length} expediente${ids.length > 1 ? 's' : ''}`)
        }}
        title="Cambiar estado en lote"
        description={bulkConfirm ? `¿Cambiar el estado de ${selectedIds.size} expediente${selectedIds.size > 1 ? 's' : ''} a "${bulkConfirm.label}"?` : ''}
        confirmLabel="Cambiar estado"
        variant="warning"
        isPending={bulkLoading}
      />
    </div>
  )
}

import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { EstadoBadge } from '@/components/shared/estado-badge'
import { PrioridadBadge } from '@/components/shared/prioridad-badge'
import { SaludDot, SaludMotivo } from '@/components/expedientes/salud-indicador'
import { TableroEtapas } from '@/components/expedientes/tablero-etapas'
import { useExpedientesSalud, type SaludExpediente } from '@/hooks/use-expediente-salud'
import { useAuth } from '@/hooks/use-auth'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { ExpedienteFilters } from '@/components/expedientes/expediente-filters'
import { FavoritoStar } from '@/components/expedientes/favorito-star'
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
  Database,
  ChevronLeft,
  ChevronRight,
  FileText,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  LayoutGrid,
  LayoutList,
  Columns3,
  X,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { ESTADOS_PIPELINE, ESTADO_INTERNO_LABELS } from '@/types/enums'
import { timeAgo } from '@/lib/utils/date-helpers'
import { useSaeNovedadesPorExpediente } from '@/hooks/use-sae-notificaciones'

// ---------------------------------------------------------------------------
// Fuero badge
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// SAE sync pill — muestra cuándo fue la última sincronización
// ---------------------------------------------------------------------------

function SyncPill({ fecha, className }: { fecha?: string | null; className?: string }) {
  if (!fecha) return null
  return (
    <span className={cn('flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500', className)}>
      <RefreshCw className="h-2.5 w-2.5" />
      {timeAgo(fecha)}
    </span>
  )
}

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
        isActive ? 'text-amber-400' : 'text-zinc-600 dark:text-zinc-300',
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

/** Chip de novedades del SAE sin leer. */
function NovedadesChip({ n, className }: { n?: number; className?: string }) {
  if (!n) return null
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 font-mono text-[10.5px] leading-5 text-cyan-700 dark:text-cyan-300', className)} title="Novedades del SAE sin leer">
      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />{n} {n === 1 ? 'novedad' : 'novedades'}
    </span>
  )
}

const ESTADO_CORTO: Record<string, string> = {
  NUEVA_CONSULTA: 'consulta', PARA_INICIAR: 'para iniciar', INICIADO: 'en trámite', PRUEBA: 'prueba', ALEGATOS: 'alegatos',
  SENTENCIA: 'sentencia', APELACION: 'apelación', CORTE: 'corte', FINALIZADO: 'finalizado', NO_VIABLE_RECHAZADO: 'rechazado', PAUSADO: 'pausado',
}

function ExpedienteCard({ expediente, salud, novedades, onClick }: { expediente: any; salud?: SaludExpediente; novedades?: number; onClick: () => void }) {
  const cliente = expediente.clientes
  const clienteFull = cliente ? `${cliente.apellido ?? ''} ${cliente.nombre ?? ''}`.trim() : ''
  const title = expediente.caratula || clienteFull || expediente.numero || '-'
  const dias = salud?.dias_sin_movimiento
  const prioridadAlta = expediente.prioridad === 'ALTA' || expediente.prioridad === 'URGENTE'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
      className={cn(
        'app-card group w-full cursor-pointer px-4 py-3 text-left transition-colors hover:border-zinc-300 dark:hover:border-white/15',
        novedades ? 'dark:!border-cyan-400/20' : '',
      )}
    >
      <div className="flex items-start gap-2.5">
        <SaludDot salud={salud} className="mt-[7px]" />
        <p className="line-clamp-2 min-w-0 flex-1 text-[13.5px] font-semibold leading-snug text-zinc-900 dark:text-zinc-50">{title}</p>
        <span onClick={(e) => e.stopPropagation()}><FavoritoStar expedienteId={expediente.id} className="-mr-1 -mt-1" /></span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-[18px] font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
        {expediente.numero_sae ? <span>SAE {expediente.numero_sae}</span> : <span>{expediente.numero}</span>}
        <span className="text-zinc-300 dark:text-zinc-600">·</span>
        <span>{ESTADO_CORTO[expediente.estado_interno] ?? expediente.estado_interno}</span>
        {dias != null && expediente.numero_sae && (
          <>
            <span className="text-zinc-300 dark:text-zinc-600">·</span>
            <span className={cn(dias >= 120 ? 'text-rose-600 dark:text-rose-400' : dias >= 60 ? 'text-amber-600 dark:text-amber-400' : '')}>
              {dias === 0 ? 'mov. hoy' : `${dias} d sin mov.`}
            </span>
          </>
        )}
        {prioridadAlta && <span className="text-rose-600 dark:text-rose-400">· {String(expediente.prioridad).toLowerCase()}</span>}
      </div>
      {(novedades || (salud && salud.motivos.length > 0)) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-[18px]">
          <NovedadesChip n={novedades} />
          <SaludMotivo salud={salud} className="min-w-0" />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Filtros rápidos (un toque)
// ---------------------------------------------------------------------------

function FiltrosRapidos({ filters, setFilters, saludMap, novedades, profileId }: {
  filters: ExpedientesFilters
  setFilters: React.Dispatch<React.SetStateAction<ExpedientesFilters>>
  saludMap?: Map<string, SaludExpediente>
  novedades: number
  profileId: string | null
}) {
  const valores = saludMap ? [...saludMap.values()] : []
  const n = {
    urgentes: valores.filter((v) => v.semaforo === 'rojo').length,
    atencion: valores.filter((v) => v.semaforo === 'amarillo').length,
    dormidos: valores.filter((v) => v.dormido).length,
  }
  const chips: { id: string; label: string; activo: boolean; count?: number; dot?: string; onClick: () => void }[] = [
    {
      id: 'todos', label: 'Todos',
      activo: !filters.salud && !filters.abogado_id && !filters.estado_interno && !filters.favoritos,
      onClick: () => setFilters((p) => ({ ...p, salud: null, abogado_id: null, estado_interno: null, favoritos: null, page: 1 })),
    },
    ...(profileId ? [{
      id: 'mios', label: 'Míos', activo: filters.abogado_id === profileId,
      onClick: () => setFilters((p) => ({ ...p, abogado_id: p.abogado_id === profileId ? null : profileId, page: 1 })),
    }] : []),
    {
      id: 'novedades', label: 'Con novedades SAE', activo: filters.salud === 'novedades', count: novedades, dot: 'bg-cyan-400',
      onClick: () => setFilters((p) => ({ ...p, salud: p.salud === 'novedades' ? null : 'novedades', page: 1 })),
    },
    {
      id: 'urgentes', label: 'Urgentes', activo: filters.salud === 'urgentes', count: n.urgentes, dot: 'bg-rose-500',
      onClick: () => setFilters((p) => ({ ...p, salud: p.salud === 'urgentes' ? null : 'urgentes', page: 1 })),
    },
    {
      id: 'atencion', label: 'Requieren atención', activo: filters.salud === 'atencion', count: n.atencion, dot: 'bg-amber-400',
      onClick: () => setFilters((p) => ({ ...p, salud: p.salud === 'atencion' ? null : 'atencion', page: 1 })),
    },
    {
      id: 'dormidos', label: 'Dormidos', activo: filters.salud === 'dormidos', count: n.dormidos,
      onClick: () => setFilters((p) => ({ ...p, salud: p.salud === 'dormidos' ? null : 'dormidos', page: 1 })),
    },
    {
      id: 'iniciar', label: 'Para iniciar', activo: filters.estado_interno === 'PARA_INICIAR',
      onClick: () => setFilters((p) => ({ ...p, estado_interno: p.estado_interno === 'PARA_INICIAR' ? null : 'PARA_INICIAR', page: 1 })),
    },
  ]
  return (
    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
      {chips.map((c) => (
        <button
          key={c.id}
          onClick={c.onClick}
          aria-pressed={c.activo}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
            c.activo
              ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white/20 dark:bg-white/10 dark:text-white'
              : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:border-white/[0.08] dark:bg-transparent dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-zinc-200',
          )}
        >
          {c.dot && <span className={cn('h-2 w-2 rounded-full', c.dot)} />}
          {c.label}
          {c.count != null && c.count > 0 && <span className={cn('font-mono text-[10.5px]', c.activo ? 'opacity-80' : 'text-zinc-400 dark:text-zinc-500')}>{c.count}</span>}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// URL ↔ Filter sync helpers
// ---------------------------------------------------------------------------

const FILTER_PARAMS = ['tipo_tramite_id', 'tipo_proceso_id', 'estado_interno', 'abogado_id', 'prioridad', 'fuero', 'search', 'favoritos', 'salud', 'sortBy', 'sortOrder', 'page'] as const

function filtersFromParams(params: URLSearchParams): ExpedientesFilters {
  const f: ExpedientesFilters = { page: 1, pageSize: DEFAULT_PAGE_SIZE }
  const tipo = params.get('tipo_tramite_id')
  if (tipo) f.tipo_tramite_id = tipo
  const estado = params.get('estado_interno')
  if (estado) f.estado_interno = estado as any
  const abogado = params.get('abogado_id')
  if (abogado) f.abogado_id = abogado
  const prioridad = params.get('prioridad')
  if (prioridad) f.prioridad = prioridad as any
  const fuero = params.get('fuero')
  if (fuero) f.fuero = fuero
  const tipoProceso = params.get('tipo_proceso_id')
  if (tipoProceso) f.tipo_proceso_id = tipoProceso
  const search = params.get('search')
  if (search) f.search = search
  if (params.get('favoritos') === 'true') f.favoritos = true
  const salud = params.get('salud')
  if (salud === 'urgentes' || salud === 'atencion' || salud === 'dormidos' || salud === 'novedades') f.salud = salud
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

  const enTablero = viewMode === 'etapas'
  const { data, isLoading, isFetching, isError, error, refetch } = useExpedientes(filters)
  const { data: saludMap } = useExpedientesSalud(null)
  const { data: novedadesMap } = useSaeNovedadesPorExpediente()
  const { profile } = useAuth()

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
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Expedientes
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {data ? `${data.count} en total · gestión del estudio` : 'Gestión del estudio'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Vista: lista, tarjetas o tablero por etapa */}
          <div className="flex items-center rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-0.5">
            {([
              { modo: 'table', icon: LayoutList, label: 'Lista', soloDesktop: true },
              { modo: 'cards', icon: LayoutGrid, label: 'Tarjetas', soloDesktop: false },
              { modo: 'etapas', icon: Columns3, label: 'Por etapa', soloDesktop: false },
            ] as const).map(({ modo, icon: Icon, label, soloDesktop }) => {
              const activo = viewMode === modo
              return (
                <button
                  key={modo}
                  onClick={() => setViewMode(modo)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                    soloDesktop && 'hidden sm:flex',
                    activo
                      ? 'bg-[var(--brand-navy)] text-white dark:bg-white dark:text-[var(--brand-navy)]'
                      : modo === 'cards' && viewMode === 'table'
                        // En el celular la lista se ve como tarjetas
                        ? 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10 max-sm:bg-[var(--brand-navy)] max-sm:text-white max-sm:dark:bg-white max-sm:dark:text-[var(--brand-navy)]'
                        : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10',
                  )}
                  title={label}
                  aria-pressed={activo}
                >
                  <Icon className="h-4 w-4" />
                  <span className={cn(modo !== 'etapas' && 'sr-only')}>{label}</span>
                </button>
              )
            })}
          </div>
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
            className="flex min-h-[38px] items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            {csvLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span className="hidden sm:inline">{csvLoading ? 'Exportando…' : 'Exportar CSV'}</span>
          </button>
          <button
            onClick={() => navigate('/importar-sae')}
            className="flex min-h-[38px] items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/10 transition-colors"
          >
            <Database className="h-4 w-4" />
            <span className="hidden sm:inline">Importar SAE</span>
          </button>
          <button
            onClick={() => navigate('/expedientes/nuevo')}
            className="flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[var(--brand-navy)] dark:bg-white px-4 text-sm font-medium text-white dark:text-[var(--brand-navy)] shadow-sm hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nuevo expediente</span>
            <span className="sm:hidden">Nuevo</span>
          </button>
        </div>
      </div>

      {/* Filtros rápidos */}
      <FiltrosRapidos filters={filters} setFilters={setFilters} saludMap={saludMap} novedades={novedadesMap?.size ?? 0} profileId={profile?.id ?? null} />

      {/* Filters */}
      <ExpedienteFilters filters={filters} onChange={handleFilterChange} />

      {enTablero ? (
        <TableroEtapas filters={filters} />
      ) : isLoading ? (
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
                className="h-8 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-800 dark:text-zinc-200 focus:border-cyan-500/40 focus:outline-none disabled:opacity-50"
              >
                <option value="" disabled>Cambiar estado a...</option>
                {ESTADOS_PIPELINE.map((e) => (
                  <option key={e} value={e}>{ESTADO_INTERNO_LABELS[e]}</option>
                ))}
              </select>
              {bulkLoading && <Loader2 className="h-4 w-4 animate-spin text-amber-400" />}
              <button
                onClick={() => setSelectedIds(new Set())}
                className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-white/5 hover:text-zinc-800 dark:hover:text-zinc-200"
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

          {/* Card view — siempre en mobile, opt-in en sm+ */}
          {viewMode === 'cards' ? (
            <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3", isFetching && !isLoading && "opacity-60 pointer-events-none transition-opacity")}>
              {data.data.map((expediente) => (
                <ExpedienteCard
                  key={expediente.id}
                  expediente={expediente}
                  salud={saludMap?.get(expediente.id)}
                  novedades={novedadesMap?.get(expediente.id)}
                  onClick={() => navigate(`/expedientes/${expediente.id}`)}
                />
              ))}
            </div>
          ) : (
          <>
            {/* En mobile siempre cards aunque viewMode='table' */}
            <div className={cn("grid grid-cols-1 gap-3 sm:hidden", isFetching && !isLoading && "opacity-60 pointer-events-none transition-opacity")}>
              {data.data.map((expediente) => (
                <ExpedienteCard
                  key={expediente.id}
                  expediente={expediente}
                  salud={saludMap?.get(expediente.id)}
                  novedades={novedadesMap?.get(expediente.id)}
                  onClick={() => navigate(`/expedientes/${expediente.id}`)}
                />
              ))}
            </div>

          {/* Table container — solo sm+ */}
          <div className={cn("hidden sm:block rounded-xl overflow-auto border border-zinc-200 dark:border-white/10 bg-white dark:bg-[var(--card)] max-h-[calc(100vh-280px)] sm:max-h-[calc(100vh-320px)]", isFetching && !isLoading && "opacity-60 pointer-events-none transition-opacity")}>
            <table className="w-full text-left">
              <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-[var(--card)]">
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
                      className="h-4 w-4 rounded border-white/20 bg-white/5 text-amber-500 focus:ring-cyan-500/25 cursor-pointer"
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
                  <th className="hidden lg:table-cell px-4 py-3 text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
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
                  const abogadoMembro = (expediente as any).abogado_responsable ?? miembros.find((m) => m.rol === 'abogado')?.perfil ?? null
                  const salud = saludMap?.get(expediente.id)

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
                          className="h-4 w-4 rounded border-white/20 bg-white/5 text-amber-500 focus:ring-cyan-500/25 cursor-pointer"
                        />
                      </td>

                      {/* Expediente: avatar + caratula + numero + tipo + fuero */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <FavoritoStar expedienteId={expediente.id} className="-ml-2 -mr-1" />
                          <SaludDot salud={salud} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
                                {expediente.caratula || `${cliente?.apellido ?? ''} ${cliente?.nombre ?? ''}`.trim() || '-'}
                              </p>
                              <NovedadesChip n={novedadesMap?.get(expediente.id)} />
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                              {tipo && (
                                <span className="truncate">{tipo.nombre}</span>
                              )}
                              {(expediente as any).numero_sae && (
                                <>
                                  <span className="text-zinc-300 dark:text-zinc-600">·</span>
                                  <span className="font-mono text-[10.5px] text-zinc-500 dark:text-zinc-400">SAE {(expediente as any).numero_sae}</span>
                                </>
                              )}
                              {tipo && (expediente as any).numero && (
                                <span className="text-zinc-700 dark:text-zinc-200">·</span>
                              )}
                              <span className="font-mono text-zinc-600 dark:text-zinc-300 text-[10px]">{(expediente as any).numero}</span>
                              <SyncPill fecha={(expediente as any).ultima_sincronizacion_sae} className="hidden xl:flex ml-1" />
                            </div>
                            {(expediente as any).organismo?.nombre && (
                              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5 max-w-[260px] group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors">
                                {(expediente as any).organismo.nombre}
                              </p>
                            )}
                            <SaludMotivo salud={salud} className="mt-0.5 max-w-[420px]" />
                          </div>
                          {cliente?.telefono && (
                            <div onClick={(e) => e.stopPropagation()}>
                              <WhatsAppButton phone={cliente.telefono} variant="icon" />
                            </div>
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
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/5 text-[10px] font-bold text-zinc-600 dark:text-zinc-300">
                              {(abogadoMembro.nombre?.[0] ?? '').toUpperCase()}
                              {(abogadoMembro.apellido?.[0] ?? '').toUpperCase()}
                            </div>
                            <span className="truncate text-sm text-zinc-600 dark:text-zinc-300 max-w-[120px]">
                              {abogadoMembro.apellido}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-amber-400/80 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
                            ⚠ Sin asignar
                          </span>
                        )}
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                        {formatDateShort(expediente.fecha_alta)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          </>
          )}

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-600 dark:text-zinc-300">
                Mostrando {(data.page - 1) * data.pageSize + 1} a{' '}
                {Math.min(data.page * data.pageSize, data.count)} de{' '}
                {data.count} expedientes
              </p>
              <div className="flex items-center gap-1">
                <button
                  disabled={data.page <= 1 || isFetching}
                  onClick={() => goToPage(data.page - 1)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-zinc-600 dark:text-zinc-300 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
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
                          <span className="px-1.5 text-xs text-zinc-700 dark:text-zinc-300">
                            ...
                          </span>
                        )}
                        <button
                          onClick={() => goToPage(page)}
                          className={
                            page === data.page
                              ? 'flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-cyan text-sm font-medium text-zinc-950'
                              : 'flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-white/5'
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
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-zinc-600 dark:text-zinc-300 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
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

import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { WhatsAppButton } from '@/components/shared/whatsapp-button'
import { Link } from 'react-router-dom'
import { useClientes, useClientesPlaceholderPendientes, type ClientesFilters, type ClienteListItem } from '@/hooks/use-clientes'
import { exportClientePDF } from '@/lib/utils/export-client-pdf'
import { DEFAULT_PAGE_SIZE } from '@/lib/utils/constants'
import { timeAgo } from '@/lib/utils/date-helpers'
import { toast } from '@/stores/toast-store'
import { cn } from '@/lib/utils'
import { isEstadoTerminal } from '@/types/enums'
import {
  Plus,
  Search,
  Users,
  Phone,
  Mail,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  Clock,
  Download,
  AlertCircle,
  ArrowRight,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getExpedienteStatusSummary(expedientes: { id: string; estado_interno: string }[]) {
  const active = expedientes.filter(e =>
    !isEstadoTerminal(e.estado_interno)
  ).length
  const resolved = expedientes.filter(e =>
    e.estado_interno === 'FINALIZADO'
  ).length
  return { total: expedientes.length, active, resolved }
}

// ---------------------------------------------------------------------------
// Client Card
// ---------------------------------------------------------------------------

function ClienteCard({
  cliente,
  onClick,
  onExportPDF,
}: {
  cliente: ClienteListItem
  onClick: () => void
  onExportPDF: (c: ClienteListItem) => void
}) {
  const stats = getExpedienteStatusSummary(cliente.expedientes ?? [])
  const hasUltimoContacto = !!cliente.ultimo_contacto

  const isPlaceholder = cliente.apellido === 'Importado SAE'

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group w-full text-left rounded-xl p-4 cursor-pointer transition-all',
        'border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/80',
        'hover:border-zinc-300 dark:hover:border-white/20 hover:shadow-sm',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {/* Name + DNI */}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
            {cliente.apellido}, {cliente.nombre}
          </h3>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-zinc-500 dark:text-zinc-400 flex-wrap">
            <CreditCard className="h-3 w-3 shrink-0" />
            <span className="font-mono">DNI {cliente.dni}</span>
            {cliente.cuil && (
              <>
                <span className="text-zinc-300 dark:text-zinc-600">·</span>
                <span className="font-mono">{cliente.cuil}</span>
              </>
            )}
          </div>
          {isPlaceholder && (
            <span className="inline-block mt-1.5 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400">
              Placeholder SAE
            </span>
          )}
        </div>

        {/* Expediente count badge */}
        <div className={cn(
          'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border flex-shrink-0',
          stats.active > 0
            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20'
            : stats.total > 0
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
              : 'bg-zinc-100 dark:bg-white/5 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-white/10',
        )}>
          <FolderOpen className="h-2.5 w-2.5" />
          {stats.total} exp.
        </div>
      </div>

      {/* Contact info */}
      {(cliente.telefono || cliente.email) && (
        <div className="mt-3 space-y-1">
          {cliente.telefono && (
            <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
              <Phone className="h-3 w-3 shrink-0 text-zinc-400" />
              <span className="flex-1 truncate">{cliente.telefono}</span>
              <span onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
                <WhatsAppButton
                  phone={cliente.telefono}
                  variant="icon"
                  clienteNombre={`${cliente.nombre} ${cliente.apellido}`}
                />
              </span>
            </div>
          )}
          {cliente.email && (
            <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
              <Mail className="h-3 w-3 shrink-0 text-zinc-400" />
              <span className="truncate">{cliente.email}</span>
            </div>
          )}
        </div>
      )}

      {/* Footer: ultimo contacto + actions */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-200 dark:border-white/5 pt-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 dark:text-zinc-400 min-w-0">
          <Clock className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {hasUltimoContacto
              ? `Último contacto: ${timeAgo(cliente.ultimo_contacto!)}`
              : 'Sin contacto registrado'
            }
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onExportPDF(cliente) }}
          className="rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100"
          title="Exportar informe del cliente"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ClientesPage() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState<ClientesFilters>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  })
  const [searchInput, setSearchInput] = useState('')

  const { data, isLoading, isError, error, refetch } = useClientes(filters)

  // Debounced search: triggers after 300ms of no typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => ({
        ...prev,
        search: searchInput || null,
        page: 1,
      }))
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const goToPage = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }))
  }, [])

  const handleExportPDF = async (cliente: ClienteListItem) => {
    try {
      await exportClientePDF(cliente)
      toast.success(`Informe de ${cliente.apellido} generado`)
    } catch {
      toast.error('Error al generar informe')
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Banner duplicados pendientes */}
      <PlaceholdersBanner />

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Clientes
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {data ? `${data.count} en total · gestión del estudio` : 'Gestión del estudio'}
          </p>
        </div>
        <button
          onClick={() => navigate('/clientes/nuevo')}
          className="flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg bg-[var(--brand-navy)] dark:bg-white px-4 text-sm font-medium text-white dark:text-[var(--brand-navy)] shadow-sm hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          <span>Nuevo cliente</span>
        </button>
      </div>

      {/* Search bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          placeholder="Buscar por nombre, DNI, CUIL, email, teléfono..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="h-9 w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 pl-9 pr-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:border-[var(--brand-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/20"
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <TableSkeleton rows={6} columns={5} />
      ) : isError ? (
        <ErrorState
          message={error?.message ?? 'Error al cargar clientes'}
          onRetry={() => refetch()}
        />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No se encontraron clientes"
          description={
            filters.search
              ? 'Intenta con otros términos de búsqueda.'
              : 'Crea tu primer cliente para comenzar.'
          }
          actionLabel="Nuevo cliente"
          onAction={() => navigate('/clientes/nuevo')}
        />
      ) : (
        <>
          {/* Card grid */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.data.map((cliente) => (
              <ClienteCard
                key={cliente.id}
                cliente={cliente}
                onClick={() => navigate(`/clientes/${cliente.id}`)}
                onExportPDF={handleExportPDF}
              />
            ))}
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-600 dark:text-zinc-300">
                Mostrando {(data.page - 1) * data.pageSize + 1} a{' '}
                {Math.min(data.page * data.pageSize, data.count)} de{' '}
                {data.count} clientes
              </p>
              <div className="flex items-center gap-1">
                <button
                  disabled={data.page <= 1}
                  onClick={() => goToPage(data.page - 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-3 text-xs text-zinc-600 dark:text-zinc-300">
                  {data.page} / {data.totalPages}
                </span>
                <button
                  disabled={data.page >= data.totalPages}
                  onClick={() => goToPage(data.page + 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Banner: placeholders SAE pendientes de consolidación ──────────────────

function PlaceholdersBanner() {
  const { data: placeholders = [] } = useClientesPlaceholderPendientes()
  if (placeholders.length === 0) return null

  const totalExp = placeholders.reduce((sum, p) => sum + p.expedientes_count, 0)

  return (
    <Link
      to="/clientes/resolver"
      className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 hover:bg-amber-500/10 transition-colors group"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            {placeholders.length} cliente{placeholders.length === 1 ? '' : 's'} placeholder pendiente{placeholders.length === 1 ? '' : 's'} de consolidación
          </p>
          <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-0.5">
            Vienen de importaciones SAE sin cliente real asociado · {totalExp} expediente{totalExp === 1 ? '' : 's'} en total
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 text-sm font-medium text-amber-700 dark:text-amber-400 group-hover:gap-1.5 transition-all flex-shrink-0">
        <span className="hidden sm:inline">Resolver</span>
        <ArrowRight className="h-4 w-4" />
      </div>
    </Link>
  )
}

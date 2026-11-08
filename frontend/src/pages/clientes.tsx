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
  ChevronLeft,
  ChevronRight,
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
  const esJuridica = (cliente as any).tipo_persona === 'juridica'
  const nombreMostrar = esJuridica
    ? ((cliente as any).razon_social ?? '—')
    : `${cliente.apellido ?? ''}, ${cliente.nombre ?? ''}`.replace(/^,\s*/, '') || '—'

  const doc = esJuridica ? (cliente.cuil ? `CUIT ${cliente.cuil}` : null) : (cliente.dni ? `DNI ${cliente.dni}` : cliente.cuil ? `CUIL ${cliente.cuil}` : null)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
      className="app-card group w-full cursor-pointer px-4 py-3 text-left transition-colors hover:border-zinc-300 dark:hover:border-white/15"
    >
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-zinc-900 dark:text-zinc-100">{nombreMostrar}</h3>
        <button
          onClick={(e) => { e.stopPropagation(); onExportPDF(cliente) }}
          className="hidden shrink-0 rounded p-0.5 text-zinc-400 opacity-0 transition-opacity hover:text-zinc-700 group-hover:opacity-100 sm:block dark:hover:text-zinc-200"
          title="Exportar informe del cliente"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
        {stats.total > 0 && (
          <span className={cn('shrink-0 font-mono text-[11px]', stats.active > 0 ? 'text-zinc-700 dark:text-zinc-200' : 'text-zinc-400 dark:text-zinc-500')}
            title={`${stats.active} activos de ${stats.total}`}>
            {stats.total} exp.
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
        {esJuridica && <span>jurídica</span>}
        {isPlaceholder ? <span className="text-amber-600 dark:text-amber-400">sin datos reales (importado del SAE)</span> : doc && <span>{doc}</span>}
        {cliente.telefono && <><span className="text-zinc-300 dark:text-zinc-600">·</span><span className="truncate">{cliente.telefono}</span></>}
        {cliente.telefono && (
          <span onClick={(e) => e.stopPropagation()} className="ml-auto shrink-0">
            <WhatsAppButton phone={cliente.telefono} variant="icon" clienteNombre={esJuridica ? ((cliente as any).razon_social ?? '') : `${cliente.nombre ?? ''} ${cliente.apellido ?? ''}`.trim()} />
          </span>
        )}
      </div>
      {hasUltimoContacto && (
        <p className="mt-1 font-mono text-[11px] text-zinc-400 dark:text-zinc-500">último contacto {timeAgo(cliente.ultimo_contacto!)}</p>
      )}
    </div>
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

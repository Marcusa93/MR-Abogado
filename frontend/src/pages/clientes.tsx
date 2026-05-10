import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { WhatsAppButton } from '@/components/shared/whatsapp-button'
import { useClientes, type ClientesFilters, type ClienteListItem } from '@/hooks/use-clientes'
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

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer glass-card rounded-xl p-4 card-lift transition-all hover:border-amber-500/20 hover:shadow-[0_0_12px_oklch(0.75_0.11_85_/_8%)]"
    >
      <div className="flex items-start justify-between">
        {/* Name + DNI */}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-amber-400 transition-colors">
            {cliente.apellido} {cliente.nombre}
          </h3>
          <div className="flex items-center gap-2 mt-1 text-xs text-zinc-900 dark:text-zinc-500">
            <CreditCard className="h-3 w-3 shrink-0" />
            <span>DNI: {cliente.dni}</span>
            {cliente.cuil && (
              <>
                <span className="text-zinc-700">|</span>
                <span>{cliente.cuil}</span>
              </>
            )}
          </div>
        </div>

        {/* Expediente count badge */}
        <div className={cn(
          'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
          stats.active > 0
            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
            : stats.total > 0
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
              : 'bg-white/5 text-zinc-900 dark:text-zinc-500 border border-white/10'
        )}>
          <FolderOpen className="h-2.5 w-2.5" />
          {stats.total} exp.
        </div>
      </div>

      {/* Contact info */}
      <div className="mt-3 space-y-1">
        {cliente.telefono && (
          <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <Phone className="h-3 w-3 shrink-0 text-zinc-900 dark:text-zinc-500" />
            <span className="flex-1">{cliente.telefono}</span>
            <WhatsAppButton
              phone={cliente.telefono}
              variant="icon"
              clienteNombre={`${cliente.nombre} ${cliente.apellido}`}
            />
          </div>
        )}
        {cliente.email && (
          <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <Mail className="h-3 w-3 shrink-0 text-zinc-900 dark:text-zinc-500" />
            <span className="truncate">{cliente.email}</span>
          </div>
        )}
      </div>

      {/* Footer: ultimo contacto + actions */}
      <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-900 dark:text-zinc-500">
          <Clock className="h-3 w-3" />
          {hasUltimoContacto
            ? `Último contacto: ${timeAgo(cliente.ultimo_contacto!)}`
            : 'Sin contacto registrado'
          }
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onExportPDF(cliente) }}
          className="rounded p-1 text-zinc-600 hover:text-amber-400 transition-colors opacity-0 group-hover:opacity-100"
          title="Exportar informe del cliente"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
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
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gradient-cyan">
            Clientes
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {data ? `${data.count} clientes registrados` : 'Gestión de clientes del estudio'}
          </p>
        </div>
        <button
          onClick={() => navigate('/clientes/nuevo')}
          className="flex items-center gap-1.5 rounded-lg bg-gradient-cyan px-4 py-2 text-sm font-medium text-zinc-950 shadow-sm hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nuevo Cliente</span>
          <span className="sm:hidden">Nuevo</span>
        </button>
      </div>

      {/* Search bar — instant debounced */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-900 dark:text-zinc-500" />
        <input
          type="text"
          placeholder="Buscar por nombre, DNI, CUIL, email, teléfono..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="h-9 w-full rounded-lg border border-white/10 bg-white/5 pl-9 pr-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
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
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Mostrando {(data.page - 1) * data.pageSize + 1} a{' '}
                {Math.min(data.page * data.pageSize, data.count)} de{' '}
                {data.count} clientes
              </p>
              <div className="flex items-center gap-1">
                <button
                  disabled={data.page <= 1}
                  onClick={() => goToPage(data.page - 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-600 dark:text-zinc-400 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-3 text-xs text-zinc-600 dark:text-zinc-400">
                  {data.page} / {data.totalPages}
                </span>
                <button
                  disabled={data.page >= data.totalPages}
                  onClick={() => goToPage(data.page + 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-600 dark:text-zinc-400 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
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

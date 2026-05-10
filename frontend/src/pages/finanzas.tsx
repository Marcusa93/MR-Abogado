import { useState, useMemo } from 'react'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useNavigate } from 'react-router-dom'
import {
  useMovimientos,
  useMovimientosStats,
  useCreateMovimiento,
  useDeleteMovimiento,
  CATEGORIA_LABELS,
  CATEGORIAS_INGRESO,
  CATEGORIAS_EGRESO,
  type TipoMovimiento,
  type CategoriaMovimiento,
  type MovimientosFilters,
  type MovimientoWithCreator,
} from '@/hooks/use-movimientos'
import { useAuditLog, type AuditEntry } from '@/hooks/use-audit-log'
import { useTeamMembers } from '@/hooks/use-team-members'
import { useAuth } from '@/hooks/use-auth'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toast-store'
import { formatDateShort, timeAgo } from '@/lib/utils/date-helpers'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Plus,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2,
  ArrowUpCircle,
  ArrowDownCircle,
  Wallet,
  Activity,
  LogIn,
  FilePlus,
  FileEdit,
  Trash2 as TrashIcon,
  ArrowRightLeft,
  Eye,
  Clock,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMoney(n: number): string {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 })
}

const METODO_LABELS: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  CHEQUE: 'Cheque',
  OTRO: 'Otro',
}

// Activity helpers
const ACCION_CONFIG: Record<string, { icon: typeof Activity; label: string; color: string }> = {
  LOGIN: { icon: LogIn, label: 'Sesión', color: 'text-amber-400' },
  INSERT: { icon: FilePlus, label: 'Creación', color: 'text-emerald-400' },
  UPDATE: { icon: FileEdit, label: 'Modificación', color: 'text-amber-400' },
  DELETE: { icon: TrashIcon, label: 'Eliminación', color: 'text-rose-400' },
  STATE_CHANGE: { icon: ArrowRightLeft, label: 'Cambio estado', color: 'text-violet-400' },
  SENSITIVE_ACCESS: { icon: Eye, label: 'Acceso sensible', color: 'text-rose-400' },
}

const TABLA_LABELS: Record<string, string> = {
  expedientes: 'Expediente',
  clientes: 'Cliente',
  tareas: 'Tarea',
  seguimientos_anses: 'Seguimiento',
  acuerdos_honorarios: 'Honorario',
  cobros: 'Cobro',
  movimientos: 'Movimiento',
  auth: 'Sesion',
}

function describeEntry(entry: AuditEntry): string {
  const tabla = TABLA_LABELS[entry.tabla] ?? entry.tabla
  const datos = entry.datos_nuevos as Record<string, unknown> | null
  if (entry.accion === 'LOGIN') return 'Inicio sesion'
  if (entry.accion === 'STATE_CHANGE' && entry.tabla === 'expedientes') {
    const antes = (entry.datos_anteriores as Record<string, unknown>)?.estado_interno ?? '?'
    const despues = datos?.estado_interno ?? '?'
    return `Cambio estado: "${antes}" -> "${despues}"`
  }
  if (entry.accion === 'INSERT') {
    const nombre = datos?.numero ?? datos?.nombre ?? datos?.titulo ?? datos?.descripcion ?? ''
    return `Creo ${tabla.toLowerCase()}${nombre ? `: ${String(nombre).slice(0, 40)}` : ''}`
  }
  if (entry.accion === 'UPDATE') return `Modifico ${tabla.toLowerCase()}`
  if (entry.accion === 'DELETE') return `Elimino ${tabla.toLowerCase()}`
  return `${ACCION_CONFIG[entry.accion]?.label ?? entry.accion} en ${tabla.toLowerCase()}`
}

// ---------------------------------------------------------------------------
// Create movimiento dialog
// ---------------------------------------------------------------------------

function CrearMovimientoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateMovimiento()
  const [tipo, setTipo] = useState<TipoMovimiento>('INGRESO')
  const [categoria, setCategoria] = useState<CategoriaMovimiento>('HONORARIO')
  const [monto, setMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [metodoPago, setMetodoPago] = useState('')

  const categorias = tipo === 'INGRESO' ? CATEGORIAS_INGRESO : CATEGORIAS_EGRESO

  function handleTipoChange(t: TipoMovimiento) {
    setTipo(t)
    setCategoria(t === 'INGRESO' ? 'HONORARIO' : 'GASTO_OPERATIVO')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const montoNum = parseFloat(monto)
    if (!montoNum || montoNum <= 0) { toast.error('Monto invalido'); return }
    if (!descripcion.trim()) { toast.error('Descripcion requerida'); return }

    try {
      await create.mutateAsync({
        tipo,
        categoria,
        monto: montoNum,
        descripcion: descripcion.trim(),
        fecha,
        metodo_pago: metodoPago || null,
      })
      onClose()
      setMonto('')
      setDescripcion('')
      setMetodoPago('')
    } catch {
      toast.error('Error al registrar movimiento')
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Nuevo movimiento</h3>
          <button type="button" onClick={onClose} className="text-zinc-900 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tipo toggle */}
        <div className="flex gap-2 mb-4">
          {(['INGRESO', 'EGRESO'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => handleTipoChange(t)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all',
                tipo === t
                  ? t === 'INGRESO'
                    ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
                    : 'bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30'
                  : 'bg-white/5 text-zinc-600 dark:text-zinc-400 hover:bg-white/10',
              )}
            >
              {t === 'INGRESO' ? <ArrowUpCircle className="h-4 w-4" /> : <ArrowDownCircle className="h-4 w-4" />}
              {t === 'INGRESO' ? 'Ingreso' : 'Egreso'}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Monto *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
                required
                className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Fecha *</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                required
                className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Categoria *</label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as CategoriaMovimiento)}
                className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
              >
                {categorias.map((c) => (
                  <option key={c} value={c}>{CATEGORIA_LABELS[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Método de pago</label>
              <select
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value)}
                className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
              >
                <option value="">—</option>
                <option value="EFECTIVO">Efectivo</option>
                <option value="TRANSFERENCIA">Transferencia</option>
                <option value="CHEQUE">Cheque</option>
                <option value="OTRO">Otro</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-medium text-zinc-600 dark:text-zinc-400">Descripción *</label>
            <input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Descripción del movimiento"
              required
              className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-white/10 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={create.isPending}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all disabled:opacity-50',
              tipo === 'INGRESO'
                ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                : 'bg-rose-500 text-white hover:bg-rose-600',
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            Registrar {tipo === 'INGRESO' ? 'ingreso' : 'egreso'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Activity feed (compact)
// ---------------------------------------------------------------------------

function ActivityFeed() {
  const { data, isLoading } = useAuditLog({ limit: 15 })

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-3">
            <div className="h-7 w-7 animate-pulse rounded-full bg-slate-700" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-3/4 animate-pulse rounded bg-slate-700" />
              <div className="h-2.5 w-1/2 animate-pulse rounded bg-slate-700/50" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  const entries = data?.entries ?? []

  if (entries.length === 0) {
    return <p className="text-xs text-zinc-900 dark:text-zinc-500 py-6 text-center">Sin actividad reciente</p>
  }

  return (
    <div className="space-y-1">
      {entries.map((entry) => {
        const config = ACCION_CONFIG[entry.accion] ?? { icon: Activity, label: entry.accion, color: 'text-zinc-600 dark:text-zinc-400' }
        const Icon = config.icon
        const userName = entry.profiles
          ? `${entry.profiles.nombre} ${entry.profiles.apellido}`
          : 'Sistema'

        return (
          <div key={entry.id} className="flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-zinc-100 dark:hover:bg-white/[0.02] transition-colors">
            <div className={cn('mt-0.5 shrink-0', config.color)}>
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                <span className="font-medium text-zinc-800 dark:text-zinc-200">{userName}</span>
                {' '}
                <span className="text-zinc-600 dark:text-zinc-400">{describeEntry(entry)}</span>
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Clock className="h-2.5 w-2.5 text-zinc-600" />
                <span className="text-[10px] text-zinc-900 dark:text-zinc-500">{timeAgo(entry.created_at)}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function FinanzasPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isAdmin = profile?.rol === 'ADMIN'
  const deleteMovimiento = useDeleteMovimiento()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [filters, setFilters] = useState<MovimientosFilters>({ page: 1, pageSize: 20 })
  const [searchValue, setSearchValue] = useState('')

  const currentMonth = new Date().toISOString().slice(0, 7)
  const { data: stats } = useMovimientosStats(currentMonth)
  const { data, isLoading } = useMovimientos({ ...filters, search: searchValue || undefined })

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gradient-cyan">Finanzas</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Ingresos, egresos y actividad del estudio.</p>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-gradient-cyan px-4 py-2 text-sm font-medium text-zinc-950 hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Nuevo movimiento
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="glass-card-glow rounded-xl px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Ingresos del mes</p>
              <p className="mt-1 text-2xl font-bold text-emerald-400">{formatMoney(stats?.ingresos ?? 0)}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
        </div>
        <div className="glass-card-glow rounded-xl px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Egresos del mes</p>
              <p className="mt-1 text-2xl font-bold text-rose-400">{formatMoney(stats?.egresos ?? 0)}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400">
              <TrendingDown className="h-5 w-5" />
            </div>
          </div>
        </div>
        <div className="glass-card-glow rounded-xl px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Balance</p>
              <p className={cn(
                'mt-1 text-2xl font-bold',
                (stats?.balance ?? 0) >= 0 ? 'text-amber-400' : 'text-rose-400',
              )}>
                {formatMoney(stats?.balance ?? 0)}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
              <Wallet className="h-5 w-5" />
            </div>
          </div>
        </div>
        <div className="glass-card-glow rounded-xl px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Movimientos</p>
              <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">{stats?.count ?? 0}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Main content: 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Movimientos table - 2/3 */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px] max-w-[240px]">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-900 dark:text-zinc-500" />
              <input
                placeholder="Buscar..."
                value={searchValue}
                onChange={(e) => { setSearchValue(e.target.value); setFilters((f) => ({ ...f, page: 1 })) }}
                className="h-9 w-full rounded-lg border border-white/10 bg-white/5 pl-8 pr-3 text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
              />
            </div>
            <select
              value={filters.tipo ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, tipo: (e.target.value || null) as TipoMovimiento | null, page: 1 }))}
              className="h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
            >
              <option value="">Todos</option>
              <option value="INGRESO">Ingresos</option>
              <option value="EGRESO">Egresos</option>
            </select>
            <select
              value={filters.categoria ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, categoria: (e.target.value || null) as CategoriaMovimiento | null, page: 1 }))}
              className="h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-zinc-900 dark:text-zinc-100 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
            >
              <option value="">Todas las categorías</option>
              {[...CATEGORIAS_INGRESO, ...CATEGORIAS_EGRESO].map((c) => (
                <option key={c} value={c}>{CATEGORIA_LABELS[c]}</option>
              ))}
            </select>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={filters.dateFrom ?? ''}
                onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value || null, page: 1 }))}
                className="h-9 rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs text-zinc-800 dark:text-zinc-200 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
                title="Desde"
              />
              <span className="text-xs text-zinc-900 dark:text-zinc-500">—</span>
              <input
                type="date"
                value={filters.dateTo ?? ''}
                onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value || null, page: 1 }))}
                className="h-9 rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs text-zinc-800 dark:text-zinc-200 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
                title="Hasta"
              />
            </div>
            {(filters.tipo || filters.categoria || filters.dateFrom || filters.dateTo || searchValue) && (
              <button
                onClick={() => { setFilters({ page: 1, pageSize: 20, dateFrom: null, dateTo: null }); setSearchValue('') }}
                className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-white/10 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
              >
                <X className="h-3 w-3" />
                Limpiar
              </button>
            )}
          </div>

          {/* Table */}
          {isLoading ? (
            <TableSkeleton rows={8} columns={5} />
          ) : !data || data.data.length === 0 ? (
            <EmptyState
              icon={DollarSign}
              title="Sin movimientos"
              description="No hay movimientos que coincidan con los filtros."
            />
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-white/10 glass-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/5">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Fecha</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Tipo</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Descripción</th>
                      <th className="hidden sm:table-cell px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Categoria</th>
                      <th className="hidden md:table-cell px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Método</th>
                      <th className="hidden lg:table-cell px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Usuario</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">Monto</th>
                      <th className="w-10 px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.data.map((mov) => (
                      <tr key={mov.id} className="group hover:bg-zinc-100 dark:bg-white/[0.04] transition-colors">
                        <td className="px-3 py-3 text-xs text-zinc-600 dark:text-zinc-400 whitespace-nowrap">{formatDateShort(mov.fecha)}</td>
                        <td className="px-3 py-3">
                          <span className={cn(
                            'inline-flex items-center gap-1 text-xs font-medium',
                            mov.tipo === 'INGRESO' ? 'text-emerald-400' : 'text-rose-400',
                          )}>
                            {mov.tipo === 'INGRESO'
                              ? <ArrowUpCircle className="h-3.5 w-3.5" />
                              : <ArrowDownCircle className="h-3.5 w-3.5" />}
                            {mov.tipo === 'INGRESO' ? 'Ingreso' : 'Egreso'}
                          </span>
                        </td>
                        <td className="px-3 py-3 max-w-[200px]">
                          <p className="text-sm text-zinc-900 dark:text-zinc-100 truncate">{mov.descripcion}</p>
                          {mov.expediente && (
                            <button
                              onClick={() => navigate(`/expedientes/${mov.expediente!.id}`)}
                              className="text-[10px] text-amber-400 hover:underline"
                            >
                              {mov.expediente.caratula || mov.expediente.numero}
                            </button>
                          )}
                        </td>
                        <td className="hidden sm:table-cell px-3 py-3">
                          <span className="text-xs text-zinc-600 dark:text-zinc-400">{CATEGORIA_LABELS[mov.categoria] ?? mov.categoria}</span>
                        </td>
                        <td className="hidden md:table-cell px-3 py-3">
                          <span className="text-xs text-zinc-900 dark:text-zinc-500">{mov.metodo_pago ? METODO_LABELS[mov.metodo_pago] ?? mov.metodo_pago : '—'}</span>
                        </td>
                        <td className="hidden lg:table-cell px-3 py-3">
                          {mov.creator ? (
                            <span className="text-xs text-zinc-600 dark:text-zinc-400">{mov.creator.nombre} {mov.creator.apellido}</span>
                          ) : (
                            <span className="text-xs text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          <span className={cn(
                            'text-sm font-semibold tabular-nums',
                            mov.tipo === 'INGRESO' ? 'text-emerald-400' : 'text-rose-400',
                          )}>
                            {mov.tipo === 'INGRESO' ? '+' : '-'}{formatMoney(Number(mov.monto))}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {isAdmin && (
                            <button
                              onClick={() => setDeleteConfirm(mov.id)}
                              disabled={deleteMovimiento.isPending}
                              className="rounded p-1.5 text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                              title="Eliminar"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {data.totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    {(data.page - 1) * data.pageSize + 1} a {Math.min(data.page * data.pageSize, data.count)} de {data.count}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={data.page <= 1}
                      onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:bg-white/[0.04] disabled:opacity-30"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="px-3 text-xs text-zinc-600 dark:text-zinc-400">{data.page} / {data.totalPages}</span>
                    <button
                      disabled={data.page >= data.totalPages}
                      onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:bg-white/[0.04] disabled:opacity-30"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Activity feed - 1/3 */}
        <div className="space-y-4">
          <div className="glass-card rounded-xl border border-white/10 p-4">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="h-4 w-4 text-violet-400" />
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Actividad reciente</h3>
            </div>
            <ActivityFeed />
          </div>
        </div>
      </div>

      <CrearMovimientoDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      <ConfirmDialog
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => { deleteMovimiento.mutate(deleteConfirm!); setDeleteConfirm(null) }}
        title="Eliminar movimiento"
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="danger"
        isPending={deleteMovimiento.isPending}
      />
    </div>
  )
}

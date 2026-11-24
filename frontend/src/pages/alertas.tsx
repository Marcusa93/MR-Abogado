import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useAlertas,
  useResolverAlerta,
  usePosponerAlerta,
  useMarcarLeida,
  useMarcarTodasLeidas,
  type AlertaWithExpediente,
} from '@/hooks/use-alertas'
// Alertas don't have prioridad field
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/utils/date-helpers'
import { TIPO_ALERTA_LABELS, type TipoAlerta } from '@/types/enums'
import {
  Bell,
  BellOff,
  Clock,
  CheckCircle,
  AlertTriangle,
  CalendarClock,
  FileText,
  DollarSign,
  ArrowRightLeft,
  Monitor,
  Loader2,
  ExternalLink,
  Calendar,
  CheckCheck,
  Eye,
  AtSign,
  Search,
  X,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Tipo icon map
// ---------------------------------------------------------------------------

const TIPO_ICON_MAP: Record<string, { icon: typeof Bell; bg: string; text: string }> = {
  VENCIMIENTO_TAREA: {
    icon: Clock,
    bg: 'bg-amber-500/10 border-amber-500/30',
    text: 'text-amber-700 dark:text-amber-300',
  },
  TURNO_PROXIMO: {
    icon: CalendarClock,
    bg: 'bg-cyan-500/10 border-cyan-500/30',
    text: 'text-cyan-700 dark:text-cyan-300',
  },
  SEGUIMIENTO_PENDIENTE: {
    icon: AlertTriangle,
    bg: 'bg-orange-500/10 border-orange-500/30',
    text: 'text-orange-700 dark:text-orange-300',
  },
  DOCUMENTO_FALTANTE: {
    icon: FileText,
    bg: 'bg-violet-500/10 border-violet-500/30',
    text: 'text-violet-700 dark:text-violet-300',
  },
  COBRO_PENDIENTE: {
    icon: DollarSign,
    bg: 'bg-emerald-500/10 border-emerald-500/30',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  ESTADO_CAMBIO: {
    icon: ArrowRightLeft,
    bg: 'bg-cyan-500/10 border-cyan-500/30',
    text: 'text-cyan-700 dark:text-cyan-300',
  },
  SISTEMA: {
    icon: Monitor,
    bg: 'bg-zinc-500/10 border-zinc-500/25',
    text: 'text-zinc-600 dark:text-zinc-300',
  },
  MENCION: {
    icon: AtSign,
    bg: 'bg-pink-500/10 border-pink-500/30',
    text: 'text-pink-700 dark:text-pink-300',
  },
}

const DEFAULT_ICON = {
  icon: Bell,
  bg: 'bg-zinc-500/10 border-zinc-500/25',
  text: 'text-zinc-600 dark:text-zinc-300',
}

const TAG = 'inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[10.5px] font-semibold'

const TIPO_URGENCY: Record<string, number> = {
  TAREA_VENCIDA: 0, VENCIMIENTO_TAREA: 0,
  SEGUIMIENTO_PENDIENTE: 1,
  AUDIENCIA_PROXIMA: 2, TURNO_PROXIMO: 2,
  COBRO_PENDIENTE: 3, DOCUMENTO_FALTANTE: 3,
  ESTADO_CAMBIO: 4, TAREA_ASIGNADA: 4,
  MENCION: 5, SISTEMA: 6,
}

// ---------------------------------------------------------------------------
// Alerta Card
// ---------------------------------------------------------------------------

function AlertaCard({
  alerta,
  onResolve,
  onPostpone,
  onMarkRead,
  isResolving,
}: {
  alerta: AlertaWithExpediente
  onResolve: (id: string) => void
  onPostpone: (id: string, fecha: string) => void
  onMarkRead: (id: string) => void
  isResolving: boolean
}) {
  const navigate = useNavigate()
  const [showPosponer, setShowPosponer] = useState(false)
  const [posponerFecha, setPosponerFecha] = useState('')

  const tipoConfig = TIPO_ICON_MAP[alerta.tipo] ?? DEFAULT_ICON
  const Icon = tipoConfig.icon

  const handlePosponer = () => {
    if (!posponerFecha) return
    onPostpone(alerta.id, posponerFecha)
    setShowPosponer(false)
  }

  return (
    <div className="app-card p-4">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
            tipoConfig.bg
          )}
        >
          <Icon className={cn('h-4 w-4', tipoConfig.text)} />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-[14px] font-bold tracking-tight text-zinc-900 dark:text-white">
                {alerta.titulo}
              </h3>
              {alerta.mensaje && (
                <p className="mt-0.5 line-clamp-2 text-[12.5px] text-zinc-600 dark:text-zinc-300">
                  {alerta.mensaje}
                </p>
              )}
            </div>
            {alerta.tipo && (
              <span className={cn(TAG, tipoConfig.bg, tipoConfig.text)}>
                {TIPO_ALERTA_LABELS[alerta.tipo as TipoAlerta] ?? alerta.tipo}
              </span>
            )}
          </div>

          {/* Meta row */}
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
            <span className="tabular-nums">{timeAgo(alerta.created_at)}</span>
            {alerta.expediente && (
              <>
                <span className="text-zinc-400 dark:text-zinc-600" aria-hidden>{'\u00B7'}</span>
                <button
                  onClick={() => navigate(`/expedientes/${alerta.expediente!.id}`)}
                  className="dashboard-link inline-flex min-w-0 items-center gap-1 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {alerta.expediente.caratula || alerta.expediente.numero}
                </button>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => onResolve(alerta.id)}
              disabled={isResolving}
              className="btn btn-sm border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
            >
              {isResolving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle className="h-3 w-3" />
              )}
              Resolver
            </button>

            <button
              onClick={() => onMarkRead(alerta.id)}
              className="btn btn-ghost btn-sm"
            >
              <Eye className="h-3 w-3" />
              Leída
            </button>

            {!showPosponer ? (
              <button
                onClick={() => setShowPosponer(true)}
                className="btn btn-ghost btn-sm"
              >
                <Calendar className="h-3 w-3" />
                Posponer
              </button>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                {/* Quick presets */}
                {[
                  { label: '1 sem', days: 7 },
                  { label: '2 sem', days: 14 },
                  { label: '1 mes', days: 30 },
                ].map(({ label, days }) => {
                  const d = new Date()
                  d.setDate(d.getDate() + days)
                  const dateStr = d.toISOString().split('T')[0]
                  return (
                    <button
                      key={days}
                      onClick={() => onPostpone(alerta.id, dateStr)}
                      className="chip"
                    >
                      {label}
                    </button>
                  )
                })}
                <input
                  type="date"
                  value={posponerFecha}
                  onChange={(e) => setPosponerFecha(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="field h-8 w-auto py-0 text-xs"
                />
                <button
                  onClick={handlePosponer}
                  disabled={!posponerFecha}
                  className="btn btn-primary btn-sm"
                >
                  OK
                </button>
                <button
                  onClick={() => setShowPosponer(false)}
                  className="btn btn-ghost btn-sm border-transparent"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AlertasPage() {
  const { data: alertas, isLoading, isError } = useAlertas()
  const resolverAlerta = useResolverAlerta()
  const posponerAlerta = usePosponerAlerta()
  const marcarLeida = useMarcarLeida()
  const marcarTodasLeidas = useMarcarTodasLeidas()

  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterTipo, setFilterTipo] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'prioridad' | 'fecha'>('prioridad')

  const handleResolve = (alertaId: string) => {
    setResolvingId(alertaId)
    resolverAlerta.mutate(alertaId, { onSettled: () => setResolvingId(null) })
  }
  const handlePostpone = (alertaId: string, fecha: string) => {
    posponerAlerta.mutate({ alerta_id: alertaId, nueva_fecha: fecha })
  }
  const handleMarkRead = (alertaId: string) => {
    marcarLeida.mutate(alertaId)
  }

  const tiposPresentes = useMemo(() => {
    if (!alertas?.length) return []
    return [...new Set(alertas.map(a => a.tipo))].sort(
      (a, b) => (TIPO_URGENCY[a] ?? 5) - (TIPO_URGENCY[b] ?? 5)
    )
  }, [alertas])

  const filteredSorted = useMemo(() => {
    if (!alertas) return []
    const q = search.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    const norm = (s: string | null | undefined) =>
      (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    let items = alertas
    if (q) {
      items = items.filter(a =>
        norm(a.titulo).includes(q)
        || norm(a.mensaje).includes(q)
        || norm(a.expediente?.caratula).includes(q)
        || norm(a.expediente?.numero).includes(q)
        || norm(TIPO_ALERTA_LABELS[a.tipo as TipoAlerta]).includes(q)
      )
    }
    if (filterTipo) items = items.filter(a => a.tipo === filterTipo)
    if (sortBy === 'prioridad') {
      items = [...items].sort((a, b) => {
        const pa = TIPO_URGENCY[a.tipo] ?? 5
        const pb = TIPO_URGENCY[b.tipo] ?? 5
        if (pa !== pb) return pa - pb
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
    }
    return items
  }, [alertas, search, filterTipo, sortBy])

  const hasFilters = !!(search || filterTipo)

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Alertas"
        subtitle="Notificaciones y alertas pendientes de tus expedientes."
        actions={alertas && alertas.length > 0 ? (
          <button
            onClick={() => marcarTodasLeidas.mutate()}
            disabled={marcarTodasLeidas.isPending}
            className="btn btn-ghost"
          >
            <CheckCheck className="h-4 w-4" />
            Marcar todas leídas
          </button>
        ) : undefined}
      />

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500 dark:text-zinc-400" />
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-center">
          <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Error al cargar alertas.</p>
        </div>
      ) : !alertas || alertas.length === 0 ? (
        <div className="space-y-6">
          <EmptyState
            icon={BellOff}
            title="Sin alertas pendientes"
            description="No tienes alertas activas en este momento."
          />
          <div className="app-card mx-auto max-w-md p-5">
            <p className="mb-3 text-[13px] font-bold tracking-tight text-zinc-900 dark:text-white">El sistema genera alertas automáticamente cuando:</p>
            <ul className="space-y-2 text-[12.5px] text-zinc-600 dark:text-zinc-300">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                Un expediente lleva más de 30 días sin movimiento
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                Hay tareas vencidas sin completar
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                Se acerca una audiencia
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-500" />
                Hay documentación faltante en expedientes activos
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
                Se registran cambios de estado en expedientes
              </li>
            </ul>
          </div>
        </div>
      ) : (
        <>
          {/* Búsqueda + filtros */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por título, expediente, tipo…"
                className="field h-11 pl-10 pr-10"
              />
              {search && (
                <button onClick={() => setSearch('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold tabular-nums text-cyan-700 dark:text-cyan-300">
                <Bell className="h-3 w-3" />
                {alertas.length} alerta{alertas.length > 1 ? 's' : ''}
              </span>
              {tiposPresentes.map(tipo => {
                return (
                  <button key={tipo}
                    onClick={() => setFilterTipo(f => f === tipo ? null : tipo)}
                    aria-pressed={filterTipo === tipo}
                    className="chip">
                    {TIPO_ALERTA_LABELS[tipo as TipoAlerta] ?? tipo}
                  </button>
                )
              })}
              <div className="flex-1" />
              <div className="segmented" role="group" aria-label="Ordenar">
                {(['prioridad', 'fecha'] as const).map(s => (
                  <button key={s} onClick={() => setSortBy(s)}
                    aria-pressed={sortBy === s}
                    className="px-2.5 text-xs font-semibold">
                    {s === 'prioridad' ? 'Prioridad' : 'Fecha'}
                  </button>
                ))}
              </div>
            </div>
            {hasFilters && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium tabular-nums text-zinc-500">{filteredSorted.length} de {alertas.length}</span>
                <button onClick={() => { setSearch(''); setFilterTipo(null) }}
                  className="flex items-center gap-1 text-xs font-semibold text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-white">
                  <X className="h-3 w-3" />
                  Limpiar
                </button>
              </div>
            )}
          </div>

          {/* Lista */}
          {filteredSorted.length === 0 ? (
            <div className="app-card p-8 text-center">
              <Search className="mx-auto mb-2 h-8 w-8 text-zinc-400 dark:text-zinc-600" />
              <p className="text-sm text-zinc-600 dark:text-zinc-300">Ninguna alerta coincide con los filtros.</p>
              <button onClick={() => { setSearch(''); setFilterTipo(null) }}
                className="dashboard-link mt-3 text-xs hover:underline">
                Limpiar filtros
              </button>
            </div>
          ) : sortBy === 'prioridad' ? (
            <div className="space-y-2">
              {filteredSorted.map(alerta => (
                <AlertaCard
                  key={alerta.id}
                  alerta={alerta}
                  onResolve={handleResolve}
                  onPostpone={handlePostpone}
                  onMarkRead={handleMarkRead}
                  isResolving={resolvingId === alerta.id}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {(() => {
                const groups = new Map<string, { label: string; expId: string | null; items: typeof alertas }>()
                for (const a of filteredSorted) {
                  const key = a.expediente?.id ?? '__none__'
                  if (!groups.has(key)) {
                    const label = a.expediente
                      ? (a.expediente.caratula || a.expediente.numero || 'Expediente')
                      : 'Alertas generales'
                    groups.set(key, { label, expId: a.expediente?.id ?? null, items: [] })
                  }
                  groups.get(key)!.items.push(a)
                }
                const groupEntries = Array.from(groups.values())
                const needsGrouping = groupEntries.some(g => g.items.length > 1)
                if (!needsGrouping) {
                  return filteredSorted.map(a => (
                    <AlertaCard key={a.id} alerta={a}
                      onResolve={handleResolve} onPostpone={handlePostpone} onMarkRead={handleMarkRead}
                      isResolving={resolvingId === a.id} />
                  ))
                }
                return groupEntries.map(group => (
                  <div key={group.expId ?? '__none__'}>
                    {group.items.length > 1 && (
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <span className="min-w-0 truncate text-xs font-bold text-zinc-700 dark:text-zinc-200">{group.label}</span>
                        <span className={cn(TAG, 'border-zinc-500/25 bg-zinc-500/10 tabular-nums text-zinc-600 dark:text-zinc-300')}>{group.items.length}</span>
                        <div className="flex-1 border-t border-zinc-200 dark:border-white/[0.06]" />
                      </div>
                    )}
                    <div className="space-y-2">
                      {group.items.map(a => (
                        <AlertaCard key={a.id} alerta={a}
                          onResolve={handleResolve} onPostpone={handlePostpone} onMarkRead={handleMarkRead}
                          isResolving={resolvingId === a.id} />
                      ))}
                    </div>
                  </div>
                ))
              })()}
            </div>
          )}
        </>
      )}
    </div>
  )
}

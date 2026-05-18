import { useState } from 'react'
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
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Tipo icon map
// ---------------------------------------------------------------------------

const TIPO_ICON_MAP: Record<string, { icon: typeof Bell; bg: string; text: string }> = {
  VENCIMIENTO_TAREA: {
    icon: Clock,
    bg: 'bg-amber-900/40',
    text: 'text-amber-400',
  },
  TURNO_PROXIMO: {
    icon: CalendarClock,
    bg: 'bg-blue-900/40',
    text: 'text-blue-400',
  },
  SEGUIMIENTO_PENDIENTE: {
    icon: AlertTriangle,
    bg: 'bg-orange-900/40',
    text: 'text-orange-400',
  },
  DOCUMENTO_FALTANTE: {
    icon: FileText,
    bg: 'bg-violet-900/40',
    text: 'text-violet-400',
  },
  COBRO_PENDIENTE: {
    icon: DollarSign,
    bg: 'bg-emerald-900/40',
    text: 'text-emerald-400',
  },
  ESTADO_CAMBIO: {
    icon: ArrowRightLeft,
    bg: 'bg-amber-900/40',
    text: 'text-amber-400',
  },
  SISTEMA: {
    icon: Monitor,
    bg: 'bg-white/5',
    text: 'text-zinc-600 dark:text-zinc-400',
  },
  MENCION: {
    icon: AtSign,
    bg: 'bg-pink-900/40',
    text: 'text-pink-400',
  },
}

const DEFAULT_ICON = {
  icon: Bell,
  bg: 'bg-white/5',
  text: 'text-zinc-600 dark:text-zinc-400',
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
    <div className="rounded-xl border border-white/10 glass-card p-4 transition-all hover:shadow-sm">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            tipoConfig.bg
          )}
        >
          <Icon className={cn('h-4 w-4', tipoConfig.text)} />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 truncate">
                {alerta.titulo}
              </h3>
              {alerta.mensaje && (
                <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">
                  {alerta.mensaje}
                </p>
              )}
            </div>
            {alerta.tipo && (
              <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', tipoConfig.bg, tipoConfig.text)}>
                {TIPO_ALERTA_LABELS[alerta.tipo as TipoAlerta] ?? alerta.tipo}
              </span>
            )}
          </div>

          {/* Meta row */}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-600 dark:text-zinc-400">
            <span>{timeAgo(alerta.created_at)}</span>
            {alerta.expediente && (
              <>
                <span>{'\u00B7'}</span>
                <button
                  onClick={() => navigate(`/expedientes/${alerta.expediente!.id}`)}
                  className="inline-flex items-center gap-1 text-amber-400 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {alerta.expediente.caratula || alerta.expediente.numero}
                </button>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => onResolve(alerta.id)}
              disabled={isResolving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-900/30 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-900/50"
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-white/10"
            >
              <Eye className="h-3 w-3" />
              Leída
            </button>

            {!showPosponer ? (
              <button
                onClick={() => setShowPosponer(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-white/10"
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
                      className="rounded-lg bg-white/5 px-2 py-1 text-[11px] text-zinc-700 dark:text-zinc-300 hover:bg-white/10 border border-white/10"
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
                  className="h-7 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:border-amber-500/40 focus:outline-none focus:ring-amber-500/15"
                />
                <button
                  onClick={handlePosponer}
                  disabled={!posponerFecha}
                  className="rounded-lg bg-amber-900/30 px-2.5 py-1 text-xs font-medium text-amber-400 hover:bg-amber-900/50 disabled:opacity-50"
                >
                  OK
                </button>
                <button
                  onClick={() => setShowPosponer(false)}
                  className="text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-700 dark:hover:text-zinc-300"
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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gradient-cyan">
          Alertas
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Notificaciones y alertas pendientes de tus expedientes.
        </p>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-700 dark:text-zinc-300" />
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-rose-900 bg-rose-950/30 p-6 text-center">
          <p className="text-sm text-rose-400">
            Error al cargar alertas.
          </p>
        </div>
      ) : !alertas || alertas.length === 0 ? (
        <div className="space-y-6">
          <EmptyState
            icon={BellOff}
            title="Sin alertas pendientes"
            description="No tienes alertas activas en este momento."
          />
          <div className="mx-auto max-w-md glass-card rounded-xl p-5">
            <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-3">El sistema genera alertas automáticamente cuando:</p>
            <ul className="space-y-2 text-xs text-zinc-500 dark:text-zinc-400">
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
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
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
          {/* Count badge + Mark all read */}
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-900/30 px-3 py-1 text-xs font-medium text-amber-400">
              <Bell className="h-3 w-3" />
              {alertas.length} alerta{alertas.length > 1 ? 's' : ''} activa{alertas.length > 1 ? 's' : ''}
            </span>
            <button
              onClick={() => marcarTodasLeidas.mutate()}
              disabled={marcarTodasLeidas.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-white/10"
            >
              <CheckCheck className="h-3 w-3" />
              Marcar todas leídas
            </button>
          </div>

          {/* Alert list grouped by expediente */}
          <div className="space-y-4">
            {(() => {
              // Group alerts by expediente_id (null = "sin expediente")
              const groups = new Map<string, { label: string; expId: string | null; items: typeof alertas }>()
              for (const a of alertas) {
                const key = a.expediente?.id ?? '__none__'
                if (!groups.has(key)) {
                  const label = a.expediente
                    ? (a.expediente.caratula || a.expediente.numero || 'Expediente')
                    : 'Alertas generales'
                  groups.set(key, { label, expId: a.expediente?.id ?? null, items: [] })
                }
                groups.get(key)!.items.push(a)
              }

              // Single-item groups don't need a header
              const groupEntries = Array.from(groups.values())
              const needsGrouping = groupEntries.some((g) => g.items.length > 1)

              if (!needsGrouping) {
                return alertas.map((alerta) => (
                  <AlertaCard
                    key={alerta.id}
                    alerta={alerta}
                    onResolve={handleResolve}
                    onPostpone={handlePostpone}
                    onMarkRead={handleMarkRead}
                    isResolving={resolvingId === alerta.id}
                  />
                ))
              }

              return groupEntries.map((group) => (
                <div key={group.expId ?? '__none__'}>
                  {group.items.length > 1 && (
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        {group.label}
                      </span>
                      <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:text-zinc-400">
                        {group.items.length}
                      </span>
                      <div className="flex-1 border-t border-white/5" />
                    </div>
                  )}
                  <div className="space-y-2">
                    {group.items.map((alerta) => (
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
                </div>
              ))
            })()}
          </div>
        </>
      )}
    </div>
  )
}

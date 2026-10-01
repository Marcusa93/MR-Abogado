import { useNavigate } from 'react-router-dom'
import {
  Bell, BellOff, AlertTriangle, Clock, CalendarClock, FileText,
  DollarSign, ArrowRightLeft, Monitor, AtSign, FolderOpen,
  CheckCheck, ExternalLink, Sparkles,
} from 'lucide-react'
import { useAlertas, useMarcarLeida, type AlertaWithExpediente } from '@/hooks/use-alertas'
import {
  useSaeNotificaciones, useSaeNotifUnreadCount, useMarkSaeNotifAsRead,
  type SaeNotificacion,
} from '@/hooks/use-sae-notificaciones'
import { getFueroLabel } from '@/lib/sae-fueros'
import { timeAgo } from '@/lib/utils/date-helpers'
import { cn } from '@/lib/utils'

// ─── Configuración de iconos por tipo de alerta interna ──────────────────────

const TIPO_ICON: Record<string, { icon: typeof Bell; color: string }> = {
  VENCIMIENTO_TAREA:    { icon: Clock,          color: 'text-amber-400' },
  TAREA_ASIGNADA:       { icon: Clock,          color: 'text-cyan-400' },
  TURNO_PROXIMO:        { icon: CalendarClock,  color: 'text-blue-400' },
  AUDIENCIA_PROXIMA:    { icon: CalendarClock,  color: 'text-blue-400' },
  SEGUIMIENTO_PENDIENTE:{ icon: AlertTriangle,  color: 'text-orange-400' },
  DOCUMENTO_FALTANTE:   { icon: FileText,       color: 'text-violet-400' },
  COBRO_PENDIENTE:      { icon: DollarSign,     color: 'text-emerald-400' },
  ESTADO_CAMBIO:        { icon: ArrowRightLeft, color: 'text-amber-400' },
  SISTEMA:              { icon: Monitor,        color: 'text-zinc-400' },
  MENCION:              { icon: AtSign,         color: 'text-pink-400' },
}

const PRIORIDAD_SAE_ORDER: Record<string, number> = { urgente: 0, normal: 1, info: 2 }

// ─── Item de alerta interna ───────────────────────────────────────────────────

function AlertaItem({ alerta, onClose }: { alerta: AlertaWithExpediente; onClose?: () => void }) {
  const navigate = useNavigate()
  const marcar = useMarcarLeida()
  const tipo = TIPO_ICON[alerta.tipo] ?? { icon: Bell, color: 'text-zinc-400' }
  const Icon = tipo.icon

  const handleClick = () => {
    marcar.mutate(alerta.id)
    if (alerta.expediente_id) navigate(`/expedientes/${alerta.expediente_id}`)
    else navigate('/alertas')
    onClose?.()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full group flex items-start gap-3 rounded-xl border border-[rgb(87_124_142_/_10%)] bg-white/50 dark:bg-white/[0.03] hover:bg-[rgb(87_124_142_/_6%)] dark:hover:bg-white/[0.06] px-3.5 py-3 text-left transition-colors"
    >
      <div className={cn('mt-0.5 shrink-0', tipo.color)}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-zinc-800 dark:text-zinc-100 line-clamp-2 leading-snug">
          {alerta.titulo}
        </p>
        {alerta.expediente && (
          <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
            <FolderOpen className="h-2.5 w-2.5" />
            {alerta.expediente.caratula ?? alerta.expediente.numero ?? 'Expediente'}
          </span>
        )}
        <p className="text-[10px] text-zinc-500 dark:text-zinc-500 mt-0.5">{timeAgo(alerta.created_at)}</p>
      </div>
    </button>
  )
}

// ─── Item SAE ─────────────────────────────────────────────────────────────────

function SaeItem({ notif, onClose }: { notif: SaeNotificacion; onClose?: () => void }) {
  const navigate = useNavigate()
  const markRead = useMarkSaeNotifAsRead()
  const isUrgente = notif.prioridad === 'urgente'
  const fueroLabel = getFueroLabel(notif.raw_payload?.fuero)

  const handleClick = () => {
    markRead.mutate(notif.id)
    if (notif.expediente_id) navigate(`/expedientes/${notif.expediente_id}`)
    else navigate('/notificaciones-sae')
    onClose?.()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'w-full group flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors',
        isUrgente
          ? 'border-rose-500/30 bg-rose-500/[0.05] hover:bg-rose-500/[0.08] dark:border-rose-500/25'
          : 'border-[rgb(87_124_142_/_10%)] bg-white/50 dark:bg-white/[0.03] hover:bg-[rgb(87_124_142_/_6%)] dark:hover:bg-white/[0.06]',
      )}
    >
      <div className={cn(
        'mt-0.5 shrink-0 rounded-md p-1',
        isUrgente ? 'bg-rose-500/15 text-rose-500 dark:text-rose-400' : 'bg-cyan-500/15 text-cyan-500 dark:text-cyan-400',
      )}>
        {isUrgente
          ? <AlertTriangle className="h-3 w-3" />
          : <Bell className="h-3 w-3" />
        }
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
          {isUrgente && (
            <span className="rounded bg-rose-500/15 px-1.5 py-0 text-[9px] font-bold uppercase tracking-wide text-rose-500 dark:text-rose-400">
              Urgente
            </span>
          )}
          {notif.tipo && (
            <span className="rounded bg-violet-500/10 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
              {notif.tipo}
            </span>
          )}
          {notif.plazo_estimado_dias != null && notif.plazo_estimado_dias > 0 && (
            <span className={cn(
              'rounded px-1.5 py-0 text-[9px] font-medium',
              notif.plazo_estimado_dias <= 3 ? 'bg-rose-500/10 text-rose-500 dark:text-rose-400'
                : notif.plazo_estimado_dias <= 7 ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'bg-zinc-200 dark:bg-white/5 text-zinc-500 dark:text-zinc-400',
            )}>
              Plazo: {notif.plazo_estimado_dias}d
            </span>
          )}
        </div>
        <p className="text-xs font-medium text-zinc-800 dark:text-zinc-100 line-clamp-2 leading-snug">
          {notif.titulo ?? notif.caratula ?? 'Notificación SAE'}
        </p>
        {notif.ia_resumen ? (
          <p className="mt-0.5 flex items-start gap-1 text-[10px] text-zinc-500 dark:text-zinc-400 line-clamp-1">
            <Sparkles className="mt-px h-2.5 w-2.5 shrink-0 text-violet-400" />
            {notif.ia_resumen}
          </p>
        ) : fueroLabel ? (
          <p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
            {fueroLabel}{notif.oficina ? ` · ${notif.oficina}` : ''}
          </p>
        ) : null}
        <p className="text-[10px] text-zinc-500 dark:text-zinc-500 mt-0.5">
          {timeAgo(notif.fecha_emision ?? notif.created_at)}
        </p>
      </div>
    </button>
  )
}

// ─── Panel principal ──────────────────────────────────────────────────────────

export function NotificacionesHoyPanel() {
  const navigate = useNavigate()
  const { data: alertas = [] } = useAlertas()
  const { data: saeNotifs = [] } = useSaeNotificaciones({ unreadOnly: true, limit: 8 })
  const { data: saeUnread = 0 } = useSaeNotifUnreadCount()
  const marcarTodas = useMarcarLeida()

  const sortedSae = [...saeNotifs].sort((a, b) =>
    (PRIORIDAD_SAE_ORDER[a.prioridad ?? 'normal'] ?? 1) -
    (PRIORIDAD_SAE_ORDER[b.prioridad ?? 'normal'] ?? 1),
  )

  const urgentesCount = sortedSae.filter(n => n.prioridad === 'urgente').length
  const totalCount = alertas.length + saeUnread
  const MAX_ITEMS = 6

  // Merge: urgente SAE primero, luego alertas internas, luego resto SAE
  const urgenteSae = sortedSae.filter(n => n.prioridad === 'urgente')
  const restSae = sortedSae.filter(n => n.prioridad !== 'urgente')

  // interleave: urgentes SAE → alertas → resto SAE, hasta MAX_ITEMS
  type Item = { kind: 'alerta'; data: AlertaWithExpediente } | { kind: 'sae'; data: SaeNotificacion }
  const items: Item[] = []
  for (const n of urgenteSae) items.push({ kind: 'sae', data: n })
  for (const a of alertas) items.push({ kind: 'alerta', data: a })
  for (const n of restSae) items.push({ kind: 'sae', data: n })
  const displayed = items.slice(0, MAX_ITEMS)
  const remaining = totalCount - displayed.length

  return (
    <div className="dashboard-panel rounded-[1.5rem] p-5">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="dashboard-eyebrow text-[10px]">bandeja de entrada</p>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <Bell className={cn('h-4 w-4', urgentesCount > 0 ? 'text-rose-500' : 'text-amber-400 dark:text-amber-300')} />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Notificaciones</h3>
            {totalCount > 0 && (
              <span className={cn(
                'dashboard-chip',
                urgentesCount > 0 ? 'dashboard-chip-danger' : 'dashboard-chip-warning',
              )}>
                {totalCount}
              </span>
            )}
            {urgentesCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                <AlertTriangle className="h-2.5 w-2.5" />
                {urgentesCount} urgente{urgentesCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        {totalCount > 0 && (
          <button
            onClick={() => marcarTodas.mutate(alertas[0]?.id ?? '')}
            className="shrink-0 flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
            title="Marcar alertas como leídas"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Marcar leídas</span>
          </button>
        )}
      </div>

      {/* Content */}
      {totalCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="dashboard-stat-orb mb-3 flex h-10 w-10 items-center justify-center rounded-2xl">
            <BellOff className="h-5 w-5" />
          </div>
          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Todo al día</p>
          <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-500">Sin notificaciones pendientes.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map((item, i) =>
            item.kind === 'sae'
              ? <SaeItem key={`sae-${item.data.id}`} notif={item.data} />
              : <AlertaItem key={`alerta-${item.data.id}`} alerta={item.data} />,
          )}
        </div>
      )}

      {/* Footer */}
      {(remaining > 0 || totalCount > 0) && (
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          {saeUnread > 0 && (
            <button
              onClick={() => navigate('/notificaciones-sae')}
              className="flex items-center gap-1 text-[11px] font-medium text-cyan-600 dark:text-cyan-400 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              SAE ({saeUnread})
            </button>
          )}
          {alertas.length > 0 && (
            <button
              onClick={() => navigate('/alertas')}
              className="flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Alertas ({alertas.length})
            </button>
          )}
          {remaining > 0 && (
            <span className="text-[11px] text-zinc-500 dark:text-zinc-500">
              +{remaining} más
            </span>
          )}
        </div>
      )}
    </div>
  )
}

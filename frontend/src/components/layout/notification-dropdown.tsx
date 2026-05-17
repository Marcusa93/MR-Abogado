import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAlertas, useMarcarLeida, useMarcarTodasLeidas, useSnoozeAlerta, type AlertaWithExpediente } from '@/hooks/use-alertas'
import {
  useSaeNotifUnreadCount, useSaeNotificaciones,
  useMarkSaeNotifAsRead, useMarkAllSaeNotifAsRead, useSnoozeSaeNotif,
  type SaeNotificacion,
} from '@/hooks/use-sae-notificaciones'
import { useNotifLastSeen, useMarkNotifsAsSeen } from '@/hooks/use-notif-last-seen'
import { SnoozeMenu } from './snooze-menu'
import { getFueroLabel } from '@/lib/sae-fueros'
import { timeAgo } from '@/lib/utils/date-helpers'
import { cn } from '@/lib/utils'
import {
  Bell,
  BellOff,
  CheckCheck,
  Clock,
  CalendarClock,
  AlertTriangle,
  FileText,
  DollarSign,
  ArrowRightLeft,
  Monitor,
  ExternalLink,
  Eye,
  AtSign,
  FolderOpen,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Icon config per alert type
// ---------------------------------------------------------------------------

const TIPO_ICON: Record<string, { icon: typeof Bell; color: string }> = {
  VENCIMIENTO_TAREA: { icon: Clock, color: 'text-amber-400' },
  TAREA_ASIGNADA: { icon: Clock, color: 'text-cyan-400' },
  TURNO_PROXIMO: { icon: CalendarClock, color: 'text-blue-400' },
  AUDIENCIA_PROXIMA: { icon: CalendarClock, color: 'text-blue-400' },
  SEGUIMIENTO_PENDIENTE: { icon: AlertTriangle, color: 'text-orange-400' },
  DOCUMENTO_FALTANTE: { icon: FileText, color: 'text-violet-400' },
  COBRO_PENDIENTE: { icon: DollarSign, color: 'text-emerald-400' },
  ESTADO_CAMBIO: { icon: ArrowRightLeft, color: 'text-amber-400' },
  SISTEMA: { icon: Monitor, color: 'text-zinc-600 dark:text-zinc-400' },
  MENCION: { icon: AtSign, color: 'text-pink-400' },
}

// ---------------------------------------------------------------------------
// Separador visual entre "Nuevas" y "Anteriores"
// ---------------------------------------------------------------------------

function SeenSeparator({ label, tone }: { label: string; tone: 'new' | 'old' }) {
  const cls = tone === 'new'
    ? 'text-emerald-400 bg-emerald-500/5'
    : 'text-zinc-500 bg-zinc-500/5'
  return (
    <div className={cn('px-4 py-1 flex items-center gap-2 border-b border-white/5', cls)}>
      <span className="text-[9px] uppercase tracking-wider font-semibold">{label}</span>
      <div className="flex-1 h-px bg-current opacity-20" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single notification item
// ---------------------------------------------------------------------------

function NotificationItem({
  alerta,
  isNew = false,
  onMarkRead,
  onSnooze,
  onNavigate,
}: {
  alerta: AlertaWithExpediente
  isNew?: boolean
  onMarkRead: (id: string) => void
  onSnooze?: (id: string, until: Date) => void
  onNavigate: (path: string) => void
}) {
  const tipo = TIPO_ICON[alerta.tipo] ?? { icon: Bell, color: 'text-zinc-600 dark:text-zinc-400' }
  const Icon = tipo.icon

  const handleClick = () => {
    onMarkRead(alerta.id)
    if (alerta.expediente_id) {
      onNavigate(`/expedientes/${alerta.expediente_id}`)
    }
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        'flex items-start gap-2.5 px-3 py-2.5 cursor-pointer transition-colors border-b border-white/5 last:border-0',
        isNew ? 'bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08]' : 'hover:bg-white/[0.06]',
      )}
    >
      <div className={cn('mt-0.5 shrink-0 relative', tipo.color)}>
        <Icon className="h-4 w-4" />
        {isNew && (
          <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 ring-1 ring-zinc-900" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100 line-clamp-2 leading-relaxed">
          {alerta.titulo}
        </p>
        {alerta.mensaje && (
          <p className="mt-0.5 text-[11px] text-zinc-600 dark:text-zinc-400 line-clamp-1">
            {alerta.mensaje}
          </p>
        )}
        {alerta.expediente && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onMarkRead(alerta.id)
              onNavigate(`/expedientes/${alerta.expediente!.id}`)
            }}
            className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 hover:border-amber-500/50 transition-colors"
            title="Ir al expediente"
          >
            <FolderOpen className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {alerta.expediente.numero || alerta.expediente.caratula || 'Ver expediente'}
              {alerta.expediente.numero && alerta.expediente.caratula
                ? ` — ${alerta.expediente.caratula}`
                : ''}
            </span>
          </button>
        )}
        <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-900 dark:text-zinc-500">
          <span>{timeAgo(alerta.created_at)}</span>
        </div>
      </div>
      <div className="flex flex-col gap-0.5 mt-0.5 shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onMarkRead(alerta.id)
          }}
          className="rounded p-1 text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-white/5 transition-colors"
          title="Marcar como leída"
        >
          <Eye className="h-3 w-3" />
        </button>
        {onSnooze && (
          <SnoozeMenu onSnooze={(until) => onSnooze(alerta.id, until)} />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SAE notification item (mini-card en el dropdown)
// ---------------------------------------------------------------------------

function SaeNotifItem({
  notif,
  isNew = false,
  onMarkRead,
  onSnooze,
  onNavigate,
}: {
  notif: SaeNotificacion
  isNew?: boolean
  onMarkRead: (id: string) => void
  onSnooze?: (id: string, until: Date) => void
  onNavigate: (path: string) => void
}) {
  const fueroLabel = getFueroLabel(notif.raw_payload?.fuero)

  const handleClick = () => {
    onMarkRead(notif.id)
    if (notif.expediente_id) onNavigate(`/expedientes/${notif.expediente_id}`)
    else onNavigate('/notificaciones-sae')
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        'flex items-start gap-2.5 px-3 py-2.5 cursor-pointer transition-colors border-b border-white/5 last:border-0',
        isNew ? 'bg-emerald-500/[0.04] hover:bg-emerald-500/[0.1]' : 'hover:bg-cyan-500/10',
      )}
    >
      <div className="mt-0.5 shrink-0 rounded-lg bg-cyan-500/15 p-1 text-cyan-300 relative">
        <Bell className="h-3.5 w-3.5" />
        {isNew && (
          <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 ring-1 ring-zinc-900" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[10px] mb-0.5 flex-wrap">
          {notif.tipo && (
            <span className="rounded bg-violet-500/15 px-1.5 py-0.5 font-semibold uppercase tracking-wider text-violet-300">
              {notif.tipo}
            </span>
          )}
          {notif.numero_expediente && (
            <span className="font-mono text-zinc-300">Exp. {notif.numero_expediente}</span>
          )}
        </div>
        <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100 line-clamp-2 leading-snug">
          {notif.titulo || notif.caratula || 'Notificación SAE'}
        </p>
        {fueroLabel && (
          <p className="mt-0.5 text-[10px] text-zinc-600 dark:text-zinc-500 truncate">
            {fueroLabel}
            {notif.oficina && ` · ${notif.oficina}`}
          </p>
        )}
        <p className="mt-0.5 text-[10px] text-zinc-600 dark:text-zinc-500">
          {timeAgo(notif.fecha_emision ?? notif.created_at)}
        </p>
      </div>
      <div className="flex flex-col gap-0.5 mt-0.5 shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onMarkRead(notif.id)
          }}
          className="rounded p-1 text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-white/5 transition-colors"
          title="Marcar como leída"
        >
          <Eye className="h-3 w-3" />
        </button>
        {onSnooze && (
          <SnoozeMenu onSnooze={(until) => onSnooze(notif.id, until)} />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Agrupación por expediente
// ---------------------------------------------------------------------------

function groupByExpediente<T extends { expediente_id?: string | null }>(items: T[]): T[][] {
  const groups: T[][] = []
  const indexById = new Map<string, number>()
  for (const item of items) {
    const id = item.expediente_id
    if (!id) {
      groups.push([item])
      continue
    }
    const idx = indexById.get(id)
    if (idx !== undefined) {
      groups[idx].push(item)
    } else {
      indexById.set(id, groups.length)
      groups.push([item])
    }
  }
  return groups
}

function AlertasGroup({
  group,
  hasNew,
  onMarkRead,
  onSnooze,
  onNavigate,
}: {
  group: AlertaWithExpediente[]
  hasNew: boolean
  onMarkRead: (id: string) => void
  onSnooze: (id: string, until: Date) => void
  onNavigate: (path: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const first = group[0]
  const exp = first.expediente
  const label = exp?.caratula || exp?.numero || 'Expediente'
  const subtitle = exp?.caratula && exp?.numero ? exp.numero : null

  return (
    <div className={cn(
      'border-b border-white/5 last:border-0',
      hasNew && 'bg-emerald-500/[0.03]',
    )}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors text-left',
          hasNew ? 'hover:bg-emerald-500/[0.08]' : 'hover:bg-white/[0.06]',
        )}
      >
        <div className="mt-0.5 shrink-0 rounded-lg bg-amber-500/15 p-1 text-amber-400 relative">
          <FolderOpen className="h-3.5 w-3.5" />
          {hasNew && (
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 ring-1 ring-zinc-900" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
            {label}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] font-medium text-amber-400">
              {group.length} notificaciones
            </span>
            {subtitle && (
              <span className="text-[10px] text-zinc-500 dark:text-zinc-500 font-mono truncate">
                · {subtitle}
              </span>
            )}
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-zinc-500 shrink-0" />
        )}
      </button>
      {expanded && (
        <div className="bg-black/10 dark:bg-black/20 pl-3 border-l-2 border-amber-500/30 ml-3 mb-1 mr-1 rounded-r">
          {group.map((alerta) => (
            <NotificationItem
              key={alerta.id}
              alerta={alerta}
              onMarkRead={onMarkRead}
              onSnooze={onSnooze}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function renderAlertList(
  items: AlertaWithExpediente[],
  isNewFn: (a: AlertaWithExpediente) => boolean,
  onMarkRead: (id: string) => void,
  onSnooze: (id: string, until: Date) => void,
  onNavigate: (path: string) => void,
) {
  const groups = groupByExpediente(items)
  return groups.map((group, i) => {
    if (group.length >= 2) {
      const hasNew = group.some(isNewFn)
      return (
        <AlertasGroup
          key={`g-${group[0].expediente_id}-${i}`}
          group={group}
          hasNew={hasNew}
          onMarkRead={onMarkRead}
          onSnooze={onSnooze}
          onNavigate={onNavigate}
        />
      )
    }
    const a = group[0]
    return (
      <NotificationItem
        key={a.id}
        alerta={a}
        isNew={isNewFn(a)}
        onMarkRead={onMarkRead}
        onSnooze={onSnooze}
        onNavigate={onNavigate}
      />
    )
  })
}

// ---------------------------------------------------------------------------
// Main dropdown
// ---------------------------------------------------------------------------

export function NotificationDropdown() {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const { data: alertas } = useAlertas()
  const { data: saeUnread = 0 } = useSaeNotifUnreadCount()
  const { data: saeNotifs = [] } = useSaeNotificaciones({ unreadOnly: true, limit: 5 })
  const { data: lastSeen } = useNotifLastSeen()
  const markAsSeen = useMarkNotifsAsSeen()
  const marcarLeida = useMarcarLeida()
  const marcarTodasLeidas = useMarcarTodasLeidas()
  const snoozeAlerta = useSnoozeAlerta()
  const markSaeRead = useMarkSaeNotifAsRead()
  const markAllSaeRead = useMarkAllSaeNotifAsRead()
  const snoozeSae = useSnoozeSaeNotif()

  // Snapshot del lastSeen al abrir: queda fijo mientras el dropdown está abierto,
  // así el separador "Nuevas/Anteriores" no salta cuando se actualiza el ts.
  const [seenSnapshot, setSeenSnapshot] = useState<string | null>(null)
  useEffect(() => {
    if (isOpen && seenSnapshot === null) {
      setSeenSnapshot(lastSeen ?? new Date(0).toISOString())
      markAsSeen.mutate()
    }
    if (!isOpen && seenSnapshot !== null) {
      setSeenSnapshot(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, lastSeen])

  const alertCount = alertas?.length ?? 0
  const totalCount = alertCount + saeUnread
  const displayAlerts = (alertas ?? []).slice(0, 8)

  // Split en "nuevas" vs "anteriores" según seenSnapshot
  const isNewAlert = (a: AlertaWithExpediente) =>
    seenSnapshot ? a.created_at > seenSnapshot : false
  const isNewSae = (n: SaeNotificacion) => {
    if (!seenSnapshot) return false
    const ts = n.fecha_emision ?? n.created_at
    return ts > seenSnapshot
  }
  const newAlerts = displayAlerts.filter(isNewAlert)
  const oldAlerts = displayAlerts.filter((a) => !isNewAlert(a))
  const newSae = saeNotifs.filter(isNewSae)
  const oldSae = saeNotifs.filter((n) => !isNewSae(n))
  const newCount = newAlerts.length + newSae.length

  const handleMarkAllAll = () => {
    if (alertCount > 0) marcarTodasLeidas.mutate()
    if (saeUnread > 0) markAllSaeRead.mutate()
  }

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (
        panelRef.current && !panelRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }
    // Defer to next tick so the opening click doesn't immediately close
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 10)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isOpen])

  const handleNavigate = (path: string) => {
    setIsOpen(false)
    navigate(path)
  }

  return (
    <>
      {/* Bell button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative rounded-lg p-2 text-zinc-600 dark:text-zinc-400 hover:bg-white/5 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
        aria-label="Notificaciones"
      >
        <Bell className="h-5 w-5" />
        {totalCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-zinc-950 animate-pulse-subtle">
            {totalCount > 99 ? '99+' : totalCount}
          </span>
        )}
      </button>

      {/* Portal: overlay + dropdown rendered at document.body level */}
      {isOpen && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[99]"
            onClick={() => setIsOpen(false)}
          />

          {/* Panel */}
          <div
            ref={panelRef}
            className="fixed left-3 right-3 top-[4.5rem] z-[100] max-h-[calc(100vh-6rem)] sm:left-auto sm:right-4 sm:w-[380px] overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl animate-fade-in flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Notificaciones</h3>
                {totalCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/15 px-1.5 text-[10px] font-bold text-amber-400">
                    {totalCount}
                  </span>
                )}
                {newCount > 0 && (
                  <span className="flex h-5 items-center justify-center rounded-full bg-emerald-500/15 px-2 text-[10px] font-bold text-emerald-400">
                    {newCount} {newCount === 1 ? 'nueva' : 'nuevas'}
                  </span>
                )}
              </div>
              {totalCount > 0 && (
                <button
                  onClick={handleMarkAllAll}
                  disabled={marcarTodasLeidas.isPending || markAllSaeRead.isPending}
                  className="flex items-center gap-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:text-amber-400 transition-colors disabled:opacity-50"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Marcar todas leídas
                </button>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto sm:max-h-[420px]">
              {displayAlerts.length === 0 && saeNotifs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 px-4">
                  <BellOff className="h-8 w-8 text-zinc-600 mb-2" />
                  <p className="text-xs text-zinc-900 dark:text-zinc-500">Sin notificaciones pendientes</p>
                  <button
                    onClick={() => handleNavigate('/alertas')}
                    className="mt-3 text-[11px] font-medium text-amber-500 hover:text-amber-400 transition-colors"
                  >
                    Configurar alertas →
                  </button>
                </div>
              ) : (
                <>
                  {/* SAE notifications section */}
                  {saeNotifs.length > 0 && (
                    <div className="border-b border-white/10">
                      <div className="flex items-center justify-between px-4 py-2 bg-cyan-500/5">
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-cyan-300">
                          SAE · Casillero digital
                        </span>
                        {saeUnread > saeNotifs.length && (
                          <button
                            onClick={() => handleNavigate('/notificaciones-sae')}
                            className="text-[10px] text-cyan-300 hover:underline"
                          >
                            Ver todas ({saeUnread})
                          </button>
                        )}
                      </div>
                      {newSae.length > 0 && oldSae.length > 0 && (
                        <SeenSeparator label="Nuevas" tone="new" />
                      )}
                      {newSae.map((n) => (
                        <SaeNotifItem
                          key={n.id}
                          notif={n}
                          isNew
                          onMarkRead={(id) => markSaeRead.mutate(id)}
                          onSnooze={(id, until) => snoozeSae.mutate({ id, until })}
                          onNavigate={handleNavigate}
                        />
                      ))}
                      {newSae.length > 0 && oldSae.length > 0 && (
                        <SeenSeparator label="Anteriores" tone="old" />
                      )}
                      {oldSae.map((n) => (
                        <SaeNotifItem
                          key={n.id}
                          notif={n}
                          onMarkRead={(id) => markSaeRead.mutate(id)}
                          onSnooze={(id, until) => snoozeSae.mutate({ id, until })}
                          onNavigate={handleNavigate}
                        />
                      ))}
                    </div>
                  )}

                  {/* Internal alertas section */}
                  {displayAlerts.length > 0 && (
                    <div>
                      {saeNotifs.length > 0 && (
                        <div className="px-4 py-2 bg-amber-500/5">
                          <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-300">
                            Alertas internas
                          </span>
                        </div>
                      )}
                      {newAlerts.length > 0 && oldAlerts.length > 0 && (
                        <SeenSeparator label="Nuevas" tone="new" />
                      )}
                      {renderAlertList(
                        newAlerts,
                        isNewAlert,
                        (id) => marcarLeida.mutate(id),
                        (id, until) => snoozeAlerta.mutate({ id, until }),
                        handleNavigate,
                      )}
                      {newAlerts.length > 0 && oldAlerts.length > 0 && (
                        <SeenSeparator label="Anteriores" tone="old" />
                      )}
                      {renderAlertList(
                        oldAlerts,
                        isNewAlert,
                        (id) => marcarLeida.mutate(id),
                        (id, until) => snoozeAlerta.mutate({ id, until }),
                        handleNavigate,
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            {(alertCount > 8 || saeUnread > saeNotifs.length) && (
              <div className="border-t border-white/10 px-3 py-2.5 flex flex-col gap-1">
                {alertCount > 0 && (
                  <button
                    onClick={() => handleNavigate('/alertas')}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/10 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Ver todas las alertas
                    {alertCount > 8 && (
                      <span className="text-zinc-600 dark:text-zinc-500">({alertCount - 8} más)</span>
                    )}
                  </button>
                )}
                {saeUnread > saeNotifs.length && (
                  <button
                    onClick={() => handleNavigate('/notificaciones-sae')}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/10 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Ver todas las notificaciones SAE
                  </button>
                )}
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </>
  )
}

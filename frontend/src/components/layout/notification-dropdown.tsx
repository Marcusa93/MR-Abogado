import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAlertas, useMarcarLeida, useMarcarTodasLeidas, type AlertaWithExpediente } from '@/hooks/use-alertas'
import { useSaeNotifUnreadCount } from '@/hooks/use-sae-notificaciones'
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
// Single notification item
// ---------------------------------------------------------------------------

function NotificationItem({
  alerta,
  onMarkRead,
  onNavigate,
}: {
  alerta: AlertaWithExpediente
  onMarkRead: (id: string) => void
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
      className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-white/[0.06] transition-colors border-b border-white/5 last:border-0"
    >
      <div className={cn('mt-0.5 shrink-0', tipo.color)}>
        <Icon className="h-4 w-4" />
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
      <button
        onClick={(e) => {
          e.stopPropagation()
          onMarkRead(alerta.id)
        }}
        className="mt-0.5 shrink-0 rounded p-1 text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-white/5 transition-colors"
        title="Marcar como leída"
      >
        <Eye className="h-3 w-3" />
      </button>
    </div>
  )
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
  const marcarLeida = useMarcarLeida()
  const marcarTodasLeidas = useMarcarTodasLeidas()

  const alertCount = alertas?.length ?? 0
  const totalCount = alertCount + saeUnread
  const displayAlerts = (alertas ?? []).slice(0, 8)

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
                {alertCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/15 px-1.5 text-[10px] font-bold text-amber-400">
                    {alertCount}
                  </span>
                )}
              </div>
              {alertCount > 0 && (
                <button
                  onClick={() => marcarTodasLeidas.mutate()}
                  disabled={marcarTodasLeidas.isPending}
                  className="flex items-center gap-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:text-amber-400 transition-colors"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Marcar todas leídas
                </button>
              )}
            </div>

            {/* SAE highlight: si hay notif SAE no leídas, mostrar shortcut */}
            {saeUnread > 0 && (
              <button
                onClick={() => handleNavigate('/notificaciones-sae')}
                className="w-full border-b border-white/10 px-4 py-3 flex items-center gap-3 hover:bg-cyan-500/10 transition-colors text-left"
              >
                <div className="rounded-lg bg-cyan-500/15 p-2 shrink-0">
                  <Bell className="h-4 w-4 text-cyan-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {saeUnread} {saeUnread === 1 ? 'notificación' : 'notificaciones'} del SAE
                  </p>
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                    Sin leer en el casillero digital · tocá para ver
                  </p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-cyan-300 shrink-0" />
              </button>
            )}

            {/* Alert list */}
            <div className="flex-1 overflow-y-auto sm:max-h-[380px]">
              {displayAlerts.length === 0 && saeUnread === 0 ? (
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
              ) : displayAlerts.length === 0 ? null : (
                displayAlerts.map((alerta) => (
                  <NotificationItem
                    key={alerta.id}
                    alerta={alerta}
                    onMarkRead={(id) => marcarLeida.mutate(id)}
                    onNavigate={handleNavigate}
                  />
                ))
              )}
            </div>

            {/* Footer */}
            {alertCount > 0 && (
              <div className="border-t border-white/10 px-3 py-2.5">
                <button
                  onClick={() => handleNavigate('/alertas')}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/10 transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  Ver todas las alertas
                  {alertCount > 8 && (
                    <span className="text-zinc-900 dark:text-zinc-500">({alertCount - 8} más)</span>
                  )}
                </button>
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </>
  )
}

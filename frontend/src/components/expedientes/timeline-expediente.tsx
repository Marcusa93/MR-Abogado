import { cn } from '@/lib/utils'
import { formatDate, timeAgo } from '@/lib/utils/date-helpers'
import type { TimelineEvent } from '@/hooks/use-expedientes'
import {
  RefreshCw,
  MessageSquare,
  CalendarClock,
  StickyNote,
  CheckSquare,
  Paperclip,
  Clock,
} from 'lucide-react'

const EVENT_CONFIG: Record<
  string,
  { icon: typeof RefreshCw; color: string; bg: string }
> = {
  estado: {
    icon: RefreshCw,
    color: 'text-amber-400',
    bg: 'bg-amber-950/40',
  },
  seguimiento: {
    icon: MessageSquare,
    color: 'text-violet-400',
    bg: 'bg-violet-950/40',
  },
  turno: {
    icon: CalendarClock,
    color: 'text-amber-400',
    bg: 'bg-amber-950/40',
  },
  nota: {
    icon: StickyNote,
    color: 'text-zinc-600 dark:text-zinc-400',
    bg: 'bg-white/5',
  },
  tarea: {
    icon: CheckSquare,
    color: 'text-emerald-400',
    bg: 'bg-emerald-950/40',
  },
  documento: {
    icon: Paperclip,
    color: 'text-blue-400',
    bg: 'bg-blue-950/40',
  },
}

const FALLBACK_CONFIG = {
  icon: Clock,
  color: 'text-zinc-600 dark:text-zinc-400',
  bg: 'bg-white/5',
}

interface TimelineExpedienteProps {
  events: TimelineEvent[]
  className?: string
}

export function TimelineExpediente({
  events,
  className,
}: TimelineExpedienteProps) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Clock className="h-8 w-8 text-zinc-600 dark:text-zinc-400" />
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          No hay eventos en la línea de tiempo.
        </p>
      </div>
    )
  }

  return (
    <div className={cn('relative', className)}>
      {/* Vertical line */}
      <div className="absolute left-4 top-0 bottom-0 w-px bg-white/10" />

      <div className="space-y-0">
        {events.map((event, idx) => {
          const config = EVENT_CONFIG[event.tipo] ?? FALLBACK_CONFIG
          const Icon = config.icon

          return (
            <div
              key={event.id}
              className={cn(
                'relative flex gap-4 py-3 pl-0 pr-2',
                idx % 2 === 0
                  ? 'bg-transparent'
                  : 'bg-zinc-50 dark:bg-white/[0.02] rounded-lg'
              )}
            >
              {/* Icon circle */}
              <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg',
                    config.bg
                  )}
                >
                  <Icon className={cn('h-3.5 w-3.5', config.color)} />
                </div>
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {event.titulo}
                    </p>
                    {event.detalle && (
                      <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">
                        {event.detalle}
                      </p>
                    )}
                    {event.usuario_nombre && (
                      <div className="mt-1 flex items-center gap-1.5">
                        <div className="flex h-4 w-4 items-center justify-center rounded-full bg-white/10 text-[8px] font-bold text-zinc-700 dark:text-zinc-300">
                          {event.usuario_nombre
                            .split(' ')
                            .map((w) => w[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                        <span className="text-[11px] text-zinc-700 dark:text-zinc-300">
                          {event.usuario_nombre}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-[11px] text-zinc-700 dark:text-zinc-300">
                      {timeAgo(event.fecha)}
                    </p>
                    <p className="text-[10px] text-zinc-600 dark:text-zinc-400">
                      {formatDate(event.fecha)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

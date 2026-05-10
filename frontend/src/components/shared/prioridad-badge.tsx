import { cn } from '@/lib/utils'
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react'

const PRIORIDAD_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; icon: LucideIcon }
> = {
  BAJA: {
    label: 'Baja',
    bg: 'bg-slate-400/15 border border-slate-400/25',
    text: 'text-zinc-700 dark:text-zinc-300',
    icon: ArrowDown,
  },
  MEDIA: {
    label: 'Media',
    bg: 'bg-blue-500/15 border border-blue-500/25',
    text: 'text-blue-300',
    icon: ArrowRight,
  },
  ALTA: {
    label: 'Alta',
    bg: 'bg-amber-500/15 border border-amber-500/25',
    text: 'text-amber-300',
    icon: ArrowUp,
  },
  URGENTE: {
    label: 'Urgente',
    bg: 'bg-rose-500/20 border border-rose-500/30',
    text: 'text-rose-300',
    icon: AlertTriangle,
  },
}

const FALLBACK_CONFIG = {
  label: 'Sin prioridad',
  bg: 'bg-slate-400/15 border border-slate-400/25',
  text: 'text-zinc-700 dark:text-zinc-300',
  icon: ArrowRight,
}

interface PrioridadBadgeProps {
  prioridad: string
  showIcon?: boolean
  className?: string
  compact?: boolean
}

export function PrioridadBadge({
  prioridad,
  showIcon = true,
  className,
  compact = false,
}: PrioridadBadgeProps) {
  const config = PRIORIDAD_CONFIG[prioridad] ?? FALLBACK_CONFIG
  const Icon = config.icon

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full text-xs font-medium whitespace-nowrap',
        config.bg,
        config.text,
        compact ? 'px-2 py-0.5' : 'px-2.5 py-1',
        className
      )}
    >
      {showIcon && <Icon className="h-3 w-3 shrink-0" />}
      {config.label}
    </span>
  )
}

export function getPrioridadConfig(prioridad: string) {
  return PRIORIDAD_CONFIG[prioridad] ?? FALLBACK_CONFIG
}

export const PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA', 'URGENTE'] as const

import { cn } from '@/lib/utils'
import type { SemaforoColor } from '@/lib/utils/semaforo'

const SEMAFORO_CONFIG: Record<
  SemaforoColor,
  {
    color: string
    glow: string
    label: string
    animate: boolean
  }
> = {
  rojo: {
    color: 'bg-red-500',
    glow: 'shadow-[0_0_6px] shadow-red-500/40',
    label: 'Dado de baja / No viable',
    animate: false,
  },
  verde: {
    color: 'bg-emerald-500',
    glow: 'shadow-[0_0_6px] shadow-emerald-500/40',
    label: 'Audiencia próxima',
    animate: true,
  },
  amarillo: {
    color: 'bg-amber-400',
    glow: 'shadow-[0_0_6px] shadow-amber-400/40',
    label: 'Tarea pendiente',
    animate: true,
  },
  gris: {
    color: 'bg-slate-500',
    glow: '',
    label: 'Tomado / Sin acción pendiente',
    animate: false,
  },
}

interface SemaforoBadgeProps {
  color: SemaforoColor
  size?: 'sm' | 'md'
  showTooltip?: boolean
  className?: string
}

export function SemaforoBadge({
  color,
  size = 'sm',
  className,
}: SemaforoBadgeProps) {
  const config = SEMAFORO_CONFIG[color]
  const sizeClass = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'

  return (
    <span
      title={config.label}
      className={cn(
        'inline-block shrink-0 rounded-full ring-2 ring-white/10',
        sizeClass,
        config.color,
        config.animate && 'animate-pulse',
        config.glow,
        className
      )}
    />
  )
}

export { SEMAFORO_CONFIG }

import { cn } from '@/lib/utils'
import type { EstadoInterno } from '@/types/enums'

export interface EstadoConfig {
  label: string
  bg: string
  text: string
  dot: string
  gradient: string
  bgTint: string
}

// ---------------------------------------------------------------------------
// Estados del workflow judicial — schema MR Estudio Jurídico
// ---------------------------------------------------------------------------

const ESTADO_CONFIG: Record<string, EstadoConfig> = {
  NUEVA_CONSULTA: {
    label: 'Nueva consulta',
    bg: 'bg-slate-500/20 border border-slate-400/35',
    text: 'text-zinc-800 dark:text-zinc-200',
    dot: 'bg-slate-400',
    gradient: 'from-slate-500 to-slate-400',
    bgTint: 'bg-slate-500/10 border-slate-500/20',
  },
  PARA_INICIAR: {
    label: 'Para iniciar',
    bg: 'bg-violet-500/25 border border-violet-400/50',
    text: 'text-violet-300',
    dot: 'bg-violet-400',
    gradient: 'from-violet-500 to-purple-400',
    bgTint: 'bg-violet-500/10 border-violet-500/20',
  },
  INICIADO: {
    label: 'Iniciado',
    bg: 'bg-blue-500/25 border border-blue-400/50',
    text: 'text-blue-300',
    dot: 'bg-blue-400',
    gradient: 'from-blue-500 to-cyan-400',
    bgTint: 'bg-blue-500/10 border-blue-500/20',
  },
  PRUEBA: {
    label: 'Prueba',
    bg: 'bg-cyan-500/25 border border-cyan-400/50',
    text: 'text-cyan-300',
    dot: 'bg-cyan-400',
    gradient: 'from-cyan-500 to-sky-400',
    bgTint: 'bg-cyan-500/10 border-cyan-500/20',
  },
  ALEGATOS: {
    label: 'Alegatos',
    bg: 'bg-amber-500/25 border border-amber-400/50',
    text: 'text-amber-300',
    dot: 'bg-amber-400',
    gradient: 'from-amber-500 to-yellow-400',
    bgTint: 'bg-amber-500/10 border-amber-500/20',
  },
  SENTENCIA: {
    label: 'Sentencia',
    bg: 'bg-orange-500/25 border border-orange-400/50',
    text: 'text-orange-300',
    dot: 'bg-orange-400',
    gradient: 'from-orange-500 to-amber-400',
    bgTint: 'bg-orange-500/10 border-orange-500/20',
  },
  APELACION: {
    label: 'Apelación',
    bg: 'bg-purple-500/25 border border-purple-400/50',
    text: 'text-purple-300',
    dot: 'bg-purple-400',
    gradient: 'from-purple-500 to-fuchsia-400',
    bgTint: 'bg-purple-500/10 border-purple-500/20',
  },
  CORTE: {
    label: 'Corte',
    bg: 'bg-indigo-500/25 border border-indigo-400/50',
    text: 'text-indigo-300',
    dot: 'bg-indigo-400',
    gradient: 'from-indigo-500 to-blue-400',
    bgTint: 'bg-indigo-500/10 border-indigo-500/20',
  },
  FINALIZADO: {
    label: 'Finalizado',
    bg: 'bg-emerald-500/25 border border-emerald-400/50',
    text: 'text-emerald-300',
    dot: 'bg-emerald-400',
    gradient: 'from-emerald-500 to-green-400',
    bgTint: 'bg-emerald-500/10 border-emerald-500/20',
  },
  NO_VIABLE_RECHAZADO: {
    label: 'No viable / rechazado',
    bg: 'bg-rose-500/30 border border-rose-400/60',
    text: 'text-rose-300',
    dot: 'bg-rose-400',
    gradient: 'from-rose-500 to-rose-400',
    bgTint: 'bg-rose-500/10 border-rose-500/20',
  },
  PAUSADO: {
    label: 'Pausado',
    bg: 'bg-zinc-500/25 border border-zinc-400/50',
    text: 'text-zinc-300',
    dot: 'bg-zinc-400',
    gradient: 'from-zinc-500 to-zinc-400',
    bgTint: 'bg-zinc-500/10 border-zinc-500/20',
  },
}

const FALLBACK_CONFIG: EstadoConfig = {
  label: 'Desconocido',
  bg: 'bg-slate-400/20 border border-slate-400/35',
  text: 'text-zinc-800 dark:text-zinc-200',
  dot: 'bg-slate-400',
  gradient: 'from-slate-500 to-slate-400',
  bgTint: 'bg-slate-500/10 border-slate-500/20',
}

interface EstadoBadgeProps {
  estado: string
  showDot?: boolean
  className?: string
  compact?: boolean
}

export function EstadoBadge({
  estado,
  showDot = true,
  className,
  compact = false,
}: EstadoBadgeProps) {
  const config = ESTADO_CONFIG[estado as EstadoInterno] ?? FALLBACK_CONFIG

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap',
        config.bg,
        config.text,
        compact ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1',
        className
      )}
    >
      {showDot && (
        <span
          className={cn('h-1.5 w-1.5 shrink-0 rounded-full', config.dot)}
        />
      )}
      {config.label}
    </span>
  )
}

export function getEstadoConfig(estado: string) {
  return ESTADO_CONFIG[estado as EstadoInterno] ?? FALLBACK_CONFIG
}

export const ESTADOS_INTERNOS = Object.keys(ESTADO_CONFIG) as Array<
  keyof typeof ESTADO_CONFIG
>

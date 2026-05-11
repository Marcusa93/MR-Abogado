import { cn } from '@/lib/utils'
import { EstadoInterno, ESTADO_INTERNO_LABELS } from '@/types/enums'

export interface EstadoConfig {
  label: string
  bg: string
  text: string
  dot: string
  gradient: string
  bgTint: string
}

// ---------------------------------------------------------------------------
// Paleta semántica para los 11 estados del enum EstadoInterno.
// El label se deriva de ESTADO_INTERNO_LABELS (única fuente de verdad).
// ---------------------------------------------------------------------------

const ESTADO_CONFIG: Record<EstadoInterno, EstadoConfig> = {
  NUEVA_CONSULTA: {
    label: ESTADO_INTERNO_LABELS.NUEVA_CONSULTA,
    bg: 'bg-slate-500/20 border border-slate-400/35',
    text: 'text-zinc-800 dark:text-zinc-200',
    dot: 'bg-slate-400',
    gradient: 'from-slate-500 to-slate-400',
    bgTint: 'bg-slate-500/10 border-slate-500/20',
  },
  PARA_INICIAR: {
    label: ESTADO_INTERNO_LABELS.PARA_INICIAR,
    bg: 'bg-amber-500/25 border border-amber-400/50',
    text: 'text-amber-300',
    dot: 'bg-amber-400',
    gradient: 'from-amber-500 to-yellow-400',
    bgTint: 'bg-amber-500/10 border-amber-500/20',
  },
  INICIADO: {
    label: ESTADO_INTERNO_LABELS.INICIADO,
    bg: 'bg-blue-500/25 border border-blue-400/50',
    text: 'text-blue-300',
    dot: 'bg-blue-400',
    gradient: 'from-blue-500 to-cyan-400',
    bgTint: 'bg-blue-500/10 border-blue-500/20',
  },
  PRUEBA: {
    label: ESTADO_INTERNO_LABELS.PRUEBA,
    bg: 'bg-indigo-500/25 border border-indigo-400/50',
    text: 'text-indigo-300',
    dot: 'bg-indigo-400',
    gradient: 'from-indigo-500 to-blue-400',
    bgTint: 'bg-indigo-500/10 border-indigo-500/20',
  },
  ALEGATOS: {
    label: ESTADO_INTERNO_LABELS.ALEGATOS,
    bg: 'bg-violet-500/25 border border-violet-400/50',
    text: 'text-violet-300',
    dot: 'bg-violet-400',
    gradient: 'from-violet-500 to-purple-400',
    bgTint: 'bg-violet-500/10 border-violet-500/20',
  },
  SENTENCIA: {
    label: ESTADO_INTERNO_LABELS.SENTENCIA,
    bg: 'bg-cyan-500/25 border border-cyan-400/50',
    text: 'text-cyan-300',
    dot: 'bg-cyan-400',
    gradient: 'from-cyan-500 to-sky-400',
    bgTint: 'bg-cyan-500/10 border-cyan-500/20',
  },
  APELACION: {
    label: ESTADO_INTERNO_LABELS.APELACION,
    bg: 'bg-orange-500/25 border border-orange-400/50',
    text: 'text-orange-300',
    dot: 'bg-orange-400',
    gradient: 'from-orange-500 to-amber-400',
    bgTint: 'bg-orange-500/10 border-orange-500/20',
  },
  CORTE: {
    label: ESTADO_INTERNO_LABELS.CORTE,
    bg: 'bg-rose-500/25 border border-rose-400/50',
    text: 'text-rose-300',
    dot: 'bg-rose-400',
    gradient: 'from-rose-500 to-pink-400',
    bgTint: 'bg-rose-500/10 border-rose-500/20',
  },
  FINALIZADO: {
    label: ESTADO_INTERNO_LABELS.FINALIZADO,
    bg: 'bg-emerald-500/25 border border-emerald-400/50',
    text: 'text-emerald-300',
    dot: 'bg-emerald-400',
    gradient: 'from-emerald-500 to-emerald-400',
    bgTint: 'bg-emerald-500/10 border-emerald-500/20',
  },
  NO_VIABLE_RECHAZADO: {
    label: ESTADO_INTERNO_LABELS.NO_VIABLE_RECHAZADO,
    bg: 'bg-red-500/30 border border-red-400/60',
    text: 'text-red-300',
    dot: 'bg-red-400',
    gradient: 'from-red-500 to-rose-400',
    bgTint: 'bg-red-500/10 border-red-500/20',
  },
  PAUSADO: {
    label: ESTADO_INTERNO_LABELS.PAUSADO,
    bg: 'bg-zinc-500/25 border border-zinc-400/50',
    text: 'text-zinc-300',
    dot: 'bg-zinc-400',
    gradient: 'from-zinc-500 to-slate-400',
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

export const ESTADOS_INTERNOS = Object.keys(ESTADO_CONFIG) as EstadoInterno[]

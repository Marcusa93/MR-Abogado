// ---------------------------------------------------------------------------
// Centralized semáforo-based color system for expediente rows/cards
// The semáforo (blanco/amarillo/verde/rojo) is the PRIMARY visual indicator.
// The whole row/card gets tinted with the semáforo color.
// ---------------------------------------------------------------------------

import { calcularSemaforo, calcularSemaforoKanban, type SemaforoColor } from './semaforo'

// Estilos del semáforo: cada card mantiene su fondo base (glass-card en
// dark, white en light) y le sumamos un ring tintado + border izquierdo
// como indicador visual del estado de salud (rojo/verde/amarillo/gris).
// Antes usábamos bg-X/0.04 que pisaba el fondo de la card y la dejaba
// invisible sobre el mesh-gradient oscuro.
const SEMAFORO_STYLES: Record<SemaforoColor, { bg: string; borderL: string; hoverBg: string }> = {
  rojo: {
    bg: 'ring-1 ring-inset ring-red-500/20',
    borderL: 'border-l-red-500',
    hoverBg: 'hover:ring-red-500/40',
  },
  verde: {
    bg: 'ring-1 ring-inset ring-emerald-500/20',
    borderL: 'border-l-emerald-500',
    hoverBg: 'hover:ring-emerald-500/40',
  },
  verde_terminal: {
    bg: 'ring-1 ring-inset ring-emerald-400/40 shadow-[inset_3px_0_0_0_rgba(16,185,129,0.55)]',
    borderL: 'border-l-emerald-400',
    hoverBg: 'hover:ring-emerald-400/60',
  },
  amarillo: {
    bg: 'ring-1 ring-inset ring-amber-400/20',
    borderL: 'border-l-amber-400',
    hoverBg: 'hover:ring-amber-400/40',
  },
  gris: {
    bg: 'ring-1 ring-inset ring-slate-400/15',
    borderL: 'border-l-slate-500',
    hoverBg: 'hover:ring-slate-400/30',
  },
}

/**
 * Returns full row className for an expediente using semáforo colors.
 * The whole row is tinted: rojo, verde, amarillo, or gris.
 */
export function getExpedienteRowClass(exp: {
  estado_interno: string
  audiencias?: { id: string; estado: string; fecha: string }[]
  tareas?: { id: string; estado: string }[]
}): string {
  const color = calcularSemaforo(exp)
  const s = SEMAFORO_STYLES[color]
  return `${s.bg} ${s.borderL} ${s.hoverBg}`
}

/**
 * Returns border class for a kanban card based on semáforo.
 */
export function getKanbanCardClass(card: {
  estado_interno: string
  tareas_pendientes_count?: number
  proxima_fecha_audiencia?: string | null
}): string {
  const color = calcularSemaforoKanban(card)
  return SEMAFORO_STYLES[color].borderL
}

/**
 * Returns row className from a pre-calculated semáforo color.
 */
export function getSemaforoRowClass(color: SemaforoColor): string {
  const s = SEMAFORO_STYLES[color]
  return `${s.bg} ${s.borderL} ${s.hoverBg}`
}

export { SEMAFORO_STYLES }

// ---------------------------------------------------------------------------
// Estado-based helpers (backward compat / fallback)
// ---------------------------------------------------------------------------

const ESTADO_BORDERS: Record<string, string> = {
  NUEVA_CONSULTA: 'border-l-slate-500',
  PARA_INICIAR: 'border-l-violet-500',
  INICIADO: 'border-l-blue-500',
  PRUEBA: 'border-l-cyan-500',
  ALEGATOS: 'border-l-amber-500',
  SENTENCIA: 'border-l-orange-500',
  APELACION: 'border-l-purple-500',
  CORTE: 'border-l-indigo-500',
  FINALIZADO: 'border-l-emerald-500',
  NO_VIABLE_RECHAZADO: 'border-l-rose-500',
  PAUSADO: 'border-l-zinc-400',
}

export function getEstadoRowClass(estado: string): string {
  const border = ESTADO_BORDERS[estado] ?? 'border-l-slate-500'
  return `bg-slate-500/[0.03] ${border} hover:bg-zinc-100 dark:bg-white/[0.04]`
}

export function getEstadoBorderClass(estado: string): string {
  return ESTADO_BORDERS[estado] ?? 'border-l-slate-500'
}

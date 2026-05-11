// ---------------------------------------------------------------------------
// Centralized semáforo-based color system for expediente rows/cards
// The semáforo (blanco/amarillo/verde/rojo) is the PRIMARY visual indicator.
// The whole row/card gets tinted with the semáforo color.
// ---------------------------------------------------------------------------

import { calcularSemaforo, calcularSemaforoKanban, type SemaforoColor } from './semaforo'

// Intense semáforo row styles — visible full-row tinting.
// `verde` = activo con audiencia próxima (saludable). `verde_terminal` = ganado/cerrado favorable (distinto, con glow).
const SEMAFORO_STYLES: Record<SemaforoColor, { bg: string; borderL: string; hoverBg: string }> = {
  rojo: {
    bg: 'bg-red-500/[0.10]',
    borderL: 'border-l-red-500',
    hoverBg: 'hover:bg-red-500/[0.16]',
  },
  verde: {
    bg: 'bg-emerald-500/[0.10]',
    borderL: 'border-l-emerald-500',
    hoverBg: 'hover:bg-emerald-500/[0.16]',
  },
  verde_terminal: {
    bg: 'bg-emerald-500/[0.18] shadow-[inset_3px_0_0_0_rgba(16,185,129,0.45)]',
    borderL: 'border-l-emerald-400',
    hoverBg: 'hover:bg-emerald-500/[0.24]',
  },
  amarillo: {
    bg: 'bg-amber-400/[0.10]',
    borderL: 'border-l-amber-400',
    hoverBg: 'hover:bg-amber-400/[0.16]',
  },
  gris: {
    bg: 'bg-slate-400/[0.04]',
    borderL: 'border-l-slate-500',
    hoverBg: 'hover:bg-slate-400/[0.08]',
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

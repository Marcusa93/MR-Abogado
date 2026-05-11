export type SemaforoColor = 'rojo' | 'amarillo' | 'verde' | 'verde_terminal' | 'gris'

const AUDIENCIAS_ACTIVAS = new Set(['PENDIENTE', 'CONFIRMADA', 'pendiente', 'confirmada'])
const TAREAS_PENDIENTES = new Set(['PENDIENTE', 'EN_PROGRESO', 'pendiente', 'en_progreso'])
const ESTADOS_FAVORABLES_TERMINALES = new Set(['FINALIZADO'])
const ESTADOS_NEGATIVOS_TERMINALES = new Set(['NO_VIABLE_RECHAZADO'])

interface SemaforoInput {
  estado_interno: string
  audiencias?: { id: string; estado: string; fecha: string }[]
  tareas?: { id: string; estado: string }[]
}

/**
 * Calcula el color del semáforo para un expediente.
 *
 * Prioridad (gana la primera regla que matchea):
 * 1. Verde terminal → cerrado favorablemente (FINALIZADO)
 * 2. Rojo           → cerrado negativamente (NO_VIABLE_RECHAZADO)
 * 3. Verde          → tiene audiencia activa (pendiente/confirmada con fecha >= hoy)
 * 4. Amarillo       → tiene tarea pendiente o en progreso
 * 5. Gris           → sin acción inmediata
 */
export function calcularSemaforo(exp: SemaforoInput): SemaforoColor {
  // Verde terminal: caso ganado / cerrado favorablemente
  if (ESTADOS_FAVORABLES_TERMINALES.has(exp.estado_interno)) {
    return 'verde_terminal'
  }

  // Rojo: caso rechazado / no viable
  if (ESTADOS_NEGATIVOS_TERMINALES.has(exp.estado_interno)) {
    return 'rojo'
  }

  // Verde: tiene audiencia activa (pendiente/confirmada con fecha >= hoy)
  const today = new Date().toISOString().slice(0, 10)
  const hasActiveAudiencia = (exp.audiencias ?? []).some(
    (a) =>
      AUDIENCIAS_ACTIVAS.has(a.estado) &&
      a.fecha >= today
  )
  if (hasActiveAudiencia) return 'verde'

  // Amarillo: tiene tareas pendientes
  const hasPendingTarea = (exp.tareas ?? []).some(
    (t) => TAREAS_PENDIENTES.has(t.estado)
  )
  if (hasPendingTarea) return 'amarillo'

  // Gris: sin acción inmediata
  return 'gris'
}

/**
 * Variante para Kanban cards que reciben datos distintos del RPC.
 * El RPC get_kanban_data devuelve tareas_pendientes_count y proxima_fecha_audiencia.
 */
export function calcularSemaforoKanban(card: {
  estado_interno: string
  tareas_pendientes_count?: number
  proxima_fecha_audiencia?: string | null
}): SemaforoColor {
  if (ESTADOS_FAVORABLES_TERMINALES.has(card.estado_interno)) {
    return 'verde_terminal'
  }

  if (ESTADOS_NEGATIVOS_TERMINALES.has(card.estado_interno)) {
    return 'rojo'
  }

  const today = new Date().toISOString().slice(0, 10)
  if (card.proxima_fecha_audiencia && card.proxima_fecha_audiencia >= today) {
    return 'verde'
  }

  if (card.tareas_pendientes_count && card.tareas_pendientes_count > 0) {
    return 'amarillo'
  }

  return 'gris'
}

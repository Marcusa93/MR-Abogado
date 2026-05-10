export type SemaforoColor = 'rojo' | 'amarillo' | 'verde' | 'gris'

const AUDIENCIAS_ACTIVAS = new Set(['PENDIENTE', 'CONFIRMADA', 'pendiente', 'confirmada'])
const TAREAS_PENDIENTES = new Set(['PENDIENTE', 'EN_PROGRESO', 'pendiente', 'en_progreso'])
const ESTADOS_ROJOS = new Set(['NO_VIABLE_RECHAZADO', 'FINALIZADO'])

interface SemaforoInput {
  estado_interno: string
  audiencias?: { id: string; estado: string; fecha: string }[]
  tareas?: { id: string; estado: string }[]
}

/**
 * Calcula el color del semáforo para un expediente.
 *
 * Prioridad (gana la primera regla que matchea):
 * 1. Rojo   → no viable / rechazado / archivado / finalizado
 * 2. Verde  → tiene audiencia activa (pendiente/confirmada con fecha >= hoy)
 * 3. Amarillo → tiene tarea pendiente o en progreso
 * 4. Gris   → sin acción inmediata
 */
export function calcularSemaforo(exp: SemaforoInput): SemaforoColor {
  // Rojo: cancelado/rechazado o finalizado
  if (ESTADOS_ROJOS.has(exp.estado_interno)) {
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
  if (ESTADOS_ROJOS.has(card.estado_interno)) {
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

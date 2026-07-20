// ============================================================================
// Módulo daño punitivo (art. 52 bis LDC).
// Procedencia y cuantificación SEPARADAS: la cuantificación se habilita solo si
// se supera el umbral de procedencia. Cuatro métodos. Tope legal en CBT.
// ============================================================================

import {
  ESCALA_PUNITIVO, PUNITIVO_PISO_CBT, PUNITIVO_TECHO_CBT,
} from './constantes'
import type {
  ProcedenciaInput, ResultadoProcedencia,
  PunitivoInput, ResultadoPunitivo, ValoresReferencia,
} from './types'

/**
 * Evalúa la procedencia del daño punitivo. El incumplimiento simple NO habilita
 * por sí solo; hacen falta agravantes (gravedad + daño, o un agravante fuerte).
 */
export function evaluarProcedencia(input: ProcedenciaInput): ResultadoProcedencia {
  const motivos: string[] = []
  let peso = 0

  if (input.incumplimientoGraveConDano) { peso += 2; motivos.push('Incumplimiento grave con daño relevante') }
  if (input.reiteracion) { peso += 2; motivos.push('Reiteración o práctica') }
  if (input.tratoIndigno) { peso += 2; motivos.push('Trato indigno / desconsideración') }
  if (input.riesgoSalud) { peso += 3; motivos.push('Riesgo para la salud o seguridad') }
  if (input.vulnerabilidad) { peso += 1; motivos.push('Vulnerabilidad del consumidor') }
  if (input.beneficioIlicito) { peso += 1; motivos.push('Beneficio ilícito o ahorro de costos') }
  if (input.conductaProcesalObstructiva) { peso += 1; motivos.push('Conducta procesal obstructiva (art. 53 LDC)') }

  // Umbral: al menos un agravante fuerte (peso ≥ 2) habilita el análisis.
  const procede = peso >= 2
  if (!procede) motivos.push('No se supera el umbral: el incumplimiento simple no habilita la multa')
  return { procede, peso, motivos }
}

/**
 * Aplica límites legales en canastas. El techo (art. 47 inc. b LDC) rige para
 * todo método. El piso de 0,5 CBT sólo se fuerza en los métodos por escala
 * (canastas/prudencial); en los métodos económicos (Irigoyen, beneficio) un
 * resultado sub-piso se advierte pero no se altera, para no distorsionar la
 * lógica del método.
 */
function clampCanastas(
  canastas: number, advertencias: string[], aplicarPiso: boolean,
): { canastas: number; topeExcedido: boolean } {
  let topeExcedido = false
  let c = canastas
  if (c > PUNITIVO_TECHO_CBT) {
    topeExcedido = true
    advertencias.push(`Excede el tope legal de ${PUNITIVO_TECHO_CBT} CBT (art. 47 inc. b LDC); se recorta al máximo.`)
    c = PUNITIVO_TECHO_CBT
  }
  if (c > 0 && c < PUNITIVO_PISO_CBT) {
    if (aplicarPiso) {
      advertencias.push(`Por debajo del piso legal de ${PUNITIVO_PISO_CBT} CBT; se eleva al mínimo.`)
      c = PUNITIVO_PISO_CBT
    } else {
      advertencias.push(`El resultado es inferior al piso legal de ${PUNITIVO_PISO_CBT} CBT: evaluar si corresponde la multa.`)
    }
  }
  return { canastas: c, topeExcedido }
}

/**
 * Cuantifica el daño punitivo por el método elegido. Devuelve un rango en pesos.
 * Requiere `procede` (de evaluarProcedencia) para no cuantificar sin habilitación.
 */
export function cuantificarPunitivo(
  input: PunitivoInput,
  valores: Pick<ValoresReferencia, 'cbtHogar3'>,
  procede: boolean,
): ResultadoPunitivo {
  const advertencias: string[] = []
  const cbt = valores.cbtHogar3

  if (!procede) {
    return {
      procede: false, metodo: input.metodo,
      montoMin: 0, montoMax: 0, topeExcedido: false,
      advertencias: ['Cuantificación no habilitada: no se superó el umbral de procedencia.'],
    }
  }

  let canastasMin = 0
  let canastasMax = 0
  let multiploDC: number | undefined

  switch (input.metodo) {
    case 'canastas': {
      if (input.canastasManual != null) {
        canastasMin = canastasMax = input.canastasManual
      } else {
        const esc = ESCALA_PUNITIVO[input.nivel ?? 'media']
        canastasMin = esc.min
        canastasMax = esc.max
      }
      break
    }
    case 'irigoyen_testa': {
      const C = input.compensatorio ?? 0
      const Pc = input.probCondenaCompensatoria ?? 0
      const Pd = input.probCondenaPunitiva ?? 0
      if (C <= 0) {
        advertencias.push('Sin indemnización compensatoria (C), Irigoyen Testa no es aplicable. Use canastas o prudencial.')
        return { procede: true, metodo: input.metodo, montoMin: 0, montoMax: 0, topeExcedido: false, advertencias }
      }
      if (Pc <= 0 || Pc > 1 || Pd <= 0 || Pd > 1) {
        advertencias.push('Pc y Pd deben estar en (0, 1]. Revise las probabilidades.')
        return { procede: true, metodo: input.metodo, montoMin: 0, montoMax: 0, topeExcedido: false, advertencias }
      }
      const D = C * ((1 - Pc) / (Pc * Pd))
      multiploDC = D / C
      const canastas = cbt > 0 ? D / cbt : 0
      canastasMin = canastasMax = canastas
      advertencias.push('Método muy sensible a Pc/Pd: justifique ambas con ficha probatoria.')
      break
    }
    case 'beneficio_ilicito': {
      const beneficio = input.beneficioIlicito ?? 0
      const p = input.probSancion ?? 0
      if (beneficio <= 0 || p <= 0 || p > 1) {
        advertencias.push('Requiere beneficio ilícito > 0 y probabilidad de sanción en (0, 1].')
        return { procede: true, metodo: input.metodo, montoMin: 0, montoMax: 0, topeExcedido: false, advertencias }
      }
      // Monto que neutraliza la rentabilidad del incumplimiento.
      const D = beneficio / p
      const canastas = cbt > 0 ? D / cbt : 0
      canastasMin = canastasMax = canastas
      break
    }
    case 'prudencial': {
      const esc = ESCALA_PUNITIVO[input.nivel ?? 'media']
      canastasMin = input.canastasManual ?? esc.min
      canastasMax = input.canastasManual ?? esc.max
      break
    }
  }

  const aplicarPiso = input.metodo === 'canastas' || input.metodo === 'prudencial'
  const min = clampCanastas(canastasMin, advertencias, aplicarPiso)
  const max = clampCanastas(canastasMax, advertencias, aplicarPiso)
  const canastasMedio = (min.canastas + max.canastas) / 2

  return {
    procede: true,
    metodo: input.metodo,
    montoMin: min.canastas * cbt,
    montoMax: max.canastas * cbt,
    canastas: canastasMedio,
    multiploDC,
    topeExcedido: min.topeExcedido || max.topeExcedido,
    advertencias,
  }
}

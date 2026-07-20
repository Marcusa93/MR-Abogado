// ============================================================================
// Módulo intereses — segmentado (deuda de valor / punitivo).
// Tramo puro pre-valuación + tasa activa bancaria post-valuación, para evitar
// la doble actualización sobre montos ya llevados a valor de sentencia.
// ============================================================================

import { TASA_ACTIVA_DEFAULT, TASA_PURA_DEFAULT } from './constantes'
import type { InteresesInput, ResultadoIntereses } from './types'

/** Días entre dos fechas ISO (yyyy-mm-dd), no negativo. */
export function diasEntre(desde: string, hasta: string): number {
  const d0 = Date.parse(desde)
  const d1 = Date.parse(hasta)
  if (Number.isNaN(d0) || Number.isNaN(d1)) return 0
  return Math.max(0, Math.round((d1 - d0) / 86_400_000))
}

/** Interés simple: capital · tasaAnual · (días/365). */
function interesSimple(capital: number, tasaAnual: number, dias: number): number {
  return capital * tasaAnual * (dias / 365)
}

/**
 * Intereses segmentados. Para deuda de valor: interés puro desde la mora hasta
 * la valuación, luego tasa activa hasta el pago. Para punitivo: el tramo puro se
 * omite (corre desde firmeza/vencimiento con la tasa activa).
 */
export function calcularIntereses(input: InteresesInput): ResultadoIntereses {
  const tasaPura = input.tasaPura ?? TASA_PURA_DEFAULT
  const tasaActiva = input.tasaActiva ?? TASA_ACTIVA_DEFAULT

  const diasPuro = input.tipoRubro === 'deuda_de_valor'
    ? diasEntre(input.fechaInicio, input.fechaValuacion)
    : 0
  const diasActivo = input.tipoRubro === 'deuda_de_valor'
    ? diasEntre(input.fechaValuacion, input.fechaPago)
    : diasEntre(input.fechaInicio, input.fechaPago)

  const tramoPuro = interesSimple(input.capital, tasaPura, diasPuro)
  const tramoActivo = interesSimple(input.capital, tasaActiva, diasActivo)

  return {
    tramoPuro,
    tramoActivo,
    total: tramoPuro + tramoActivo,
    detalle: { diasPuro, diasActivo, tasaPura, tasaActiva },
  }
}
